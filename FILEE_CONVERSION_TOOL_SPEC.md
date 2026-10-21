# เอกสารการออกแบบและพิมพ์เขียวระบบ (Technical Specification & Conversion Blueprint)
## แถบเครื่องมือวงกลมและการแปลงไฟล์ครอบคลุมทุกรูปแบบ (Filee Donut Toolbar & Universal Conversion Engine)

เอกสารฉบับนี้จัดทำขึ้นโดยทีม Senior Avalonia/C# Engineer เพื่อเป็นข้อกำหนดทางเทคนิค (Technical Specification) และแผนการสร้างสถาปัตยกรรมลอจิกของ **Filee Donut Toolbar** ให้ตรงตามข้อกำหนดและครอบคลุมการทำงานของเครื่องมือแปลงไฟล์ทุกประเภท

---

## สารบัญ
1. [ตาราง Audit สรุปพฤติกรรม (Audit Matrix: ข้อ 2–10)](#1-ตาราง-audit-สรุปพฤติกรรม-audit-matrix-ข้อ-210)
2. [โมเดลข้อมูลและกฎคงที่ (Data Models & Invariants)](#2-โมเดลข้อมูลและกฎคงที่-data-models--invariants)
3. [พิมพ์เขียวระบบแปลงไฟล์จริงทุกรูปแบบ (Universal File Conversion Engine)](#3-พิมพ์เขียวระบบแปลงไฟล์จริงทุกรูปแบบ-universal-file-conversion-engine)
4. [สถาปัตยกรรมโดเมนและลอจิกการทำงาน (Domain Operations & Result Types)](#4-สถาปัตยกรรมโดเมนและลอจิกการทำงาน-domain-operations--result-types)
5. [ระบบการลากและเรขาคณิต (DragCoordinator & Donut Geometry)](#5-ระบบการลากและเรขาคณิต-dragcoordinator--donut-geometry)
6. [การจัดการ Hover, ดินสอ, คลิกขวา และ Dialog พรีเซ็ต](#6-การจัดการ-hover-ดินสอ-คลิกขวา-และ-dialog-พรีเซ็ต)
7. [ระบบการเก็บและโหลด Settings (Safe Debounced Atomic Storage)](#7-ระบบการเก็บและโหลด-settings-safe-debounced-atomic-storage)
8. [รายการสถานะที่ UI ต้องมีสไตล์รองรับ (Required UI Visual States)](#8-รายการสถานะที่-ui-ต้องมีสไตล์รองรับ-required-ui-visual-states)
9. [แผนการทดสอบด้วย xUnit (Unit Testing Strategy)](#9-แผนการทดสอบด้วย-xunit-unit-testing-strategy)

---

## 1. ตาราง Audit สรุปพฤติกรรม (Audit Matrix: ข้อ 2–10)

| ข้อกำหนด | พฤติกรรม | สถานะปัจจุบัน | สิ่งที่ต้องลงมือพัฒนา (Implementation Tasks) |
|---|---|---|---|
| **ข้อ 2: ข้อมูลตั้งต้น** | โหลด 4 โปรไฟล์หลัก (รูปภาพ, PDF, เอกสารสำนักงาน, HWP/HWPX) พร้อมพรีเซ็ตใน Wheel/Tray ตามสเปก | มีต้นแบบใน JS/HTML (ยังไม่มีใน C#) | สร้างคลาส `DefaultProfilesFactory` ใน C# กำหนดค่าคงที่ Extensions, Wheel, Tray และเลือก "รูปภาพ" เป็นค่าเริ่มต้น |
| **ข้อ 3: การดำเนินการโดเมน** | `AddToWheel`, `MoveToTray`, `MoveWithinWheel`, `RenamePreset`, `UpdatePreset`, `AddProfile`, `SelectProfile`, `SetExtensions` | มีใน JS mockup (ยังไม่มีใน C#) | สร้าง Domain Service คืนค่าเป็น Result Records (เช่น `OperationResult`), ตรวจ Invariants (ไม่เกิน 12 ชิ้น, พรีเซ็ตห้ามซ้ำซ้อนระหว่าง Wheel/Tray), ลอจิก StatusMessage 1.6 วินาที |
| **ข้อ 4: การลาก (DragCoordinator)** | State machine (Idle → Pending → Dragging → Idle), Pointer capture, Ghost chip, Hit testing ตามองศา | มีใน JS mockup (ยังไม่มีใน C#) | สร้าง `DonutGeometry` (ฟังก์ชันบริสุทธิ์ คำนวณรัศมี $R_1=62, R_2=152$ และมุม atan2), สร้าง `DragCoordinator` อิสระจาก Avalonia Visual |
| **ข้อ 5: Hover, ดินสอ, คลิกขวา** | Hit test ตรวจ HoveredIndex, ปุ่มดินสอเปิด Dialog, คลิกขวาเลือกชิ้นเปิด Dialog | มีใน JS mockup (ยังไม่มีใน C#) | จัดการ Event PointerMoved ในพื้นที่ DonutMenu, เชื่อมโยง Command สำหรับดินสอและ ContextMenu |
| **ข้อ 6: Dialog แก้ไขพรีเซ็ต** | แก้ไขบนสำเนา (Draft), ตรวจสอบชื่อซ้ำ/ว่าง, Slider ปรับคุณภาพ 10–100 แบบ Live, Esc/Enter shortcut | มีใน JS mockup (ยังไม่มีใน C#) | สร้าง `PresetEditViewModel` สำหรับแก้ไข draft preset แล้วกดยืนยันอัปเดตแบบ Atomic เข้าสู่โดเมน |
| **ข้อ 7: อนิเมชัน & ReduceMotion** | Event `PlayEntryRequested`, รองรับสวิตช์ `ReduceMotion` ข้ามอนิเมชัน | มีใน JS mockup (ยังไม่มีใน C#) | เพิ่ม Property `ReduceMotion` ใน SettingsViewModel เชื่อมกับ System accessibility ถ้ามี |
| **ข้อ 8: ระบบ Settings** | บันทึกแบบ Debounce 400ms, เขียนไฟล์ชั่วคราว .tmp ก่อนแทนที่จริง, กู้คืนไฟล์เสียเป็น .bak | มีใน JS mockup (ยังไม่มีใน C#) | สร้าง `DonutSettingsService` ใช้ JSON serialization ปลอดภัย ป้องกันข้อมูลสูญหายเมื่อแอปแครช |
| **ข้อ 9: การเชื่อมกับการใช้งานจริง** | แมปปิ้งนามสกุลไฟล์เข้าหาโปรไฟล์, แปลงค่าตาม `FileNamePattern`, `ConflictPolicy`, `SaveLocation` | ยังไม่มีการเชื่อมต่อ Engine | ออกแบบ `IFileConversionPipeline` และ Converter Engines สำหรับทุกฟอร์แมต |
| **ข้อ 10: Edge Cases** | Wheel 0, 1, 12 ชิ้น, เปลี่ยนโปรไฟล์ขณะลาก, ลากหลุดนอกหน้าต่าง, ชื่อซ้ำข้ามโปรไฟล์ | ครอบคลุมบางส่วนใน JS | เพิ่ม Defensive checks ทุกจุด และครอบคลุมด้วย Unit tests |

---

## 2. โมเดลข้อมูลและกฎคงที่ (Data Models & Invariants)

### 2.1 Enums และ Type Definitions
```csharp
namespace Filee.Core.Models;

public enum TargetFormat
{
    // เรียงตามลำดับความสำคัญ (DOCX ต้องมาก่อน DOC เพื่อให้ตรวจเจอคำค้นถูกต้อง)
    PNG, JPG, WEBP, TIFF, BMP, ICO, GIF, AVIF,
    PDF, DOCX, ODT, HWPX, TXT, HTML, RTF, DOC, MARKDOWN
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
    AddNumber,  // เพิ่มหมายเลข เช่น file (2).png
    Overwrite,  // เขียนทับ
    Skip        // ข้าม
}
```

### 2.2 คลาส Preset และ Profile
```csharp
public class Preset
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public TargetFormat TargetFormat { get; set; } = TargetFormat.PNG;
    public PresetSize Size { get; set; } = PresetSize.Original;
    public int Quality { get; set; } = 80; // ช่วง 10 - 100
    public SaveLocationType SaveLocation { get; set; } = SaveLocationType.OriginalFolder;
    public string? CustomSavePath { get; set; }
    public ConflictPolicy ConflictPolicy { get; set; } = ConflictPolicy.AddNumber;
    public string FileNamePattern { get; set; } = "{name}_{preset}";
    public bool KeepExif { get; set; } = true;

    public Preset Clone() => (Preset)this.MemberwiseClone();
}

public class Profile
{
    public string Id { get; init; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public List<string> Extensions { get; set; } = new();
    public ObservableCollection<Preset> Wheel { get; set; } = new();
    public ObservableCollection<Preset> Tray { get; set; } = new();
}
```

### 2.3 กฎคงที่ (Invariants)
1. **Single Location:** พรีเซ็ต $P_i$ จะต้องอยู่ใน `Wheel` หรือ `Tray` เท่านั้น ไม่สามารถอยู่สองที่พร้อมกันได้
2. **Wheel Capacity:** `Wheel.Count` $\le 12$ เสมอ หากพยายามใส่เกิน ระบบจะปฏิเสธด้วย `OperationResult.WheelFull`
3. **Data Independence:** ออปชันทั้งหมด (Format, Size, Quality, ฯลฯ) เก็บอยู่ใน Object ของพรีเซ็ต ไม่ผูกกับชื่อ การเปลี่ยนชื่อพรีเซ็ตจะไม่มีผลกระทบต่อคอนฟิกเดิม

---

## 3. พิมพ์เขียวระบบแปลงไฟล์จริงทุกรูปแบบ (Universal File Conversion Engine)

เพื่อให้เครื่องมือแปลงไฟล์สามารถทำงานได้จริงครบทุกตัวและครอบคลุมทุก Preset ตามที่ระบุไว้ในโปรไฟล์ จำแนกสถาปัตยกรรม Engine ได้ดังนี้:

```
                  ┌────────────────────────────────────────┐
                  │       IFileConversionPipeline          │
                  │ (Dispatch ตาม Input Extension & Format) │
                  └───────────────────┬────────────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         ▼                            ▼                            ▼
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│  Image Engine    │        │   Office Engine  │        │   PDF Engine     │
│ (ImageSharp/Skia)│        │ (OpenXml/Pandoc) │        │ (PdfPig/PDFsharp)│
└──────────────────┘        └──────────────────┘        └──────────────────┘
```

### 3.1 กลุ่มไฟล์รูปภาพ (Image Pipeline)
- **ไฟล์ต้นฉบับ:** JPG, JPEG, PNG, BMP, TIFF, WEBP, GIF, HEIC
- **เป้าหมาย:** PNG, WEBP, PDF, TIFF, BMP, ICO, JPG (ระบุ Quality), GIF, AVIF, PNG ขาวดำ, TIFF 300 DPI
- **กลไกการแปลง:**
  1. **Resize / Scale:**
     - `Percent50`: ลดมิติ W/H ลง 50% ด้วย Interpolation Bicubic/Lanczos
     - `LongSide1920` / `LongSide1280`: กำหนดให้ด้านที่ยาวที่สุดเท่ากับ 1920px หรือ 1280px และปรับสัดส่วนด้านสั้นตาม Aspect Ratio
  2. **Color Transform:**
     - `PNG ขาวดำ`: แปลงเมทริกซ์สีเป็น Grayscale 8-bit หรือ 1-bit Monochrome Thresholding
  3. **Quality & Compression:**
     - `JPG 70%`: ตั้งค่า Quality Encoder = 70
     - `TIFF 300 dpi`: ตั้งค่า Exif Metadata / VPixelSize / HPixelSize = 300 DPI
  4. **ICO Generator:**
     - แปลงภาพเป็น Multi-size Icon layer (16x16, 32x32, 48x48, 256x256) บรรจุใน ICO container เดียวกัน

### 3.2 กลุ่มไฟล์ PDF (PDF Pipeline)
- **ไฟล์ต้นฉบับ:** PDF
- **เป้าหมาย:** PNG, JPG, DOCX, HWPX, TXT, แยก PDF, บีบอัด PDF, TIFF, PDF/A, JPG 150 dpi
- **กลไกการแปลง:**
  1. **PDF to Images (PNG/JPG/TIFF):** เรนเดอร์หน้าเอกสารแต่ละหน้าเป็นภาพแบบ Vector rasterization ตาม DPI (150 DPI สำหรับ JPG 150 dpi, 300 DPI สำหรับ TIFF)
  2. **แยก PDF (Split PDF):** อ่าน Page Tree แล้วแตกออกเป็นไฟล์ละ 1 หน้า ตามรูปแบบชื่อ `{name}_page_{index}`
  3. **บีบอัด PDF (Compress PDF):** ลดขนาดภาพ Raster ใน Stream, ลบ Unused Objects, บีบอัด Cross-Reference Tables (FlateDecode)
  4. **PDF/A:** ฝัง ICC Profile, กำหนด OutputIntent, ลบ JavaScript/External References และแปลงฟอนต์ทั้งหมดเป็น Embedded Fonts เพื่อความเข้ากันได้ตามมาตรฐาน ISO 19005
  5. **PDF to TXT:** สกัด Text Blocks และ Layout Coordinates ออกมาเป็น Plain Text

### 3.3 กลุ่มไฟล์เอกสารสำนักงาน (Office Pipeline)
- **ไฟล์ต้นฉบับ:** DOCX, DOC, ODT, RTF, XLSX, PPTX
- **เป้าหมาย:** PDF, ODT, HWPX, TXT, HTML, RTF, DOC, Markdown
- **กลไกการแปลง:**
  1. **DOCX / ODT to PDF:** เรนเดอร์ Layout แบบ Headless Printing
  2. **DOCX to Markdown / HTML:** สกัดโครงสร้าง Heading, Paragraph, Table, List, Image ให้แปลงเป็น Markdown (Gfm) หรือ Semantic HTML5
  3. **Office to TXT:** ดึงเฉพาะ InnerText จาก XML Body

### 3.4 กลุ่มไฟล์ HWP / HWPX (Hangul Word Processor Pipeline)
- **ไฟล์ต้นฉบับ:** HWP, HWPX
- **เป้าหมาย:** PDF, DOCX, PNG, TXT, HWPX, ODT, HTML, Markdown
- **กลไกการแปลง:**
  1. **HWPX:** ไฟล์เป็น Open Packaging (ZIP + XML) สามารถ Parse Section และ Paragraph XML เพื่อแปลงเป็น DOCX หรือ HTML ได้โดยตรง
  2. **HWP to PDF / Image:** แปลงผ่าน Filter Converter เวกเตอร์เรนเดอร์แบบหน้ากระดาษ

---

## 4. สถาปัตยกรรมโดเมนและลอจิกการทำงาน (Domain Operations & Result Types)

การดำเนินการทุกฟังก์ชันจะออกแบบเป็น **Pure Logic** คืนค่าเป็น Result Record โดยไม่พึ่งพา Exception สำหรับเคสปกติ

```csharp
public record OperationResult(bool IsSuccess, string? ErrorReason = null)
{
    public static OperationResult Ok() => new(true);
    public static OperationResult Fail(string reason) => new(false, reason);
    public static OperationResult WheelFull() => new(false, "เพิ่มได้สูงสุด 12 รายการ");
}
```

### รายละเอียดการทำงานของฟังก์ชันหลัก:
- **`AddToWheel(Profile profile, Guid presetId, int? targetIndex)`**:
  - หาก `profile.Wheel.Count >= 12` $\rightarrow$ ส่งคืน `OperationResult.WheelFull()`
  - ตรวจสอบว่า `presetId` อยู่ใน `Tray` จริง
  - ลบออกจาก `Tray`
  - หาก `targetIndex` เป็น null $\rightarrow$ ต่อท้าย `Wheel`
  - หากระบุ `targetIndex` $\rightarrow$ ตรวจ clamp ช่วง $[0, \text{Wheel.Count}]$ แล้ว `Insert(targetIndex, preset)`
- **`MoveToTray(Profile profile, Guid presetId)`**:
  - หาพรีเซ็ตใน `Wheel`
  - นำออกจาก `Wheel` แล้วต่อท้าย `Tray`
- **`MoveWithinWheel(Profile profile, int fromIndex, int toIndex)`**:
  - หาก `fromIndex == toIndex` $\rightarrow$ ไม่ทำอะไร
  - นำชิ้นที่ `fromIndex` ออกจากคอลเลกชัน แล้วแทรกที่ `toIndex` (ทำให้ตำแหน่งสุดท้ายกลายเป็น `toIndex` เสมอ)
- **`ValidateAndRenamePreset(Profile profile, Guid presetId, string newName)`**:
  - Trim ชื่อ: หากว่าง $\rightarrow$ คืนข้อผิดพลาด `"กรุณากรอกชื่อ"`
  - ค้นหาใน `Wheel` และ `Tray` ของโปรไฟล์เดียวกัน: หากเจอชื่อซ้ำที่ไม่ใช่ `presetId` ของตัวเอง $\rightarrow$ คืน `"มีชื่อพรีเซ็ตนี้อยู่แล้ว"`
  - ผ่าน $\rightarrow$ อนุญาตให้ตั้งชื่อได้

---

## 5. ระบบการลากและเรขาคณิต (DragCoordinator & Donut Geometry)

### 5.1 ฟังก์ชันคำนวณ Hit-Testing บริสุทธิ์ (DonutGeometry)
การคำนวณชิ้นวงแหวนทำตามหลักเรขาคณิตแบบไร้ UI Dependency:
- จุดศูนย์กลาง: $C = \text{Width} / 2$
- รัศมีใน: $R_1 = \text{Width} \times (62 / 320)$
- รัศมีนอก: $R_2 = \text{Width} \times (152 / 320)$

```csharp
public static class DonutGeometry
{
    public static int HitTestSegment(double x, double y, double size, int segmentCount)
    {
        if (segmentCount <= 0) return -1;
        if (segmentCount == 1) return 0;

        double center = size / 2.0;
        double r1 = size * (62.0 / 320.0);
        double r2 = size * (152.0 / 320.0);

        double dx = x - center;
        double dy = y - center;
        double distance = Math.Sqrt(dx * dx + dy * dy);

        // ตรวจว่าอยู่ในวงแหวนหรือไม่ (เผื่อระยะ hover 6px)
        if (distance < r1 || distance > (r2 + 10))
            return -1;

        // คำนวณมุมตามเข็มนาฬิกาโดยเริ่มจากแกนบนสุด (12 นาฬิกา)
        // atan2(dx, -dy) ให้มุม 0 ที่ทิศเหนือ, ตามเข็มนาฬิกาเป็นบวก
        double angleRad = Math.Atan2(dx, -dy);
        double angleDeg = angleRad * (180.0 / Math.PI);
        if (angleDeg < 0) angleDeg += 360.0;

        double step = 360.0 / segmentCount;
        int index = (int)Math.Floor(((angleDeg + step / 2.0) % 360.0) / step);

        return Math.Clamp(index, 0, segmentCount - 1);
    }
}
```

### 5.2 สถานะการลาก (Drag State Machine)
- `Idle`: พร้อมรับการกด
- `Pending`: ผู้ใช้กดปุ่มซ้ายลงบนชิ้นวงล้อหรือ Chip ในถาด (บันทึก StartPoint)
- `Dragging`: เคลื่อนที่เกิน 5 พิกเซล $\rightarrow$ เปิด Ghost Element, ล้าง HoveredIndex, ตั้ง `DragSourceIndex`, สตรีมพิกัดอัปเดต Ghost Position $(X+10, Y+10)$ และตรวจสอบเป้าหมายใต้เคอร์เซอร์

---

## 6. การจัดการ Hover, ดินสอ, คลิกขวา และ Dialog พรีเซ็ต

1. **HoveredIndex:** คำนวณแบบรวมศูนย์จากพิกัดของ pointer ในพื้นที่ DonutMenu ผ่าน `DonutGeometry.HitTestSegment`
2. **ปุ่มดินสอ (Edit Pencil):**
   - คำนวณพิกัดลอยตามกึ่งกลาง Segment ที่กำลัง Hover
   - เมื่อคลิก $\rightarrow$ Mark Handled ทันที เพื่อป้องกันไม่ให้เกิด Drag Event
   - เปิด Dialog พรีเซ็ตของ `HoveredIndex`
3. **คลิกขวา (ContextMenu Event):**
   - ดัก PointerPressed (Right Button) $\rightarrow$ Hit Test ชิ้นใต้นิ้ว $\rightarrow$ สั่งเปิด Dialog แก้ไขชิ้นนั้น
4. **Dialog พฤติกรรมแบบ Draft:**
   - โคลนพรีเซ็ตออกมาเป็น `PresetDraft`
   - การเลื่อนสไลเดอร์ Quality แสดงผลแบบ Live Binding ตัวเลขทันที
   - หากกดยกเลิก หรือคลิกพื้นหลังด้านนอก หรือกด `Esc` $\rightarrow$ ปิด Dialog และทิ้ง Draft ทันที
   - หากกดบันทึก หรือกด `Enter` ในช่องชื่อ $\rightarrow$ Validate $\rightarrow$ อัปเดตแบบ Atomic เข้าสู่โมเดลจริง $\rightarrow$ รันคำสั่งบันทึก Settings แบบ Debounce

---

## 7. ระบบการเก็บและโหลด Settings (Safe Debounced Atomic Storage)

```
[ผู้ใช้เปลี่ยนค่า] ──> [Debounce 400ms Timer] ──> [เขียนไฟล์ .tmp] ──> [Atomic Rename แทนไฟล์จริง]
                                                      │
                                    (หากไฟล์หลักเสีย)  ▼
                              [สำรองไฟล์เป็น .bak] ──> [โหลดค่าเริ่มต้น Defaults]
```

- **Debounce:** กำหนดเวลา 400ms หลังจากอัปเดตครั้งสุดท้าย หากมีการเปลี่ยนค่าใหม่ ให้รีเซ็ต Timer ทันที
- **Flush on Exit:** ดัก Event การปิดหน้าต่าง / Navigation เพื่อบันทึกข้อมูลที่ค้างอยู่ลงดิสก์ทันที
- **Safe Atomic Replacement:**
  1. Serialize เป็น JSON ลงใน `toolbar.settings.json.tmp`
  2. สลับแทนที่ `toolbar.settings.json` ด้วย `File.Move(..., overwrite: true)`
  3. หากพบไฟล์เสียหายระหว่างอ่าน ให้บันทึกเป็น `.bak` เพื่อไม่ให้ข้อมูลผู้ใช้สูญหาย แล้วโหลด Defaults

---

## 8. รายการสถานะที่ UI ต้องมีสไตล์รองรับ (Required UI Visual States)

เนื่องจากสเปกกำหนดว่า **ห้ามออกแบบหรือแก้หน้าตา UI เองโดยตรง** ในส่วนของ ViewModel ได้เปิด Property สถานะไว้เพื่อรองรับการ Binding ดังนี้:

| Property ใน ViewModel/Control | ชนิดข้อมูล | จุดประสงค์ | คำแนะนำสำหรับทีม UI/Styling |
|---|---|---|---|
| `HoveredIndex` | `int` (-1 ถึง 11) | บอกว่าเคอร์เซอร์กำลังชี้ที่ชิ้นไหน | ต้องมี Style Selector สำหรับคลาส `:hot` เพื่อเปลี่ยนสีพื้นหลังและสีข้อความ |
| `DragSourceIndex` | `int` (-1 ถึง 11) | บอกชิ้นต้นทางที่กำลังถูกลากออกจากวงล้อ | ต้องมี Style Selector สำหรับคลาส `:dim` (ลด Opacity เหลือ 0.35) |
| `DropTargetIndex` | `int` (-1 ถึง 11) | บอกชิ้นปลายทางที่จะถูกแทนที่/แทรก | ต้องมี Style Selector สำหรับคลาส `:drop` (แสดงสีพื้นหลัง Success เขียวอ่อน) |
| `IsOverTray` | `bool` | บอกว่ากำลังลากชิ้นจากวงล้อมาจ่อเหนือถาด | ถาดต้องมี Visual Highlight (เช่น เส้นขอบ Border Accent ชัดเจน) |
| `IsGhostVisible` | `bool` | สั่งเปิด/ปิดการแสดงผล Ghost Chip ขณะลาก | แสดง Floating Chip ลอยตามพิกัด `GhostPosition` (Point) |
| `StatusMessage` | `string` | ข้อความเตือน เช่น "เพิ่มได้สูงสุด 12 รายการ" | กล่องข้อความใต้วงล้อ แสดงสี Warning ส้มทอง และเฟดหายหลัง 1.6 วินาที |

---

## 9. แผนการทดสอบด้วย xUnit (Unit Testing Strategy)

โครงสร้างชุดทดสอบที่ครอบคลุมข้อกำหนดทั้งหมดโดยไม่ต้องพึ่งพา Avalonia UI:

1. **`PresetInvariantsTests`**
   - ตรวจสอบว่าพรีเซ็ตใหม่ที่เพิ่มเข้ามามี TargetFormat, Size, Quality ตรงตามกฎเริ่มต้น
   - ตรวจสอบว่าพรีเซ็ตไม่อยู่ซ้ำซ้อนใน Wheel และ Tray
2. **`WheelOperationsTests`**
   - `AddToWheel_WhenFull_ReturnsWheelFull_AndStateUnchanged`
   - `MoveWithinWheel_0_To_2_ReordersCorrectly` ([A,B,C,D] $\rightarrow$ [B,C,A,D])
   - `MoveWithinWheel_3_To_1_ReordersCorrectly` ([A,B,C,D] $\rightarrow$ [A,D,B,C])
3. **`GeometryHitTestTests`**
   - ตรวจสอบมุมองศา $n=8, 4, 1, 0$ ชิ้น ตรงตามเคสทดสอบ
4. **`PresetValidationTests`**
   - ตรวจสอบชื่อว่าง, ตรวจชื่อซ้ำในโปรไฟล์เดียวกัน (ทั้ง Wheel และ Tray), ตรวจชื่อเดิมผ่าน
5. **`SettingsSerializationTests`**
   - ตรวจสอบการ Round-trip serialization
   - ตรวจสอบการกู้คืนไฟล์เสียเป็น `.bak` และโหลด Default ปลอดภัย
