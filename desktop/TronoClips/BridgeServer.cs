using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
namespace TronoClips;
public sealed class BridgeServer : IAsyncDisposable
{
    public const int DefaultPort = 32196;
    public string Token { get; } = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
    public int Port => ((IPEndPoint)listener.LocalEndpoint).Port;
    private readonly TcpListener listener;
    private readonly CancellationTokenSource shutdown = new();
    private readonly Func<KeyBinding?, Task<object>> configure;
    private readonly Action<bool> connectionChanged;
    private readonly Action<int> saved;
    private readonly SemaphoreSlim sendLock = new(1, 1), slots = new(4, 4);
    private readonly object gate = new();
    private WebSocket? client;
    private Task? loop;
    public BridgeServer(Func<KeyBinding?, Task<object>> configure, Action<bool> connectionChanged, Action<int> saved, int port = DefaultPort)
    {
        this.configure = configure; this.connectionChanged = connectionChanged; this.saved = saved;
        listener = new TcpListener(IPAddress.Loopback, port);
    }
    public void Start() { listener.Start(); loop = Accept(); }
    private async Task Accept()
    {
        try { while (!shutdown.IsCancellationRequested) { var tcp = await listener.AcceptTcpClientAsync(shutdown.Token); if (!slots.Wait(0)) { tcp.Dispose(); continue; } _ = Serve(tcp); } }
        catch (OperationCanceledException) { } catch (SocketException) when (shutdown.IsCancellationRequested) { }
    }
    private static bool AllowedOrigin(string origin)
    {
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var u)) return false;
        return u.GetLeftPart(UriPartial.Authority) == "https://a-lei-do-trono.surge.sh" || (u.Scheme == "http" && u.IsLoopback);
    }
    private async Task Serve(TcpClient tcp)
    {
        WebSocket? socket = null;
        try
        {
            tcp.NoDelay = true;
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(shutdown.Token); timeout.CancelAfter(TimeSpan.FromSeconds(8));
            var stream = tcp.GetStream(); var header = new List<byte>(); byte[] one = new byte[1];
            while (header.Count < 8192)
            {
                if (await stream.ReadAsync(one, timeout.Token) == 0) return; header.Add(one[0]);
                int n = header.Count; if (n >= 4 && header[n-4] == 13 && header[n-3] == 10 && header[n-2] == 13 && header[n-1] == 10) break;
            }
            string[] lines = Encoding.ASCII.GetString(header.ToArray()).Split("\r\n");
            var fields = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var line in lines.Skip(1)) { int colon = line.IndexOf(':'); if (colon > 0) fields[line[..colon].Trim()] = line[(colon+1)..].Trim(); }
            bool Get(string name, string expected) => fields.TryGetValue(name, out var value) && value.Equals(expected, StringComparison.OrdinalIgnoreCase);
            bool valid = lines[0] == "GET /clips HTTP/1.1" && Get("Upgrade", "websocket") && Get("Sec-WebSocket-Version", "13") && fields.TryGetValue("Connection", out var conn) && conn.Split(',').Any(x => x.Trim().Equals("Upgrade", StringComparison.OrdinalIgnoreCase));
            if (!valid || !fields.TryGetValue("Origin", out var origin) || !AllowedOrigin(origin) || !fields.TryGetValue("Sec-WebSocket-Key", out var key) || Convert.FromBase64String(key).Length != 16)
            { await stream.WriteAsync(Encoding.ASCII.GetBytes("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"), timeout.Token); return; }
            var accept = Convert.ToBase64String(SHA1.HashData(Encoding.ASCII.GetBytes(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")));
            await stream.WriteAsync(Encoding.ASCII.GetBytes("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n"), timeout.Token);
            socket = WebSocket.CreateFromStream(stream, true, null, TimeSpan.FromSeconds(25));
            using var pair = await Read(socket, timeout.Token);
            if (pair is null || pair.RootElement.GetProperty("type").GetString() != "pair" || !pair.RootElement.TryGetProperty("token", out var token) || !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(token.GetString() ?? ""), Encoding.UTF8.GetBytes(Token)))
            { await socket.CloseAsync(WebSocketCloseStatus.PolicyViolation, "Código de conexão inválido", timeout.Token); return; }
            timeout.CancelAfter(Timeout.InfiniteTimeSpan);
            WebSocket? previous; lock (gate) { previous = client; client = socket; }
            previous?.Abort(); await configure(null); connectionChanged(true);
            await Send(socket, new { type = "paired" });
            while (socket.State == WebSocketState.Open && !shutdown.IsCancellationRequested)
            {
                using var doc = await Read(socket, shutdown.Token); if (doc is null) break;
                lock (gate) { if (client != socket) return; }
                try
                {
                    string? type = doc.RootElement.GetProperty("type").GetString();
                    if (type == "configure")
                    {
                        bool active = doc.RootElement.TryGetProperty("active", out var enabled) && enabled.ValueKind == JsonValueKind.True;
                        var binding = active ? KeyBinding.Parse(doc.RootElement.GetProperty("shortcut")) : null;
                        await Send(socket, await configure(binding));
                    }
                    else if (type == "saved" && doc.RootElement.TryGetProperty("count", out var count) && count.TryGetInt32(out var n) && n is >= 0 and <= 100000) saved(n);
                }
                catch (Exception e) when (e is ArgumentException or KeyNotFoundException or InvalidOperationException)
                { await configure(null); await Send(socket, new { type = "error", message = "Atalho inválido. Escolha outro nas preferências. " + e.Message }); }
            }
            if (socket.State == WebSocketState.CloseReceived)
                await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "Conexão encerrada", shutdown.Token);
        }
        catch (Exception e) when (e is IOException or SocketException or WebSocketException or OperationCanceledException or JsonException or FormatException or KeyNotFoundException or InvalidOperationException) { }
        finally
        {
            bool current; lock (gate) { current = socket != null && client == socket; if (current) client = null; }
            if (current) { await configure(null); connectionChanged(false); }
            socket?.Dispose(); tcp.Dispose(); slots.Release();
        }
    }
    private static async Task<JsonDocument?> Read(WebSocket socket, CancellationToken token)
    {
        var bytes = new byte[4096]; int used = 0;
        while (true) { var r = await socket.ReceiveAsync(new ArraySegment<byte>(bytes, used, bytes.Length-used), token); if (r.MessageType == WebSocketMessageType.Close) return null; if (r.MessageType != WebSocketMessageType.Text || (used += r.Count) >= bytes.Length) throw new JsonException("Mensagem inválida."); if (r.EndOfMessage) return JsonDocument.Parse(bytes.AsMemory(0, used)); }
    }
    private async Task Send(WebSocket socket, object data)
    {
        await sendLock.WaitAsync(shutdown.Token);
        try { if (socket.State == WebSocketState.Open) await socket.SendAsync(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(data)), WebSocketMessageType.Text, true, shutdown.Token); }
        finally { sendLock.Release(); }
    }
    public async Task Clip()
    {
        WebSocket? target; lock (gate) target = client;
        if (target == null) return;
        try { await Send(target, new { type = "clip", id = Guid.NewGuid().ToString() }); } catch (Exception e) when (e is WebSocketException or OperationCanceledException or ObjectDisposedException) { }
    }
    public async ValueTask DisposeAsync()
    {
        shutdown.Cancel(); listener.Stop(); lock (gate) client?.Abort();
        if (loop != null) await loop;
    }
}
