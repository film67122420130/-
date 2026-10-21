using System;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using Filee.Core.Domain;
using Filee.Core.Models;

namespace Filee.App.ViewModels;

public class PresetEditViewModel : INotifyPropertyChanged
{
    private readonly ProfileDomainService _domainService;
    private readonly Profile _profile;
    private readonly Preset _originalPreset;

    private string _name;
    private TargetFormat _targetFormat;
    private PresetSize _size;
    private int _quality;
    private SaveLocationType _saveLocation;
    private string? _customSavePath;
    private ConflictPolicy _conflictPolicy;
    private string _fileNamePattern;
    private bool _keepExif;

    private string _errorMessage = string.Empty;
    private bool _isOpen;

    public event PropertyChangedEventHandler? PropertyChanged;
    public event Action? SavedSuccessfully;
    public event Action? Cancelled;

    public PresetEditViewModel(ProfileDomainService domainService, Profile profile, Preset preset)
    {
        _domainService = domainService ?? throw new ArgumentNullException(nameof(domainService));
        _profile = profile ?? throw new ArgumentNullException(nameof(profile));
        _originalPreset = preset ?? throw new ArgumentNullException(nameof(preset));

        // คัดลอกลง Draft
        _name = preset.Name;
        _targetFormat = preset.TargetFormat;
        _size = preset.Size;
        _quality = preset.Quality;
        _saveLocation = preset.SaveLocation;
        _customSavePath = preset.CustomSavePath;
        _conflictPolicy = preset.ConflictPolicy;
        _fileNamePattern = preset.FileNamePattern;
        _keepExif = preset.KeepExif;
        _isOpen = true;
    }

    public bool IsOpen
    {
        get => _isOpen;
        set => SetField(ref _isOpen, value);
    }

    public string Name
    {
        get => _name;
        set
        {
            if (SetField(ref _name, value))
            {
                // ล้างข้อความผิดพลาดเมื่อผู้ใช้พิมพ์
                ErrorMessage = string.Empty;
            }
        }
    }

    public TargetFormat TargetFormat
    {
        get => _targetFormat;
        set => SetField(ref _targetFormat, value);
    }

    public PresetSize Size
    {
        get => _size;
        set => SetField(ref _size, value);
    }

    public int Quality
    {
        get => _quality;
        set => SetField(ref _quality, Math.Clamp(value, 10, 100));
    }

    public SaveLocationType SaveLocation
    {
        get => _saveLocation;
        set => SetField(ref _saveLocation, value);
    }

    public string? CustomSavePath
    {
        get => _customSavePath;
        set => SetField(ref _customSavePath, value);
    }

    public ConflictPolicy ConflictPolicy
    {
        get => _conflictPolicy;
        set => SetField(ref _conflictPolicy, value);
    }

    public string FileNamePattern
    {
        get => _fileNamePattern;
        set => SetField(ref _fileNamePattern, value);
    }

    public bool KeepExif
    {
        get => _keepExif;
        set => SetField(ref _keepExif, value);
    }

    public string ErrorMessage
    {
        get => _errorMessage;
        set => SetField(ref _errorMessage, value);
    }

    public bool Save()
    {
        var draft = new Preset
        {
            Id = _originalPreset.Id,
            Name = _name,
            TargetFormat = _targetFormat,
            Size = _size,
            Quality = _quality,
            SaveLocation = _saveLocation,
            CustomSavePath = _customSavePath,
            ConflictPolicy = _conflictPolicy,
            FileNamePattern = _fileNamePattern,
            KeepExif = _keepExif
        };

        var result = _domainService.UpdatePreset(_profile, _originalPreset.Id, draft);
        if (!result.Success)
        {
            ErrorMessage = result.ErrorMessage ?? "ข้อมูลไม่ถูกต้อง";
            return false;
        }

        IsOpen = false;
        SavedSuccessfully?.Invoke();
        return true;
    }

    public void Cancel()
    {
        IsOpen = false;
        Cancelled?.Invoke();
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
}
