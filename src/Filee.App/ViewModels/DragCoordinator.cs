using System;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using Filee.Core.Domain;
using Filee.Core.Geometry;
using Filee.Core.Models;

namespace Filee.App.ViewModels;

public enum DragSourceType
{
    Wheel,
    Tray
}

public enum DragState
{
    Idle,
    Pending,
    Dragging
}

public class DragCoordinator : INotifyPropertyChanged
{
    private const double DragThreshold = 5.0;

    private readonly ProfileDomainService _domainService;
    private DragState _state = DragState.Idle;

    private DragSourceType _sourceType;
    private int _wheelSourceIndex = -1;
    private Guid _traySourcePresetId = Guid.Empty;
    private string _presetName = string.Empty;

    private double _startX;
    private double _startY;

    private int _dragSourceIndex = -1;
    private int _dropTargetIndex = -1;
    private bool _isOverTray;
    private bool _isGhostVisible;
    private string _ghostText = string.Empty;
    private double _ghostX;
    private double _ghostY;

    public event PropertyChangedEventHandler? PropertyChanged;
    public event Action<string>? StatusMessageRequested;
    public event Action? RefreshWithoutAnimationRequested;

    public DragCoordinator(ProfileDomainService domainService)
    {
        _domainService = domainService ?? throw new ArgumentNullException(nameof(domainService));
    }

    public DragState State => _state;
    public bool IsDragging => _state == DragState.Dragging;

    public int DragSourceIndex
    {
        get => _dragSourceIndex;
        private set => SetField(ref _dragSourceIndex, value);
    }

    public int DropTargetIndex
    {
        get => _dropTargetIndex;
        private set => SetField(ref _dropTargetIndex, value);
    }

    public bool IsOverTray
    {
        get => _isOverTray;
        private set => SetField(ref _isOverTray, value);
    }

    public bool IsGhostVisible
    {
        get => _isGhostVisible;
        private set => SetField(ref _isGhostVisible, value);
    }

    public string GhostText
    {
        get => _ghostText;
        private set => SetField(ref _ghostText, value);
    }

    public double GhostX
    {
        get => _ghostX;
        private set => SetField(ref _ghostX, value);
    }

    public double GhostY
    {
        get => _ghostY;
        private set => SetField(ref _ghostY, value);
    }

    public void StartPendingFromWheel(int index, Preset preset, double startX, double startY, bool isDialogOpen)
    {
        if (isDialogOpen || preset == null) return;

        _state = DragState.Pending;
        _sourceType = DragSourceType.Wheel;
        _wheelSourceIndex = index;
        _traySourcePresetId = preset.Id;
        _presetName = preset.Name;
        _startX = startX;
        _startY = startY;
    }

    public void StartPendingFromTray(Preset preset, double startX, double startY, bool isDialogOpen)
    {
        if (isDialogOpen || preset == null) return;

        _state = DragState.Pending;
        _sourceType = DragSourceType.Tray;
        _wheelSourceIndex = -1;
        _traySourcePresetId = preset.Id;
        _presetName = preset.Name;
        _startX = startX;
        _startY = startY;
    }

    public void OnPointerMove(
        double currentX,
        double currentY,
        Profile currentProfile,
        bool isOverWheelArea,
        double wheelControlX,
        double wheelControlY,
        double wheelControlSize,
        bool isPointerOverTrayArea)
    {
        if (_state == DragState.Idle) return;

        if (_state == DragState.Pending)
        {
            double dist = Math.Hypot(currentX - _startX, currentY - _startY);
            if (dist > DragThreshold)
            {
                _state = DragState.Dragging;
                GhostText = _presetName;
                IsGhostVisible = true;
                DragSourceIndex = (_sourceType == DragSourceType.Wheel) ? _wheelSourceIndex : -1;
            }
            else
            {
                return;
            }
        }

        // อัปเดตตำแหน่ง Ghost (+10, +10 จากเคอร์เซอร์)
        GhostX = currentX + 10.0;
        GhostY = currentY + 10.0;

        // คำนวณเป้าหมายตามลำดับความสำคัญ:
        // ชิ้นของวงล้อ > พื้นที่วงล้อ > ถาด > ไม่มีเป้าหมาย
        int hitSegment = -1;
        if (isOverWheelArea)
        {
            hitSegment = DonutGeometry.HitTestSegment(wheelControlX, wheelControlY, wheelControlSize, currentProfile.Wheel.Count);
        }

        DropTargetIndex = hitSegment;
        IsOverTray = (_sourceType == DragSourceType.Wheel) && isPointerOverTrayArea;
    }

    public void OnPointerUp(
        Profile currentProfile,
        bool isOverWheelArea,
        double wheelControlX,
        double wheelControlY,
        double wheelControlSize,
        bool isPointerOverTrayArea)
    {
        if (_state == DragState.Idle) return;

        if (_state == DragState.Pending)
        {
            // ปล่อยตอนยังเป็น Pending = คลิกธรรมดา ไม่ทำอะไร
            Cancel();
            return;
        }

        if (_state == DragState.Dragging)
        {
            int hitSegment = -1;
            if (isOverWheelArea)
            {
                hitSegment = DonutGeometry.HitTestSegment(wheelControlX, wheelControlY, wheelControlSize, currentProfile.Wheel.Count);
            }

            if (_sourceType == DragSourceType.Wheel)
            {
                if (isPointerOverTrayArea)
                {
                    // ลากจากวงล้อไปวางบนถาด -> MoveToTray
                    _domainService.MoveToTray(currentProfile, _traySourcePresetId);
                }
                else if (hitSegment >= 0 && hitSegment != _wheelSourceIndex)
                {
                    // ลากสลับชิ้นในวงล้อ
                    _domainService.MoveWithinWheel(currentProfile, _wheelSourceIndex, hitSegment);
                }
            }
            else if (_sourceType == DragSourceType.Tray)
            {
                if (hitSegment >= 0)
                {
                    // วางบนชิ้น -> แทรกที่ตำแหน่งนั้น
                    var result = _domainService.AddToWheel(currentProfile, _traySourcePresetId, hitSegment);
                    if (result.ErrorCode == OperationErrorCode.WheelFull)
                    {
                        StatusMessageRequested?.Invoke("เพิ่มได้สูงสุด 12 รายการ");
                    }
                }
                else if (isOverWheelArea)
                {
                    // วางบนพื้นที่วงล้อที่ไม่ใช่ชิ้น -> ต่อท้าย
                    var result = _domainService.AddToWheel(currentProfile, _traySourcePresetId, null);
                    if (result.ErrorCode == OperationErrorCode.WheelFull)
                    {
                        StatusMessageRequested?.Invoke("เพิ่มได้สูงสุด 12 รายการ");
                    }
                }
            }

            Cancel();
            RefreshWithoutAnimationRequested?.Invoke();
        }
    }

    public void Cancel()
    {
        _state = DragState.Idle;
        _wheelSourceIndex = -1;
        _traySourcePresetId = Guid.Empty;
        _presetName = string.Empty;

        DragSourceIndex = -1;
        DropTargetIndex = -1;
        IsOverTray = false;
        IsGhostVisible = false;
        GhostText = string.Empty;
    }

    protected void SetField<T>(ref T field, T value, [CallerMemberName] string? propertyName = null)
    {
        if (!Equals(field, value))
        {
            field = value;
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }
}
