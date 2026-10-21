using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Filee.Core.Models;

namespace Filee.Core.Domain;

public class ProfileDomainService
{
    public const int MaxWheelSlots = 12;

    public OperationResult AddToWheel(Profile profile, Guid presetId, int? targetIndex = null)
    {
        if (profile == null) throw new ArgumentNullException(nameof(profile));

        var preset = profile.Tray.FirstOrDefault(p => p.Id == presetId);
        if (preset == null)
        {
            return OperationResult.Fail(OperationErrorCode.PresetNotFound, "ไม่พบพรีเซ็ตในถาด");
        }

        if (profile.Wheel.Count >= MaxWheelSlots)
        {
            return OperationResult.WheelFull();
        }

        profile.Tray.Remove(preset);

        if (!targetIndex.HasValue || targetIndex.Value >= profile.Wheel.Count)
        {
            profile.Wheel.Add(preset);
        }
        else
        {
            int index = Math.Max(0, targetIndex.Value);
            profile.Wheel.Insert(index, preset);
        }

        return OperationResult.Ok();
    }

    public OperationResult MoveToTray(Profile profile, Guid presetId)
    {
        if (profile == null) throw new ArgumentNullException(nameof(profile));

        var preset = profile.Wheel.FirstOrDefault(p => p.Id == presetId);
        if (preset == null)
        {
            return OperationResult.Fail(OperationErrorCode.PresetNotFound, "ไม่พบพรีเซ็ตในวงล้อ");
        }

        profile.Wheel.Remove(preset);
        profile.Tray.Add(preset);
        return OperationResult.Ok();
    }

    public OperationResult MoveWithinWheel(Profile profile, int fromIndex, int toIndex)
    {
        if (profile == null) throw new ArgumentNullException(nameof(profile));

        if (fromIndex < 0 || fromIndex >= profile.Wheel.Count)
            return OperationResult.Fail(OperationErrorCode.InvalidIndex, "ดัชนีต้นทางไม่อยู่ในช่วง");

        if (toIndex < 0 || toIndex >= profile.Wheel.Count)
            return OperationResult.Fail(OperationErrorCode.InvalidIndex, "ดัชนีปลายทางไม่อยู่ในช่วง");

        if (fromIndex == toIndex)
            return OperationResult.Ok();

        var item = profile.Wheel[fromIndex];
        profile.Wheel.RemoveAt(fromIndex);
        profile.Wheel.Insert(toIndex, item);

        return OperationResult.Ok();
    }

    public OperationResult ValidatePresetName(Profile profile, Guid presetId, string newName)
    {
        if (profile == null) throw new ArgumentNullException(nameof(profile));

        string trimmed = (newName ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return OperationResult.Fail(OperationErrorCode.InvalidNameEmpty, "กรุณากรอกชื่อ");
        }

        bool duplicate = profile.Wheel.Concat(profile.Tray)
            .Any(p => p.Id != presetId && string.Equals(p.Name, trimmed, StringComparison.OrdinalIgnoreCase));

        if (duplicate)
        {
            return OperationResult.Fail(OperationErrorCode.DuplicateName, "มีชื่อพรีเซ็ตนี้อยู่แล้ว");
        }

        return OperationResult.Ok();
    }

    public OperationResult UpdatePreset(Profile profile, Guid presetId, Preset updatedDetails)
    {
        if (profile == null) throw new ArgumentNullException(nameof(profile));
        if (updatedDetails == null) throw new ArgumentNullException(nameof(updatedDetails));

        var validation = ValidatePresetName(profile, presetId, updatedDetails.Name);
        if (!validation.Success)
            return validation;

        var existing = profile.Wheel.Concat(profile.Tray).FirstOrDefault(p => p.Id == presetId);
        if (existing == null)
            return OperationResult.Fail(OperationErrorCode.PresetNotFound, "ไม่พบพรีเซ็ตที่ต้องการแก้ไข");

        // อัปเดตแบบ Atomic
        existing.Name = updatedDetails.Name.Trim();
        existing.TargetFormat = updatedDetails.TargetFormat;
        existing.Size = updatedDetails.Size;
        existing.Quality = updatedDetails.Quality;
        existing.SaveLocation = updatedDetails.SaveLocation;
        existing.CustomSavePath = updatedDetails.CustomSavePath;
        existing.ConflictPolicy = updatedDetails.ConflictPolicy;
        existing.FileNamePattern = updatedDetails.FileNamePattern;
        existing.KeepExif = updatedDetails.KeepExif;

        return OperationResult.Ok();
    }

    public Profile AddProfile(ICollection<Profile> profiles)
    {
        if (profiles == null) throw new ArgumentNullException(nameof(profiles));

        int maxN = 0;
        var regex = new Regex(@"^โปรไฟล์ใหม่\s*(\d+)$", RegexOptions.IgnoreCase);

        foreach (var p in profiles)
        {
            var match = regex.Match(p.Name?.Trim() ?? string.Empty);
            if (match.Success && int.TryParse(match.Groups[1].Value, out int n))
            {
                if (n > maxN) maxN = n;
            }
        }

        int newN = maxN + 1;
        var newProfile = new Profile
        {
            Id = $"custom_{newN}_{Guid.NewGuid():N}",
            Name = $"โปรไฟล์ใหม่ {newN}",
            Extensions = new List<string>() // ว่าง (UI แสดง "(แก้ไขได้)")
        };

        // Tray = PNG, JPG, PDF, WEBP, TXT, DOCX
        string[] defaultTray = ["PNG", "JPG", "PDF", "WEBP", "TXT", "DOCX"];
        foreach (var name in defaultTray)
        {
            newProfile.Tray.Add(Preset.Create(name));
        }

        profiles.Add(newProfile);
        return newProfile;
    }

    public void SetExtensions(Profile profile, string text)
    {
        if (profile == null) throw new ArgumentNullException(nameof(profile));
        profile.Extensions = Profile.NormalizeExtensions(text);
    }
}
