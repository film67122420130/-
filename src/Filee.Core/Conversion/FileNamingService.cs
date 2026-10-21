using System;
using System.IO;
using System.Text.RegularExpressions;
using Filee.Core.Models;

namespace Filee.Core.Conversion;

public static class FileNamingService
{
    private static readonly char[] InvalidFileNameChars = Path.GetInvalidFileNameChars();

    public static string FormatFileName(string originalFilePath, Preset preset)
    {
        string rawName = Path.GetFileNameWithoutExtension(originalFilePath);
        string pattern = string.IsNullOrWhiteSpace(preset.FileNamePattern)
            ? "{name}_{preset}"
            : preset.FileNamePattern;

        string formatted = pattern
            .Replace("{name}", rawName, StringComparison.OrdinalIgnoreCase)
            .Replace("{preset}", preset.Name, StringComparison.OrdinalIgnoreCase);

        // ตัดอักขระที่ใช้เป็นชื่อไฟล์ไม่ได้ (\ / : * ? " < > |)
        foreach (char c in InvalidFileNameChars)
        {
            formatted = formatted.Replace(c.ToString(), string.Empty);
        }

        return string.IsNullOrWhiteSpace(formatted) ? rawName : formatted;
    }

    public static string ResolveDestinationPath(string sourceFilePath, Preset preset)
    {
        string baseDir = preset.SaveLocation switch
        {
            SaveLocationType.SubFolder => Path.Combine(Path.GetDirectoryName(sourceFilePath) ?? string.Empty, "แปลงแล้ว"),
            SaveLocationType.CustomFolder => !string.IsNullOrWhiteSpace(preset.CustomSavePath)
                ? preset.CustomSavePath
                : (Path.GetDirectoryName(sourceFilePath) ?? string.Empty),
            _ => Path.GetDirectoryName(sourceFilePath) ?? string.Empty
        };

        if (!Directory.Exists(baseDir))
        {
            Directory.CreateDirectory(baseDir);
        }

        string baseFileName = FormatFileName(sourceFilePath, preset);
        string ext = GetExtensionForTargetFormat(preset.TargetFormat);
        string candidate = Path.Combine(baseDir, $"{baseFileName}{ext}");

        if (!File.Exists(candidate))
        {
            return candidate;
        }

        // จัดการ ConflictPolicy
        return preset.ConflictPolicy switch
        {
            ConflictPolicy.Overwrite => candidate,
            ConflictPolicy.Skip => string.Empty, // ส่งสตริงว่างเพื่อบอกว่าให้ข้ามการแปลง
            ConflictPolicy.AddNumber => GenerateNumberedPath(baseDir, baseFileName, ext),
            _ => candidate
        };
    }

    public static string GenerateNumberedPath(string baseDir, string baseFileName, string ext)
    {
        int counter = 2;
        while (true)
        {
            string candidate = Path.Combine(baseDir, $"{baseFileName} ({counter}){ext}");
            if (!File.Exists(candidate))
            {
                return candidate;
            }
            counter++;
        }
    }

    public static string GetExtensionForTargetFormat(TargetFormat format)
    {
        return format switch
        {
            TargetFormat.PNG => ".png",
            TargetFormat.JPG => ".jpg",
            TargetFormat.WEBP => ".webp",
            TargetFormat.TIFF => ".tiff",
            TargetFormat.BMP => ".bmp",
            TargetFormat.ICO => ".ico",
            TargetFormat.GIF => ".gif",
            TargetFormat.AVIF => ".avif",
            TargetFormat.PDF => ".pdf",
            TargetFormat.DOCX => ".docx",
            TargetFormat.ODT => ".odt",
            TargetFormat.HWPX => ".hwpx",
            TargetFormat.TXT => ".txt",
            TargetFormat.HTML => ".html",
            TargetFormat.RTF => ".rtf",
            TargetFormat.DOC => ".doc",
            TargetFormat.MARKDOWN => ".md",
            _ => ".bin"
        };
    }
}
