using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Filee.Core.Domain;
using Filee.Core.Models;

namespace Filee.Core.Settings;

public class ToolbarSettingsDto
{
    [JsonPropertyName("profiles")]
    public List<ProfileDto>? Profiles { get; set; }

    [JsonPropertyName("selectedProfileId")]
    public string? SelectedProfileId { get; set; }

    [JsonPropertyName("reduceMotion")]
    public bool ReduceMotion { get; set; }
}

public class ProfileDto
{
    [JsonPropertyName("id")]
    public string? Id { get; set; }

    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("extensions")]
    public List<string>? Extensions { get; set; }

    [JsonPropertyName("wheel")]
    public List<PresetDto>? Wheel { get; set; }

    [JsonPropertyName("tray")]
    public List<PresetDto>? Tray { get; set; }
}

public class PresetDto
{
    [JsonPropertyName("id")]
    public string? Id { get; set; }

    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("targetFormat")]
    public string? TargetFormat { get; set; }

    [JsonPropertyName("size")]
    public string? Size { get; set; }

    [JsonPropertyName("quality")]
    public int? Quality { get; set; }

    [JsonPropertyName("saveLocation")]
    public string? SaveLocation { get; set; }

    [JsonPropertyName("customSavePath")]
    public string? CustomSavePath { get; set; }

    [JsonPropertyName("conflictPolicy")]
    public string? ConflictPolicy { get; set; }

    [JsonPropertyName("fileNamePattern")]
    public string? FileNamePattern { get; set; }

    [JsonPropertyName("keepExif")]
    public bool? KeepExif { get; set; }
}

public class DonutSettingsService : IDisposable
{
    private readonly string _settingsFilePath;
    private readonly object _lock = new();
    private Timer? _debounceTimer;
    private ToolbarSettingsDto? _pendingSettings;
    private bool _isDisposed;

    public DonutSettingsService(string? customPath = null)
    {
        if (!string.IsNullOrWhiteSpace(customPath))
        {
            _settingsFilePath = customPath;
        }
        else
        {
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            string dir = Path.Combine(appData, "Filee");
            Directory.CreateDirectory(dir);
            _settingsFilePath = Path.Combine(dir, "toolbar.settings.json");
        }
    }

    public (List<Profile> Profiles, string SelectedProfileId, bool ReduceMotion) Load()
    {
        lock (_lock)
        {
            var defaults = DefaultProfilesFactory.CreateDefaults();
            string defaultSelectedId = DefaultProfilesFactory.DefaultSelectedProfileId;

            if (!File.Exists(_settingsFilePath))
            {
                return (defaults, defaultSelectedId, false);
            }

            try
            {
                string json = File.ReadAllText(_settingsFilePath);
                var dto = JsonSerializer.Deserialize<ToolbarSettingsDto>(json);
                if (dto == null)
                {
                    return (defaults, defaultSelectedId, false);
                }

                return NormalizeAndValidate(dto, defaults, defaultSelectedId);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DonutSettingsService] Settings corrupted: {ex.Message}");
                // สำรองไฟล์เดิมเป็น .bak
                try
                {
                    string bakPath = _settingsFilePath + ".bak";
                    File.Copy(_settingsFilePath, bakPath, overwrite: true);
                }
                catch { }

                return (defaults, defaultSelectedId, false);
            }
        }
    }

    public void RequestSave(List<Profile> profiles, string selectedProfileId, bool reduceMotion, int debounceMs = 400)
    {
        lock (_lock)
        {
            if (_isDisposed) return;

            _pendingSettings = ToDto(profiles, selectedProfileId, reduceMotion);

            _debounceTimer?.Dispose();
            _debounceTimer = new Timer(_ =>
            {
                Flush();
            }, null, debounceMs, Timeout.Infinite);
        }
    }

    public void Flush()
    {
        ToolbarSettingsDto? dtoToSave;
        lock (_lock)
        {
            _debounceTimer?.Dispose();
            _debounceTimer = null;
            dtoToSave = _pendingSettings;
            _pendingSettings = null;
        }

        if (dtoToSave != null)
        {
            WriteSafely(dtoToSave);
        }
    }

    private void WriteSafely(ToolbarSettingsDto dto)
    {
        lock (_lock)
        {
            try
            {
                string? dir = Path.GetDirectoryName(_settingsFilePath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                string tmpPath = _settingsFilePath + ".tmp";
                var options = new JsonSerializerOptions { WriteIndented = true };
                string json = JsonSerializer.Serialize(dto, options);

                File.WriteAllText(tmpPath, json);

                // Atomic rename/replace
                if (File.Exists(_settingsFilePath))
                {
                    File.Move(tmpPath, _settingsFilePath, overwrite: true);
                }
                else
                {
                    File.Move(tmpPath, _settingsFilePath);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DonutSettingsService] Error saving settings: {ex.Message}");
            }
        }
    }

    public static ToolbarSettingsDto ToDto(List<Profile> profiles, string selectedProfileId, bool reduceMotion)
    {
        return new ToolbarSettingsDto
        {
            SelectedProfileId = selectedProfileId,
            ReduceMotion = reduceMotion,
            Profiles = profiles.Select(p => new ProfileDto
            {
                Id = p.Id,
                Name = p.Name,
                Extensions = p.Extensions.ToList(),
                Wheel = p.Wheel.Select(w => ToPresetDto(w)).ToList(),
                Tray = p.Tray.Select(t => ToPresetDto(t)).ToList()
            }).ToList()
        };
    }

    private static PresetDto ToPresetDto(Preset p)
    {
        return new PresetDto
        {
            Id = p.Id.ToString(),
            Name = p.Name,
            TargetFormat = p.TargetFormat.ToString(),
            Size = p.Size.ToString(),
            Quality = p.Quality,
            SaveLocation = p.SaveLocation.ToString(),
            CustomSavePath = p.CustomSavePath,
            ConflictPolicy = p.ConflictPolicy.ToString(),
            FileNamePattern = p.FileNamePattern,
            KeepExif = p.KeepExif
        };
    }

    public static (List<Profile> Profiles, string SelectedProfileId, bool ReduceMotion) NormalizeAndValidate(
        ToolbarSettingsDto dto, List<Profile> defaults, string fallbackSelectedId)
    {
        var profiles = new List<Profile>();

        if (dto.Profiles == null || dto.Profiles.Count == 0)
        {
            profiles = defaults;
        }
        else
        {
            foreach (var pDto in dto.Profiles)
            {
                if (pDto == null) continue;

                var profile = new Profile
                {
                    Id = !string.IsNullOrWhiteSpace(pDto.Id) ? pDto.Id : Guid.NewGuid().ToString("N"),
                    Name = !string.IsNullOrWhiteSpace(pDto.Name) ? pDto.Name.Trim() : "โปรไฟล์ใหม่",
                    Extensions = Profile.NormalizeExtensions(pDto.Extensions)
                };

                var usedIds = new HashSet<Guid>();

                // แปลง Wheel
                if (pDto.Wheel != null)
                {
                    foreach (var wDto in pDto.Wheel)
                    {
                        var preset = FromPresetDto(wDto);
                        if (usedIds.Add(preset.Id))
                        {
                            if (profile.Wheel.Count < ProfileDomainService.MaxWheelSlots)
                            {
                                profile.Wheel.Add(preset);
                            }
                            else
                            {
                                // ตัดส่วนเกินไปไว้ท้าย Tray
                                profile.Tray.Add(preset);
                            }
                        }
                    }
                }

                // แปลง Tray
                if (pDto.Tray != null)
                {
                    foreach (var tDto in pDto.Tray)
                    {
                        var preset = FromPresetDto(tDto);
                        if (usedIds.Add(preset.Id))
                        {
                            profile.Tray.Add(preset);
                        }
                    }
                }

                profiles.Add(profile);
            }
        }

        if (profiles.Count == 0)
            profiles = defaults;

        string selectedId = dto.SelectedProfileId ?? fallbackSelectedId;
        if (!profiles.Any(p => p.Id == selectedId))
        {
            selectedId = profiles[0].Id;
        }

        return (profiles, selectedId, dto.ReduceMotion);
    }

    private static Preset FromPresetDto(PresetDto dto)
    {
        Guid id = Guid.TryParse(dto.Id, out var g) ? g : Guid.NewGuid();
        string name = !string.IsNullOrWhiteSpace(dto.Name) ? dto.Name.Trim() : "พรีเซ็ต";

        var preset = Preset.Create(name, id);

        if (!string.IsNullOrWhiteSpace(dto.TargetFormat) &&
            Enum.TryParse<TargetFormat>(dto.TargetFormat, true, out var tf))
        {
            preset.TargetFormat = tf;
        }

        if (!string.IsNullOrWhiteSpace(dto.Size) &&
            Enum.TryParse<PresetSize>(dto.Size, true, out var ps))
        {
            preset.Size = ps;
        }

        if (dto.Quality.HasValue)
        {
            preset.Quality = dto.Quality.Value;
        }

        if (!string.IsNullOrWhiteSpace(dto.SaveLocation) &&
            Enum.TryParse<SaveLocationType>(dto.SaveLocation, true, out var sl))
        {
            preset.SaveLocation = sl;
        }

        preset.CustomSavePath = dto.CustomSavePath;

        if (!string.IsNullOrWhiteSpace(dto.ConflictPolicy) &&
            Enum.TryParse<ConflictPolicy>(dto.ConflictPolicy, true, out var cp))
        {
            preset.ConflictPolicy = cp;
        }

        if (dto.FileNamePattern != null)
        {
            preset.FileNamePattern = dto.FileNamePattern;
        }

        if (dto.KeepExif.HasValue)
        {
            preset.KeepExif = dto.KeepExif.Value;
        }

        return preset;
    }

    public void Dispose()
    {
        lock (_lock)
        {
            if (_isDisposed) return;
            _isDisposed = true;
            _debounceTimer?.Dispose();
            _debounceTimer = null;
        }
    }
}
