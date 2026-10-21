namespace Filee.Core.Models;

public enum TargetFormat
{
    // ลำดับสำคัญ: รูปแบบแรกที่พบในชื่อตามลำดับนี้ (เช่น DOCX ต้องมาก่อน DOC)
    PNG,
    JPG,
    WEBP,
    TIFF,
    BMP,
    ICO,
    GIF,
    AVIF,
    PDF,
    DOCX,
    ODT,
    HWPX,
    TXT,
    HTML,
    RTF,
    DOC,
    MARKDOWN
}

public enum PresetSize
{
    Original,       // ต้นฉบับ
    Percent50,      // 50%
    LongSide1920,   // ด้านยาว 1920 พิกเซล
    LongSide1280    // ด้านยาว 1280 พิกเซล
}

public enum SaveLocationType
{
    OriginalFolder, // โฟลเดอร์ต้นฉบับ
    SubFolder,      // โฟลเดอร์ย่อย (แปลงแล้ว)
    CustomFolder    // เลือกโฟลเดอร์…
}

public enum ConflictPolicy
{
    AddNumber,      // เพิ่มหมายเลข
    Overwrite,      // เขียนทับ
    Skip            // ข้าม
}
