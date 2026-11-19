using System.Diagnostics;
namespace TronoClips;
internal static class Program
{
    [STAThread] static void Main()
    {
        using var mutex = new Mutex(true, "Local\\MNClipesGlobalShortcut", out bool first);
        if (!first) { MessageBox.Show("O M&N Clipes já está aberto. Procure o ícone na bandeja do Windows.", "M&N Clipes"); return; }
        ApplicationConfiguration.Initialize(); Application.Run(new ClipsForm());
    }
}
public sealed class ClipsForm : Form
{
    public BridgeServer Bridge { get; }
    private readonly Label state = new(), pending = new();
    private readonly NotifyIcon tray = new();
    private bool registered, quitting;
    public ClipsForm()
    {
        Text = "M&N · Clipes Windows"; ClientSize = new Size(540, 370); MinimumSize = Size; MaximizeBox = false;
        BackColor = Color.FromArgb(19, 22, 32); ForeColor = Color.FromArgb(235, 236, 248); Font = new Font("Segoe UI", 10); StartPosition = FormStartPosition.CenterScreen;
        var title = new Label { Text = "Clipes durante o jogo", Font = new Font("Segoe UI", 21, FontStyle.Bold), Location = new Point(24, 22), AutoSize = true };
        var help = new Label { Text = "1. Abra seu chat e compartilhe a tela com áudio.\n2. Em Meus clipes → Preferências, conecte este código.\n3. Use o atalho sem tirar o foco do jogo.", Location = new Point(26, 79), Size = new Size(490, 77) };
        Bridge = new BridgeServer(Configure, connected => Ui(() => { if (!connected) state.Text = "Chat desconectado · conecte no site para habilitar o atalho."; }), count => Ui(() => { pending.Text = count + " clipes pendentes no navegador"; tray.Text = "M&N Clipes · " + count + " pendentes"; }));
        var code = new TextBox { ReadOnly = true, Text = Bridge.Token, Location = new Point(26, 163), Size = new Size(485, 28), BackColor = Color.FromArgb(32, 36, 52), ForeColor = ForeColor, BorderStyle = BorderStyle.FixedSingle, Font = new Font("Consolas", 9) };
        var copy = Button("Copiar código", 26, 205); copy.Click += (_, _) => Clipboard.SetText(Bridge.Token);
        var open = Button("Abrir chat", 197, 205); open.Click += (_, _) => Process.Start(new ProcessStartInfo("https://a-lei-do-trono.surge.sh/#clips-desktop=" + Bridge.Token) { UseShellExecute = true });
        state.Location = new Point(26, 264); state.Size = new Size(480, 49); state.Text = "Aguardando conexão do chat · o aplicativo precisa ficar aberto.";
        pending.Location = new Point(26, 324); pending.Size = new Size(480, 24); pending.Text = "Vídeos e buffer ficam no navegador; este app recebe só o atalho.";
        Controls.AddRange([title, help, code, copy, open, state, pending]);
        var menu = new ContextMenuStrip(); menu.Items.Add("Abrir M&N Clipes", null, (_, _) => { Show(); WindowState = FormWindowState.Normal; Activate(); }); menu.Items.Add("Sair", null, (_, _) => { quitting = true; Close(); });
        tray.Icon = SystemIcons.Application; tray.Text = "M&N Clipes · aguardando chat"; tray.Visible = true; tray.ContextMenuStrip = menu; tray.DoubleClick += (_, _) => { Show(); WindowState = FormWindowState.Normal; Activate(); };
        Load += (_, _) => { try { Bridge.Start(); } catch (Exception e) { state.Text = "Não foi possível iniciar a conexão local: " + e.Message; } };
        FormClosing += (_, e) => { if (!quitting && e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Hide(); return; } if (registered) NativeKeys.UnregisterHotKey(Handle, NativeKeys.Id); tray.Dispose(); _ = Bridge.DisposeAsync(); };
    }
    private Button Button(string text, int x, int y) => new() { Text = text, Location = new Point(x, y), Size = new Size(158, 36), FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(58, 46, 85), ForeColor = ForeColor };
    private void Ui(Action action) { if (!IsDisposed && IsHandleCreated) { try { BeginInvoke(action); } catch (InvalidOperationException) { } } }
    private Task<object> Configure(KeyBinding? binding)
    {
        var completion = new TaskCompletionSource<object>(TaskCreationOptions.RunContinuationsAsynchronously);
        if (IsDisposed) { completion.SetResult(new { type = "registered", active = false, shortcut = "" }); return completion.Task; }
        Ui(() => {
            if (registered) { NativeKeys.UnregisterHotKey(Handle, NativeKeys.Id); registered = false; }
            if (binding != null) registered = NativeKeys.RegisterHotKey(Handle, NativeKeys.Id, binding.Modifiers, binding.Key);
            if (binding != null && !registered) { state.Text = "Atalho ocupado por outro aplicativo. Escolha outro no chat."; completion.SetResult(new { type = "error", message = state.Text }); }
            else { state.Text = registered ? "Atalho global ativo: " + binding!.Label + " · continue no jogo." : "Chat conectado · aguardando o replay ficar ativo."; completion.SetResult(new { type = "registered", active = registered, shortcut = binding?.Label ?? "" }); }
        }); return completion.Task;
    }
    protected override void WndProc(ref Message m)
    {
        if (m.Msg == NativeKeys.Message && m.WParam.ToInt32() == NativeKeys.Id && registered) _ = Bridge.Clip();
        base.WndProc(ref m);
    }
}
