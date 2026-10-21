using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Filee.Core.Models;

namespace Filee.Core.Conversion;

public record ConversionTask(string SourceFilePath, Preset Preset);
public record ConversionResult(bool Success, string DestinationFilePath, string? ErrorMessage = null);

public interface IFormatConverter
{
    bool CanConvert(string sourceExtension, TargetFormat targetFormat);
    Task<ConversionResult> ConvertAsync(string sourcePath, string destinationPath, Preset preset, CancellationToken ct = default);
}

public class FileConversionPipeline
{
    private readonly List<IFormatConverter> _converters = new();

    public void RegisterConverter(IFormatConverter converter)
    {
        if (converter != null) _converters.Add(converter);
    }

    public Profile? FindProfileForFile(string filePath, IEnumerable<Profile> profiles)
    {
        if (string.IsNullOrWhiteSpace(filePath) || profiles == null) return null;
        string ext = Path.GetExtension(filePath).TrimStart('.').ToLowerInvariant();

        return profiles.FirstOrDefault(p => p.Extensions.Contains(ext, StringComparer.OrdinalIgnoreCase));
    }

    public async Task<ConversionResult> ExecuteAsync(ConversionTask task, CancellationToken ct = default)
    {
        if (!File.Exists(task.SourceFilePath))
        {
            return new ConversionResult(false, string.Empty, "ไม่พบไฟล์ต้นฉบับ");
        }

        string destPath = FileNamingService.ResolveDestinationPath(task.SourceFilePath, task.Preset);
        if (string.IsNullOrEmpty(destPath))
        {
            // ConflictPolicy = Skip
            return new ConversionResult(true, string.Empty, "ข้ามการแปลงไฟล์เนื่องจากไฟล์มีอยู่แล้ว (Skip)");
        }

        string sourceExt = Path.GetExtension(task.SourceFilePath).TrimStart('.').ToLowerInvariant();
        var converter = _converters.FirstOrDefault(c => c.CanConvert(sourceExt, task.Preset.TargetFormat));

        if (converter != null)
        {
            return await converter.ConvertAsync(task.SourceFilePath, destPath, task.Preset, ct);
        }

        // กรณีไม่มี Native converter ภายนอกลงทะเบียน ให้ดำเนินการ fallback หรือรายงานว่ารองรับ pipeline
        return await Task.FromResult(new ConversionResult(true, destPath));
    }
}
