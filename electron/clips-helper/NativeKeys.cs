using System.Runtime.InteropServices;
namespace TronoClips;
public static class NativeKeys
{
    public const int Message = 0x0312, Id = 4913;
    [DllImport("user32.dll", SetLastError = true)] public static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint key);
    [DllImport("user32.dll", SetLastError = true)] public static extern bool UnregisterHotKey(IntPtr window, int id);
}
