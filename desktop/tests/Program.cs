using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using TronoClips;
static void Check(bool value, string message) { if (!value) throw new Exception(message); }
static async Task Send(ClientWebSocket ws, object message) => await ws.SendAsync(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(message)), WebSocketMessageType.Text, true, CancellationToken.None);
static async Task<JsonDocument> Read(ClientWebSocket ws) { var data = new byte[4096]; using var timeout = new CancellationTokenSource(5000); var r = await ws.ReceiveAsync(data, timeout.Token); return JsonDocument.Parse(data.AsMemory(0, r.Count)); }
static ClientWebSocket Client(string origin) { var ws = new ClientWebSocket(); ws.Options.SetRequestHeader("Origin", origin); return ws; }
KeyBinding? current = null; int saved = 0;
await using var server = new BridgeServer(binding => { current = binding; return Task.FromResult<object>(new { type = "registered", active = binding != null, shortcut = binding?.Label ?? "" }); }, _ => { }, count => saved = count, 0); server.Start();
var url = new Uri("ws://127.0.0.1:" + server.Port + "/clips");
using (var bad = Client("https://other-site.example")) { try { await bad.ConnectAsync(url, CancellationToken.None); throw new Exception("Untrusted origin was accepted"); } catch (WebSocketException) { } }
using (var bad = Client("https://a-lei-do-trono.surge.sh")) { await bad.ConnectAsync(url, CancellationToken.None); await Send(bad, new { type = "pair", token = new string('0', 64) }); var bytes = new byte[256]; var r = await bad.ReceiveAsync(bytes, CancellationToken.None); Check(r.MessageType == WebSocketMessageType.Close, "Wrong pairing token accepted"); }
using var ws = Client("https://a-lei-do-trono.surge.sh"); await ws.ConnectAsync(url, CancellationToken.None); await Send(ws, new { type = "pair", token = server.Token }); using (var paired = await Read(ws)) Check(paired.RootElement.GetProperty("type").GetString() == "paired", "Pairing failed");
var shortcut = new { code = "KeyX", ctrl = true, shift = true, alt = false, meta = false };
await Send(ws, new { type = "configure", active = true, shortcut }); using (var config = await Read(ws)) Check(config.RootElement.GetProperty("active").GetBoolean(), "Configure failed"); Check(current?.Key == 88 && current.Modifiers == 0x4006, "Windows modifier/key mapping incorrect");
await server.Clip(); using (var clip = await Read(ws)) Check(clip.RootElement.GetProperty("type").GetString() == "clip" && Guid.TryParse(clip.RootElement.GetProperty("id").GetString(), out _), "Clip event missing");
await Send(ws, new { type = "configure", active = true, shortcut = new { code = "F5", ctrl = true } }); using (var invalid = await Read(ws)) Check(invalid.RootElement.GetProperty("type").GetString() == "error" && current == null, "Invalid configuration did not release the previous hotkey");
await Send(ws, new { type = "saved", count = 3 }); await Task.Delay(100); Check(saved == 3, "Saved count missing");
await Send(ws, new { type = "configure", active = false, shortcut }); using (var config = await Read(ws)) Check(!config.RootElement.GetProperty("active").GetBoolean() && current == null, "Hotkey not released on stop");
foreach (var code in new[] { "F5", "F11", "KeyR", "F25", "AudioVolumeUp" }) { using var doc = JsonDocument.Parse(JsonSerializer.Serialize(new { code, ctrl = true })); try { KeyBinding.Parse(doc.RootElement); throw new Exception("Reserved key accepted " + code); } catch (ArgumentException) { } }
if (OperatingSystem.IsWindows()) WindowsHotkeyTest.Run();
await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", CancellationToken.None);
Console.WriteLine("PASS: origin restrictions, pairing, shortcut mapping, events, save feedback, disable and reserved keys; native hotkey delivery checked when running on Windows.");
