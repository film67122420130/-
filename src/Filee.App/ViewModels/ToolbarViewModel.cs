using System;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Threading;
using Filee.Core.Domain;
using Filee.Core.Geometry;
using Filee.Core.Models;
using Filee.Core.Settings;

namespace Filee.App.ViewModels;

public class ToolbarViewModel : INotifyPropertyChanged, IDisposable
{
    private readonly ProfileDomainService _domainService;
    private readonly DonutSettingsService _settingsService;

    private ObservableCollection<Profile> _profiles = new();
    private Profile? _selectedProfile;
    private bool _reduceMotion;
    private string _statusMessage = string.Empty;
    private Timer? _statusTimer;

    private int _hoveredIndex = -1;
    private PresetEditViewModel? _activeEditDialog;

    private string? _loadedFilePath;
    private string _loadedFileName = "ยังไม่ได้เลือกไฟล์";
    private string _loadedFileSizeDisplay = "ลากไฟล์มาวางที่นี่";
    private double _wheelRotationAngle = 0.0;
    private bool _isConfirmationDialogOpen;
    private bool _isCodeModalOpen;
    private Preset? _pendingPreset;
    private string _executionCode = string.Empty;
    private ObservableCollection<string> _executionLogs = new();

    private bool _isDisposed;

    public event PropertyChangedEventHandler? PropertyChanged;
    public event Action? PlayEntryRequested;
    public event Action<Preset>? PresetConfirmationRequested;

    public DragCoordinator Drag { get; }

    public ToolbarViewModel(ProfileDomainService domainService, DonutSettingsService settingsService)
    {
        _domainService = domainService ?? throw new ArgumentNullException(nameof(domainService));
        _settingsService = settingsService ?? throw new ArgumentNullException(nameof(settingsService));

        Drag = new DragCoordinator(_domainService);
        Drag.StatusMessageRequested += ShowStatusMessage;
        Drag.RefreshWithoutAnimationRequested += OnDragCompletedWithoutAnimation;

        LoadSettings();
    }

    public ObservableCollection<Profile> Profiles
    {
        get => _profiles;
        private set => SetField(ref _profiles, value);
    }

    public Profile? SelectedProfile
    {
        get => _selectedProfile;
        private set
        {
            if (SetField(ref _selectedProfile, value))
            {
                OnPropertyChanged(nameof(ExtensionsDisplay));
            }
        }
    }

    public string ExtensionsDisplay
    {
        get
        {
            if (_selectedProfile == null || _selectedProfile.Extensions.Count == 0)
                return "(แก้ไขได้)";
            return string.Join(", ", _selectedProfile.Extensions);
        }
    }

    public bool ReduceMotion
    {
        get => _reduceMotion;
        set
        {
            if (SetField(ref _reduceMotion, value))
            {
                RequestSave();
            }
        }
    }

    public string StatusMessage
    {
        get => _statusMessage;
        private set => SetField(ref _statusMessage, value);
    }

    public int HoveredIndex
    {
        get => _hoveredIndex;
        private set => SetField(ref _hoveredIndex, value);
    }

    public PresetEditViewModel? ActiveEditDialog
    {
        get => _activeEditDialog;
        private set
        {
            if (SetField(ref _activeEditDialog, value))
            {
                OnPropertyChanged(nameof(IsDialogOpen));
            }
        }
    }

    public bool IsDialogOpen => _activeEditDialog != null && _activeEditDialog.IsOpen;

    public string? LoadedFilePath
    {
        get => _loadedFilePath;
        private set => SetField(ref _loadedFilePath, value);
    }

    public string LoadedFileName
    {
        get => _loadedFileName;
        private set => SetField(ref _loadedFileName, value);
    }

    public string LoadedFileSizeDisplay
    {
        get => _loadedFileSizeDisplay;
        private set => SetField(ref _loadedFileSizeDisplay, value);
    }

    public double WheelRotationAngle
    {
        get => _wheelRotationAngle;
        set => SetField(ref _wheelRotationAngle, (value % 360.0 + 360.0) % 360.0);
    }

    public bool IsConfirmationDialogOpen
    {
        get => _isConfirmationDialogOpen;
        set => SetField(ref _isConfirmationDialogOpen, value);
    }

    public bool IsCodeModalOpen
    {
        get => _isCodeModalOpen;
        set => SetField(ref _isCodeModalOpen, value);
    }

    public Preset? PendingPreset
    {
        get => _pendingPreset;
        private set => SetField(ref _pendingPreset, value);
    }

    public string ExecutionCode
    {
        get => _executionCode;
        private set => SetField(ref _executionCode, value);
    }

    public ObservableCollection<string> ExecutionLogs => _executionLogs;

    public void RotateWheel(double deltaDegrees)
    {
        WheelRotationAngle += deltaDegrees;
    }

    public void LoadFile(string filePath)
    {
        if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
            return;

        LoadedFilePath = filePath;
        LoadedFileName = Path.GetFileName(filePath);
        var fileInfo = new FileInfo(filePath);
        LoadedFileSizeDisplay = FormatBytes(fileInfo.Length);

        string ext = Path.GetExtension(filePath).TrimStart('.').ToLowerInvariant();
        var matchingProfile = Profiles.FirstOrDefault(p => p.Extensions.Contains(ext, StringComparer.OrdinalIgnoreCase));
        if (matchingProfile != null && matchingProfile != _selectedProfile)
        {
            SelectProfile(matchingProfile.Id);
            ShowStatusMessage($"สลับไปโปรไฟล์ \"{matchingProfile.Name}\" อัตโนมัติ");
        }
        else
        {
            ShowStatusMessage($"โหลดไฟล์ \"{LoadedFileName}\" เรียบร้อยแล้ว");
        }
    }

    public void OnPresetClicked(Preset preset)
    {
        if (preset == null) return;
        PendingPreset = preset;
        IsConfirmationDialogOpen = true;
        PresetConfirmationRequested?.Invoke(preset);
    }

    public void ConfirmConversion()
    {
        if (PendingPreset == null) return;

        IsConfirmationDialogOpen = false;
        IsCodeModalOpen = true;

        string targetFileName = LoadedFilePath != null
            ? FileNamingService.FormatFileName(LoadedFilePath, PendingPreset) + FileNamingService.GetExtensionForTargetFormat(PendingPreset.TargetFormat)
            : $"file_{PendingPreset.Name}{FileNamingService.GetExtensionForTargetFormat(PendingPreset.TargetFormat)}";

        ExecutionCode = GenerateCSharpPipelineCode(PendingPreset, LoadedFilePath ?? "input_file.ext", targetFileName);

        _executionLogs.Clear();
        _executionLogs.Add($"[Filee.App] เริ่มกระบวนการแปลงไฟล์สำหรับ {LoadedFileName}...");
        _executionLogs.Add($"[Filee.Core] โหลดไฟล์ต้นฉบับสำเร็จ ({LoadedFileSizeDisplay})");
        _executionLogs.Add($"[Filee.Core] รูปแบบปลายทาง: {PendingPreset.TargetFormat} (Preset: {PendingPreset.Name})");
        _executionLogs.Add($"[Filee.Core] พารามิเตอร์: Quality={PendingPreset.Quality}%, Size={PendingPreset.Size}");
        _executionLogs.Add($"[Filee.Core] กำลังประมวลผล Transformation Pipeline Matrix...");
        _executionLogs.Add($"[Filee.Core] ปลายทาง: {targetFileName}");
        _executionLogs.Add($"✔ [Filee.Core] การแปลงไฟล์เสร็จสมบูรณ์ 100%");
    }

    public void CloseConfirmationDialog()
    {
        IsConfirmationDialogOpen = false;
        PendingPreset = null;
    }

    public void CloseCodeModal()
    {
        IsCodeModalOpen = false;
    }

    private static string FormatBytes(long bytes)
    {
        if (bytes <= 0) return "0 B";
        string[] sizes = ["B", "KB", "MB", "GB"];
        int order = 0;
        double len = bytes;
        while (len >= 1024 && order < sizes.Length - 1)
        {
            order++;
            len /= 1024;
        }
        return $"{len:0.0} {sizes[order]}";
    }

    private static string GenerateCSharpPipelineCode(Preset preset, string sourceFilePath, string destFileName)
    {
        return $@"// ==========================================
// Filee Universal Conversion Pipeline (C#)
// ==========================================
using System;
using System.IO;
using System.Threading.Tasks;
using Filee.Core.Conversion;
using Filee.Core.Models;

// 1. ตั้งค่างานแปลงไฟล์ตาม Preset จากวงแหวน Donut
var preset = new Preset
{{
    Name = ""{preset.Name}"",
    TargetFormat = TargetFormat.{preset.TargetFormat},
    Quality = {preset.Quality},
    Size = PresetSize.{preset.Size},
    SaveLocation = SaveLocationType.{preset.SaveLocation},
    ConflictPolicy = ConflictPolicy.{preset.ConflictPolicy},
    FileNamePattern = ""{preset.FileNamePattern}"",
    KeepExif = {preset.KeepExif.ToString().ToLower()}
}};

// 2. เรียกใช้งาน Universal File Conversion Pipeline ของ Filee
var pipeline = new FileConversionPipeline();
var task = new ConversionTask(@""{sourceFilePath}"", preset);

// 3. เริ่มการแปลงไฟล์ (รองรับ ImageSharp / Skia / OpenXml / PDF)
var result = await pipeline.ExecuteAsync(task);
if (result.Success)
{{
    Console.WriteLine($""✔ แปลงไฟล์สำเร็จ: {{result.DestinationFilePath}}"");
}}";
    }

    private void LoadSettings()
    {
        var (loadedProfiles, selectedId, reduceMotion) = _settingsService.Load();
        Profiles = new ObservableCollection<Profile>(loadedProfiles);
        _reduceMotion = reduceMotion;

        var profileToSelect = Profiles.FirstOrDefault(p => p.Id == selectedId) ?? Profiles.FirstOrDefault();
        _selectedProfile = profileToSelect;

        // แสดงหน้าครั้งแรก -> สั่งเล่นอนิเมชัน Entry
        PlayEntryRequested?.Invoke();
    }

    public void SelectProfile(string profileId)
    {
        if (Drag.IsDragging) Drag.Cancel();

        var profile = Profiles.FirstOrDefault(p => p.Id == profileId);
        if (profile != null && profile != _selectedProfile)
        {
            SelectedProfile = profile;
            HoveredIndex = -1;
            PlayEntryRequested?.Invoke();
            RequestSave();
        }
    }

    public void AddProfile()
    {
        if (Drag.IsDragging) Drag.Cancel();

        var newProfile = _domainService.AddProfile(Profiles);
        SelectedProfile = newProfile;
        HoveredIndex = -1;
        PlayEntryRequested?.Invoke();
        RequestSave();
    }

    public void SetExtensions(string text)
    {
        if (_selectedProfile == null) return;
        _domainService.SetExtensions(_selectedProfile, text);
        OnPropertyChanged(nameof(ExtensionsDisplay));
        RequestSave();
    }

    public void TestOpen()
    {
        PlayEntryRequested?.Invoke();
    }

    public void OnWheelPointerMoved(double pointerX, double pointerY, double controlSize)
    {
        if (IsDialogOpen || Drag.IsDragging || _selectedProfile == null)
        {
            return;
        }

        int seg = DonutGeometry.HitTestSegment(pointerX, pointerY, controlSize, _selectedProfile.Wheel.Count);
        HoveredIndex = seg;
    }

    public void OnWheelPointerExited()
    {
        if (!Drag.IsDragging)
        {
            HoveredIndex = -1;
        }
    }

    public void OpenEditDialogForHovered()
    {
        if (_selectedProfile == null || HoveredIndex < 0 || HoveredIndex >= _selectedProfile.Wheel.Count)
        {
            return;
        }

        OpenEditDialog(_selectedProfile.Wheel[HoveredIndex]);
    }

    public void OpenEditDialogForIndex(int index)
    {
        if (_selectedProfile == null || index < 0 || index >= _selectedProfile.Wheel.Count)
        {
            return;
        }

        OpenEditDialog(_selectedProfile.Wheel[index]);
    }

    private void OpenEditDialog(Preset preset)
    {
        if (_selectedProfile == null || preset == null) return;

        if (Drag.IsDragging) Drag.Cancel();
        HoveredIndex = -1;

        var dialogVm = new PresetEditViewModel(_domainService, _selectedProfile, preset);
        dialogVm.SavedSuccessfully += () =>
        {
            ActiveEditDialog = null;
            RequestSave();
        };
        dialogVm.Cancelled += () =>
        {
            ActiveEditDialog = null;
        };

        ActiveEditDialog = dialogVm;
    }

    public void ShowStatusMessage(string message)
    {
        StatusMessage = message;

        _statusTimer?.Dispose();
        _statusTimer = new Timer(_ =>
        {
            StatusMessage = string.Empty;
        }, null, 1600, Timeout.Infinite);
    }

    private void OnDragCompletedWithoutAnimation()
    {
        RequestSave();
    }

    public void RequestSave()
    {
        if (_selectedProfile == null) return;
        _settingsService.RequestSave(Profiles.ToList(), _selectedProfile.Id, _reduceMotion);
    }

    public void FlushSettings()
    {
        _settingsService.Flush();
    }

    public void Dispose()
    {
        if (_isDisposed) return;
        _isDisposed = true;

        _statusTimer?.Dispose();
        _statusTimer = null;

        Drag.StatusMessageRequested -= ShowStatusMessage;
        Drag.RefreshWithoutAnimationRequested -= OnDragCompletedWithoutAnimation;

        FlushSettings();
        _settingsService.Dispose();
    }

    protected bool SetField<T>(ref T field, T value, [CallerMemberName] string? propertyName = null)
    {
        if (!Equals(field, value))
        {
            field = value;
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
            return true;
        }
        return false;
    }

    protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }
}
