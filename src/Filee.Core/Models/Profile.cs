using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace Filee.Core.Models;

public class Profile
{
    public string Id { get; init; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public List<string> Extensions { get; set; } = new();
    public ObservableCollection<Preset> Wheel { get; set; } = new();
    public ObservableCollection<Preset> Tray { get; set; } = new();

    public static List<string> NormalizeExtensions(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return new List<string>();

        var parts = text.Split(',', System.StringSplitOptions.RemoveEmptyEntries | System.StringSplitOptions.TrimEntries);
        var set = new HashSet<string>(System.StringComparer.OrdinalIgnoreCase);
        var result = new List<string>();

        foreach (var part in parts)
        {
            string clean = part.Trim().TrimStart('.').ToLowerInvariant();
            if (!string.IsNullOrEmpty(clean) && set.Add(clean))
            {
                result.Add(clean);
            }
        }

        return result;
    }

    public static List<string> NormalizeExtensions(IEnumerable<string>? extensions)
    {
        if (extensions == null) return new List<string>();
        var set = new HashSet<string>(System.StringComparer.OrdinalIgnoreCase);
        var result = new List<string>();

        foreach (var ext in extensions)
        {
            if (string.IsNullOrWhiteSpace(ext)) continue;
            string clean = ext.Trim().TrimStart('.').ToLowerInvariant();
            if (!string.IsNullOrEmpty(clean) && set.Add(clean))
            {
                result.Add(clean);
            }
        }

        return result;
    }
}
