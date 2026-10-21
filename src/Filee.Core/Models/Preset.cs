using System;
using System.Text.RegularExpressions;

namespace Filee.Core.Models;

public class Preset
{
    private static readonly TargetFormat[] OrderedFormats =
    [
        TargetFormat.PNG,
        TargetFormat.JPG,
        TargetFormat.WEBP,
        TargetFormat.TIFF,
        TargetFormat.BMP,
        TargetFormat.ICO,
        TargetFormat.GIF,
        TargetFormat.AVIF,
        TargetFormat.PDF,
        TargetFormat.DOCX,
        TargetFormat.ODT,
        TargetFormat.HWPX,
        TargetFormat.TXT,
        TargetFormat.HTML,
        TargetFormat.RTF,
        TargetFormat.DOC,
        TargetFormat.MARKDOWN
    ];

    public Guid Id { get; init; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public TargetFormat TargetFormat { get; set; } = TargetFormat.PNG;
    public PresetSize Size { get; set; } = PresetSize.Original;

    private int _quality = 80;
    public int Quality
    {
        get => _quality;
        set => _quality = Math.Clamp(value, 10, 100);
    }

    public SaveLocationType SaveLocation { get; set; } = SaveLocationType.OriginalFolder;
    public string? CustomSavePath { get; set; }
    public ConflictPolicy ConflictPolicy { get; set; } = ConflictPolicy.AddNumber;
    public string FileNamePattern { get; set; } = "{name}_{preset}";
    public bool KeepExif { get; set; } = true;

    public static TargetFormat InferTargetFormat(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return TargetFormat.PNG;

        string upper = name.ToUpperInvariant();
        foreach (var format in OrderedFormats)
        {
            string token = format.ToString().ToUpperInvariant();
            if (upper.Contains(token, StringComparison.OrdinalIgnoreCase))
            {
                return format;
            }
        }

        return TargetFormat.PNG;
    }

    public static Preset Create(string name, Guid? id = null)
    {
        string trimmed = (name ?? string.Empty).Trim();
        var preset = new Preset
        {
            Id = id ?? Guid.NewGuid(),
            Name = trimmed,
            TargetFormat = InferTargetFormat(trimmed),
            Size = trimmed.Contains("50%", StringComparison.OrdinalIgnoreCase) ? PresetSize.Percent50 : PresetSize.Original,
            Quality = Regex.IsMatch(trimmed, @"JPG\s*70%", RegexOptions.IgnoreCase) ? 70 : 80,
            SaveLocation = SaveLocationType.OriginalFolder,
            ConflictPolicy = ConflictPolicy.AddNumber,
            FileNamePattern = "{name}_{preset}",
            KeepExif = true
        };

        return preset;
    }

    public Preset Clone()
    {
        return new Preset
        {
            Id = this.Id,
            Name = this.Name,
            TargetFormat = this.TargetFormat,
            Size = this.Size,
            Quality = this.Quality,
            SaveLocation = this.SaveLocation,
            CustomSavePath = this.CustomSavePath,
            ConflictPolicy = this.ConflictPolicy,
            FileNamePattern = this.FileNamePattern,
            KeepExif = this.KeepExif
        };
    }
}
