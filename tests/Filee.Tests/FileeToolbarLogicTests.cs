using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using Filee.App.ViewModels;
using Filee.Core.Conversion;
using Filee.Core.Domain;
using Filee.Core.Geometry;
using Filee.Core.Models;
using Filee.Core.Settings;
using Xunit;

namespace Filee.Tests;

public class FileeToolbarLogicTests
{
    private readonly ProfileDomainService _service = new();

    #region 1. AddToWheel Tests

    [Fact]
    public void AddToWheel_AppendsToEnd_WhenTargetIndexIsNull()
    {
        var profile = new Profile();
        var p1 = Preset.Create("A");
        var p2 = Preset.Create("B");
        var p3 = Preset.Create("C");
        profile.Wheel.Add(p1);
        profile.Wheel.Add(p2);
        profile.Tray.Add(p3);

        var result = _service.AddToWheel(profile, p3.Id, targetIndex: null);

        Assert.True(result.Success);
        Assert.Equal(3, profile.Wheel.Count);
        Assert.Equal("C", profile.Wheel[2].Name);
        Assert.Empty(profile.Tray);
    }

    [Fact]
    public void AddToWheel_InsertsAtMiddle()
    {
        var profile = new Profile();
        var a = Preset.Create("A");
        var b = Preset.Create("B");
        var c = Preset.Create("C");
        var x = Preset.Create("X");

        profile.Wheel.Add(a);
        profile.Wheel.Add(b);
        profile.Wheel.Add(c);
        profile.Tray.Add(x);

        // แทรก X ที่ 1 ใน [A,B,C] -> [A,X,B,C]
        var result = _service.AddToWheel(profile, x.Id, targetIndex: 1);

        Assert.True(result.Success);
        Assert.Equal(4, profile.Wheel.Count);
        Assert.Equal(new[] { "A", "X", "B", "C" }, profile.Wheel.Select(p => p.Name));
        Assert.Empty(profile.Tray);
    }

    [Fact]
    public void AddToWheel_WhenFull_ReturnsWheelFull_AndStateUnchanged()
    {
        var profile = new Profile();
        for (int i = 0; i < 12; i++)
        {
            profile.Wheel.Add(Preset.Create($"Preset {i + 1}"));
        }

        var extra = Preset.Create("Extra");
        profile.Tray.Add(extra);

        var result = _service.AddToWheel(profile, extra.Id, targetIndex: null);

        Assert.False(result.Success);
        Assert.Equal(OperationErrorCode.WheelFull, result.ErrorCode);
        Assert.Equal("เพิ่มได้สูงสุด 12 รายการ", result.ErrorMessage);
        Assert.Equal(12, profile.Wheel.Count);
        Assert.Single(profile.Tray);
    }

    #endregion

    #region 2. MoveWithinWheel Tests

    [Fact]
    public void MoveWithinWheel_Moves0To2_Correctly()
    {
        var profile = new Profile();
        var a = Preset.Create("A");
        var b = Preset.Create("B");
        var c = Preset.Create("C");
        var d = Preset.Create("D");
        profile.Wheel.Add(a);
        profile.Wheel.Add(b);
        profile.Wheel.Add(c);
        profile.Wheel.Add(d);

        // ย้าย A(0) -> 2 ได้ [B, C, A, D]
        var result = _service.MoveWithinWheel(profile, 0, 2);

        Assert.True(result.Success);
        Assert.Equal(new[] { "B", "C", "A", "D" }, profile.Wheel.Select(p => p.Name));
    }

    [Fact]
    public void MoveWithinWheel_Moves3To1_Correctly()
    {
        var profile = new Profile();
        var a = Preset.Create("A");
        var b = Preset.Create("B");
        var c = Preset.Create("C");
        var d = Preset.Create("D");
        profile.Wheel.Add(a);
        profile.Wheel.Add(b);
        profile.Wheel.Add(c);
        profile.Wheel.Add(d);

        // ย้าย D(3) -> 1 ได้ [A, D, B, C]
        var result = _service.MoveWithinWheel(profile, 3, 1);

        Assert.True(result.Success);
        Assert.Equal(new[] { "A", "D", "B", "C" }, profile.Wheel.Select(p => p.Name));
    }

    [Fact]
    public void MoveWithinWheel_SameIndex_DoesNothing()
    {
        var profile = new Profile();
        var a = Preset.Create("A");
        var b = Preset.Create("B");
        profile.Wheel.Add(a);
        profile.Wheel.Add(b);

        var result = _service.MoveWithinWheel(profile, 1, 1);

        Assert.True(result.Success);
        Assert.Equal(new[] { "A", "B" }, profile.Wheel.Select(p => p.Name));
    }

    #endregion

    #region 3. MoveToTray Tests

    [Fact]
    public void MoveToTray_AppendsToEndOfTray()
    {
        var profile = new Profile();
        var a = Preset.Create("A");
        var b = Preset.Create("B");
        var t = Preset.Create("ExistingTray");
        profile.Wheel.Add(a);
        profile.Wheel.Add(b);
        profile.Tray.Add(t);

        var result = _service.MoveToTray(profile, a.Id);

        Assert.True(result.Success);
        Assert.Single(profile.Wheel);
        Assert.Equal("B", profile.Wheel[0].Name);
        Assert.Equal(2, profile.Tray.Count);
        Assert.Equal(new[] { "ExistingTray", "A" }, profile.Tray.Select(p => p.Name));
    }

    #endregion

    #region 4. ValidateName Tests

    [Fact]
    public void ValidateName_EmptyOrWhitespace_Fails()
    {
        var profile = new Profile();
        var a = Preset.Create("A");
        profile.Wheel.Add(a);

        var result1 = _service.ValidatePresetName(profile, a.Id, "");
        var result2 = _service.ValidatePresetName(profile, a.Id, "   ");

        Assert.False(result1.Success);
        Assert.Equal("กรุณากรอกชื่อ", result1.ErrorMessage);
        Assert.False(result2.Success);
        Assert.Equal("กรุณากรอกชื่อ", result2.ErrorMessage);
    }

    [Fact]
    public void ValidateName_DuplicateInWheelOrTray_Fails()
    {
        var profile = new Profile();
        var a = Preset.Create("Alpha");
        var b = Preset.Create("Beta");
        var c = Preset.Create("Gamma");
        profile.Wheel.Add(a);
        profile.Wheel.Add(b);
        profile.Tray.Add(c);

        var dupWheel = _service.ValidatePresetName(profile, a.Id, "Beta");
        var dupTray = _service.ValidatePresetName(profile, a.Id, "gamma");

        Assert.False(dupWheel.Success);
        Assert.Equal("มีชื่อพรีเซ็ตนี้อยู่แล้ว", dupWheel.ErrorMessage);
        Assert.False(dupTray.Success);
        Assert.Equal("มีชื่อพรีเซ็ตนี้อยู่แล้ว", dupTray.ErrorMessage);
    }

    [Fact]
    public void ValidateName_SameExistingNameForSelf_Passes()
    {
        var profile = new Profile();
        var a = Preset.Create("Alpha");
        profile.Wheel.Add(a);

        var result = _service.ValidatePresetName(profile, a.Id, "Alpha");
        Assert.True(result.Success);
    }

    #endregion

    #region 5. UpdatePreset Tests

    [Fact]
    public void UpdatePreset_Atomic_FailsWithoutPartialModifications()
    {
        var profile = new Profile();
        var a = Preset.Create("Alpha");
        a.Quality = 85;
        var b = Preset.Create("Beta");
        profile.Wheel.Add(a);
        profile.Wheel.Add(b);

        var badUpdate = new Preset { Name = "Beta", Quality = 50 }; // ชื่อซ้ำ
        var result = _service.UpdatePreset(profile, a.Id, badUpdate);

        Assert.False(result.Success);
        Assert.Equal("Alpha", a.Name);
        Assert.Equal(85, a.Quality); // ไม่ถูกแก้บางส่วน
    }

    [Fact]
    public void UpdatePreset_RenamingPreservesConfigurationOptions()
    {
        var profile = new Profile();
        var a = Preset.Create("Alpha");
        a.Quality = 92;
        a.TargetFormat = TargetFormat.WEBP;
        a.Size = PresetSize.LongSide1920;
        profile.Wheel.Add(a);

        var validUpdate = a.Clone();
        validUpdate.Name = "AlphaRenamed";

        var result = _service.UpdatePreset(profile, a.Id, validUpdate);

        Assert.True(result.Success);
        Assert.Equal("AlphaRenamed", a.Name);
        Assert.Equal(92, a.Quality);
        Assert.Equal(TargetFormat.WEBP, a.TargetFormat);
        Assert.Equal(PresetSize.LongSide1920, a.Size);
    }

    #endregion

    #region 6. TargetFormat & Preset Name Inference Tests

    [Theory]
    [InlineData("DOCX", TargetFormat.DOCX)]
    [InlineData("PDF/A", TargetFormat.PDF)]
    [InlineData("PNG ขาวดำ", TargetFormat.PNG)]
    [InlineData("JPG 150 dpi", TargetFormat.JPG)]
    [InlineData("Markdown", TargetFormat.MARKDOWN)]
    [InlineData("ย่อ 50%", TargetFormat.PNG)] // ไม่มีชื่อฟอร์แมตในคำ -> fallback PNG
    public void InferTargetFormat_OrdersCorrectly(string presetName, TargetFormat expected)
    {
        var result = Preset.InferTargetFormat(presetName);
        Assert.Equal(expected, result);
    }

    [Fact]
    public void CreatePreset_SpecialPresets_AssignCorrectDefaults()
    {
        var jpg70 = Preset.Create("JPG 70%");
        Assert.Equal(TargetFormat.JPG, jpg70.TargetFormat);
        Assert.Equal(70, jpg70.Quality);

        var half = Preset.Create("ย่อ 50%");
        Assert.Equal(PresetSize.Percent50, half.Size);
    }

    #endregion

    #region 7. AddProfile Tests

    [Fact]
    public void AddProfile_AssignsIncrementedN_Correctly()
    {
        var profiles = new List<Profile>
        {
            new() { Name = "รูปภาพ" },
            new() { Name = "โปรไฟล์ใหม่ 1" }
        };

        var p2 = _service.AddProfile(profiles);
        Assert.Equal("โปรไฟล์ใหม่ 2", p2.Name);
        Assert.Empty(p2.Wheel);
        Assert.Equal(new[] { "PNG", "JPG", "PDF", "WEBP", "TXT", "DOCX" }, p2.Tray.Select(p => p.Name));

        var p3 = _service.AddProfile(profiles);
        Assert.Equal("โปรไฟล์ใหม่ 3", p3.Name);
    }

    #endregion

    #region 8. SetExtensions Tests

    [Fact]
    public void SetExtensions_NormalizesCleanly()
    {
        var profile = new Profile();
        _service.SetExtensions(profile, " .JPG, png,, PNG ");

        Assert.Equal(new[] { "jpg", "png" }, profile.Extensions);
    }

    #endregion

    #region 9. HitTest Geometry Tests

    [Fact]
    public void DonutGeometry_HitTest_MatchesSpecificationAngles()
    {
        // ReferenceSize = 320, Center = 160
        // n=8: a=0 -> 0 | a=22 -> 0 | a=23 -> 1 | a=270 -> 6 | a=350 -> 0
        Assert.Equal(0, DonutGeometry.CalculateIndexFromAngle(0, 8));
        Assert.Equal(0, DonutGeometry.CalculateIndexFromAngle(22, 8));
        Assert.Equal(1, DonutGeometry.CalculateIndexFromAngle(23, 8));
        Assert.Equal(6, DonutGeometry.CalculateIndexFromAngle(270, 8));
        Assert.Equal(0, DonutGeometry.CalculateIndexFromAngle(350, 8));

        // n=4: a=270 -> 3
        Assert.Equal(3, DonutGeometry.CalculateIndexFromAngle(270, 4));

        // n=1: ทุกจุดในวงแหวนคือ index 0
        Assert.Equal(0, DonutGeometry.HitTestSegment(160, 50, 320, 1));

        // n=0: คืน -1
        Assert.Equal(-1, DonutGeometry.HitTestSegment(160, 50, 320, 0));
    }

    #endregion

    #region 10. Settings Roundtrip and Error Recovery Tests

    [Fact]
    public void SettingsService_RoundtripsSuccessfully()
    {
        string tmpFile = Path.Combine(Path.GetTempPath(), $"filee_test_{Guid.NewGuid():N}.json");
        try
        {
            var service = new DonutSettingsService(tmpFile);
            var defaults = DefaultProfilesFactory.CreateDefaults();

            service.RequestSave(defaults, "pdf", reduceMotion: true, debounceMs: 0);
            service.Flush();

            var loaded = service.Load();
            Assert.Equal("pdf", loaded.SelectedProfileId);
            Assert.True(loaded.ReduceMotion);
            Assert.Equal(4, loaded.Profiles.Count);
        }
        finally
        {
            if (File.Exists(tmpFile)) File.Delete(tmpFile);
            if (File.Exists(tmpFile + ".tmp")) File.Delete(tmpFile + ".tmp");
            if (File.Exists(tmpFile + ".bak")) File.Delete(tmpFile + ".bak");
        }
    }

    [Fact]
    public void SettingsService_WhenWheelExceeds12_TruncatesToTray()
    {
        var dto = new ToolbarSettingsDto
        {
            Profiles = new List<ProfileDto>
            {
                new()
                {
                    Id = "test",
                    Name = "Test",
                    Wheel = Enumerable.Range(1, 15).Select(i => new PresetDto { Id = Guid.NewGuid().ToString(), Name = $"P{i}" }).ToList(),
                    Tray = new List<PresetDto>()
                }
            }
        };

        var (profiles, _, _) = DonutSettingsService.NormalizeAndValidate(dto, DefaultProfilesFactory.CreateDefaults(), "test");

        var testProfile = profiles[0];
        Assert.Equal(12, testProfile.Wheel.Count);
        Assert.Equal(3, testProfile.Tray.Count); // 3 ตัวที่เกิน ถูกตัดมาไว้ท้าย Tray
    }

    #endregion
}
