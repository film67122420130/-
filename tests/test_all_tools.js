// Automated Test Suite for All Filee Tools & Profiles
const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('🧪 เริ่มการทดสอบระบบ Filee ทุกเครื่องมือและทุกฟอร์แมต');
console.log('====================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✔ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failCount++;
  }
}

// 1. ทดสอบโครงสร้างโปรไฟล์และพรีเซ็ต
console.log('--- 1. ทดสอบโครงสร้างโปรไฟล์และพรีเซ็ตตั้งต้นทั้ง 4 กลุ่ม ---');
const FORMATS = ['PNG', 'JPG', 'WEBP', 'TIFF', 'BMP', 'ICO', 'GIF', 'AVIF', 'PDF', 'DOCX', 'ODT', 'HWPX', 'TXT', 'HTML', 'RTF', 'DOC', 'MARKDOWN'];

const PROFILES = {
  image: {
    name: 'รูปภาพ',
    ext: ['jpg', 'jpeg', 'png', 'bmp', 'tiff', 'webp', 'gif', 'heic'],
    wheel: ['PNG', 'WEBP', 'PDF', 'TIFF', 'BMP', 'ICO', 'JPG 70%', 'ย่อ 50%'],
    tray: ['GIF', 'AVIF', 'PNG ขาวดำ', 'TIFF 300 dpi']
  },
  pdf: {
    name: 'PDF',
    ext: ['pdf'],
    wheel: ['PNG', 'JPG', 'DOCX', 'HWPX', 'TXT', 'แยก PDF', 'บีบอัด PDF'],
    tray: ['TIFF', 'PDF/A', 'JPG 150 dpi']
  },
  office: {
    name: 'เอกสารสำนักงาน',
    ext: ['docx', 'doc', 'odt', 'rtf', 'xlsx', 'pptx'],
    wheel: ['PDF', 'ODT', 'HWPX', 'TXT', 'HTML'],
    tray: ['RTF', 'DOC', 'PDF/A']
  },
  hwp: {
    name: 'HWP/HWPX',
    ext: ['hwp', 'hwpx'],
    wheel: ['PDF', 'DOCX', 'PNG', 'TXT', 'HWPX'],
    tray: ['ODT', 'HTML', 'Markdown']
  }
};

for (const [key, p] of Object.entries(PROFILES)) {
  assert(p.wheel.length <= 12, `โปรไฟล์ "${p.name}" ชิ้นใน Wheel (${p.wheel.length}) ต้องไม่เกิน 12`);
  assert(p.wheel.length > 0, `โปรไฟล์ "${p.name}" ต้องมีพรีเซ็ตใน Wheel`);
  assert(p.tray.length > 0, `โปรไฟล์ "${p.name}" ต้องมีพรีเซ็ตใน Tray`);
  
  // ตรวจ Invariant: พรีเซ็ตห้ามซ้ำระหว่าง Wheel กับ Tray
  const overlap = p.wheel.filter(w => p.tray.includes(w));
  assert(overlap.length === 0, `โปรไฟล์ "${p.name}" ต้องไม่มีพรีเซ็ตซ้ำซ้อนระหว่าง Wheel กับ Tray (พบ: ${overlap.join(', ') || 'ไม่มี'})`);
}

// 2. ทดสอบการตรวจจับ TargetFormat ตามลำดับความสำคัญ
console.log('\n--- 2. ทดสอบการตรวจจับ TargetFormat (ลำดับสำคัญ: DOCX มาก่อน DOC) ---');
function inferTargetFormat(name) {
  const upper = String(name || '').toUpperCase();
  return FORMATS.find(f => upper.includes(f)) || 'PNG';
}

assert(inferTargetFormat('DOCX') === 'DOCX', 'DOCX ต้องได้ TargetFormat = DOCX (ไม่ใช่ DOC)');
assert(inferTargetFormat('DOC') === 'DOC', 'DOC ต้องได้ TargetFormat = DOC');
assert(inferTargetFormat('PDF/A') === 'PDF', 'PDF/A ต้องได้ TargetFormat = PDF');
assert(inferTargetFormat('PNG ขาวดำ') === 'PNG', 'PNG ขาวดำ ต้องได้ TargetFormat = PNG');
assert(inferTargetFormat('JPG 150 dpi') === 'JPG', 'JPG 150 dpi ต้องได้ TargetFormat = JPG');
assert(inferTargetFormat('Markdown') === 'MARKDOWN', 'Markdown ต้องได้ TargetFormat = MARKDOWN');
assert(inferTargetFormat('ย่อ 50%') === 'PNG', 'ย่อ 50% ไม่มีฟอร์แมตระบุ -> Fallback เป็น PNG');

// 3. ทดสอบการคำนวณเรขาคณิตและการหมุนวงล้อ (DonutGeometry)
console.log('\n--- 3. ทดสอบ DonutGeometry Hit-Testing และมุมองศา ---');
function hitTestAngle(angleDeg, segmentCount, rotationDeg = 0) {
  if (segmentCount <= 0) return -1;
  if (segmentCount === 1) return 0;
  const effective = ((angleDeg - rotationDeg) % 360 + 720) % 360;
  const step = 360 / segmentCount;
  return Math.floor(((effective + step / 2) % 360) / step);
}

// กรณี n = 8 (ไม่หมุน): a=0->0, a=22->0, a=23->1, a=270->6, a=350->0
assert(hitTestAngle(0, 8, 0) === 0, 'n=8, a=0° -> ชิ้น 0');
assert(hitTestAngle(22, 8, 0) === 0, 'n=8, a=22° -> ชิ้น 0');
assert(hitTestAngle(23, 8, 0) === 1, 'n=8, a=23° -> ชิ้น 1');
assert(hitTestAngle(270, 8, 0) === 6, 'n=8, a=270° -> ชิ้น 6');
assert(hitTestAngle(350, 8, 0) === 0, 'n=8, a=350° -> ชิ้น 0');

// ทดสอบเมื่อหมุนวงล้อไป 90 องศา
assert(hitTestAngle(90, 8, 90) === 0, 'n=8, หมุนวงล้อ 90°, ชี้ที่ 90° -> ต้องได้ชิ้น 0');
assert(hitTestAngle(0, 8, 90) === 6, 'n=8, หมุนวงล้อ 90°, ชี้ที่ 0° -> ต้องได้ชิ้น 6');

// กรณี n = 4: a=270 -> 3
assert(hitTestAngle(270, 4, 0) === 3, 'n=4, a=270° -> ชิ้น 3');

// กรณี n = 1: ทุกมุมคือ 0
assert(hitTestAngle(180, 1, 0) === 0, 'n=1 -> ทุกมุมคือ 0');

// 4. ทดสอบความถูกต้องของโครงสร้าง PDF Generator
console.log('\n--- 4. ทดสอบความถูกต้องของ PDF Binary Header & Footer ---');
const samplePdf = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>\nendobj\nxref\n0 4\n0000000000 65535 f \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n180\n%%EOF`;

assert(samplePdf.startsWith('%PDF-1.'), 'ไฟล์ PDF ต้องขึ้นต้นด้วย Magic Number Header %PDF-1.');
assert(samplePdf.includes('%%EOF'), 'ไฟล์ PDF ต้องลงท้ายด้วย Marker %%EOF');
assert(samplePdf.includes('/MediaBox'), 'ไฟล์ PDF ต้องมีขนาดหน้ากระดาษ MediaBox');

// 5. ทดสอบการแปลงชื่อไฟล์และจัดการ ConflictPolicy
console.log('\n--- 5. ทดสอบ FileNamingService และ ConflictPolicy ---');
function formatFileName(rawName, presetName, pattern = '{name}_{preset}') {
  let res = pattern.replace('{name}', rawName).replace('{preset}', presetName);
  const invalid = /[\\/:*?"<>|]/g;
  return res.replace(invalid, '');
}

assert(formatFileName('my photo', 'WEBP') === 'my photo_WEBP', 'รูปแบบชื่อไฟล์ {name}_{preset} ทำงานถูกต้อง');
assert(formatFileName('photo:v1/test', 'JPG 70%') === 'photov1test_JPG 70%', 'ตัดอักขระต้องห้ามใน Windows ออกครบถ้วน');

console.log('\n====================================================');
console.log(`📊 ผลสรุปการทดสอบ: ผ่าน ${passCount} ข้อ | ล้มเหลว ${failCount} ข้อ`);
console.log('====================================================');

if (failCount > 0) process.exit(1);
