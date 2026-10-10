using System.Text.Json;
namespace TronoClips;
public sealed record KeyBinding(uint Modifiers, uint Key, string Label)
{
    public static KeyBinding Parse(JsonElement value)
    {
        string code = value.GetProperty("code").GetString() ?? "";
        bool Flag(string name) => value.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.True;
        bool ctrl = Flag("ctrl"), alt = Flag("alt"), shift = Flag("shift"), meta = Flag("meta");
        uint key;
        string label;
        if (code.Length == 4 && code.StartsWith("Key") && code[3] is >= 'A' and <= 'Z') { key = code[3]; label = code[3].ToString(); }
        else if (code.Length == 6 && code.StartsWith("Digit") && code[5] is >= '0' and <= '9') { key = code[5]; label = code[5].ToString(); }
        else if (code.StartsWith('F') && int.TryParse(code[1..], out int f) && f is >= 1 and <= 24) { key = (uint)(0x70 + f - 1); label = "F" + f; }
        else throw new ArgumentException("Escolha Ctrl/Alt/Win com uma letra, número ou tecla F livre.");
        if ((!ctrl && !alt && !meta && key < 0x70) || key is 0x74 or 0x7A or 0x7B || (alt && key == 0x73) || ((ctrl || meta) && "RWTLNP".Contains((char)key)))
            throw new ArgumentException("Escolha um atalho que não seja reservado pelo navegador ou Windows.");
        uint mods = 0x4000U | (alt ? 1U : 0) | (ctrl ? 2U : 0) | (shift ? 4U : 0) | (meta ? 8U : 0);
        var names = new List<string>(); if (ctrl) names.Add("Ctrl"); if (alt) names.Add("Alt"); if (shift) names.Add("Shift"); if (meta) names.Add("Win"); names.Add(label);
        return new(mods, key, string.Join(" + ", names));
    }
}
