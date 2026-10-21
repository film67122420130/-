namespace Filee.Core.Domain;

public enum OperationErrorCode
{
    None = 0,
    WheelFull,
    InvalidNameEmpty,
    DuplicateName,
    PresetNotFound,
    InvalidIndex,
    InvalidOperation
}

public record OperationResult(bool Success, OperationErrorCode ErrorCode = OperationErrorCode.None, string? ErrorMessage = null)
{
    public static OperationResult Ok() => new(true);
    public static OperationResult Fail(OperationErrorCode code, string message) => new(false, code, message);
    public static OperationResult WheelFull() => new(false, OperationErrorCode.WheelFull, "เพิ่มได้สูงสุด 12 รายการ");
}
