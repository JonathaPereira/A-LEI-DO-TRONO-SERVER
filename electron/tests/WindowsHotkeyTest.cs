using System.Diagnostics;
using System.Runtime.InteropServices;
using TronoClips;

// Exercise the Windows keyboard/message path, rather than just accepting a
// successful RegisterHotKey return. No browser window has to own keyboard focus.
internal static class WindowsHotkeyTest
{
    [StructLayout(LayoutKind.Explicit, Size = 40)]
    private struct Input
    {
        [FieldOffset(0)] public uint Type;
        [FieldOffset(8)] public ushort Key;
        [FieldOffset(12)] public uint Flags;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct Message
    {
        public IntPtr Handle;
        public uint Id;
        public UIntPtr WParam;
        public IntPtr LParam;
        public uint Time;
        public int X, Y;
        public uint Private;
    }
    [DllImport("user32.dll", SetLastError = true)] private static extern uint SendInput(uint count, Input[] inputs, int size);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool PeekMessage(out Message message, IntPtr window, uint min, uint max, uint flags);
    public static void Run()
    {
        PeekMessage(out _, IntPtr.Zero, 0, 0, 0);
        if (!NativeKeys.RegisterHotKey(IntPtr.Zero, NativeKeys.Id, 0x4006, 0x78)) throw new Exception("Windows RegisterHotKey failed");
        try
        {
            ushort[] keys = [0x11, 0x10, 0x78]; // Ctrl + Shift + F9
            Input[] inputs = keys.Select(k => new Input { Type = 1, Key = k }).Concat(keys.Reverse().Select(k => new Input { Type = 1, Key = k, Flags = 2 })).ToArray();
            if (SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<Input>()) != inputs.Length) throw new Exception("Windows keyboard input was not delivered");
            var timer = Stopwatch.StartNew();
            while (timer.ElapsedMilliseconds < 3000)
            {
                if (PeekMessage(out var message, IntPtr.Zero, NativeKeys.Message, NativeKeys.Message, 1) && message.WParam.ToUInt64() == NativeKeys.Id)
                { Console.WriteLine("PASS: Windows generated WM_HOTKEY from Ctrl + Shift + F9 without browser focus."); return; }
                Thread.Sleep(10);
            }
            throw new Exception("Windows did not generate WM_HOTKEY for the global shortcut");
        }
        finally { NativeKeys.UnregisterHotKey(IntPtr.Zero, NativeKeys.Id); }
    }
}
