/**
 * SlipOcrService.gs — อ่านข้อความจากรูปสลิปด้วย OCR (ผ่าน Advanced Drive Service) แล้วแกะยอดเงิน/วันที่โอน
 * ออกมาเทียบกับยอดที่ต้องชำระ ช่วยแอดมินตรวจสอบเร็วขึ้นเท่านั้น — เป็นการอ่านแบบ heuristic (regex) ความแม่นยำ
 * ขึ้นกับรูปแบบสลิปแต่ละธนาคาร/คุณภาพรูป "ไม่ใช่การยืนยันอัตโนมัติ 100%" แอดมินควรดูรูปจริงประกอบการตัดสินใจเสมอ
 *
 * ข้อกำหนดก่อนใช้งาน: ต้องเปิด "Drive API" (Advanced Google Services) ในโปรเจกต์ Apps Script ก่อน ไม่งั้น
 * ฟังก์ชันนี้จะคืนค่า ocr_available: false ให้ frontend แจ้งเตือนแทนการ error ทั้งหน้า
 * วิธีเปิด: Apps Script Editor → Services (ไอคอน +) ด้านซ้าย → เลือก "Drive API" → Add
 */

function slipOcrAvailable_() {
  try { return typeof Drive !== 'undefined' && !!Drive.Files; } catch (e) { return false; }
}

/** แปลงรูปเป็นข้อความด้วย OCR ผ่านการสร้าง Google Doc ชั่วคราว (ลบทิ้งทันทีหลังอ่านเสร็จ) */
function extractTextFromDriveImage_(driveFileId) {
  var blob = DriveApp.getFileById(driveFileId).getBlob();
  var resource = { title: 'slip-ocr-temp-' + Date.now(), mimeType: MimeType.GOOGLE_DOCS };
  var docFile = Drive.Files.insert(resource, blob, { ocr: true, ocrLanguage: 'th' });
  try {
    return DocumentApp.openById(docFile.id).getBody().getText();
  } finally {
    try { Drive.Files.remove(docFile.id); } catch (e2) { /* เก็บกวาดไฟล์ชั่วคราวไม่สำเร็จ ไม่กระทบผลลัพธ์ที่อ่านไปแล้ว */ }
  }
}

/** แกะยอดเงินจากข้อความ OCR — เลือกตัวเลขที่อยู่ใกล้คำว่า "จำนวนเงิน/ยอดเงิน" ก่อนเสมอ ถ้าไม่เจอ fallback เป็นตัวเลขรูปแบบเงินที่ใหญ่ที่สุดในข้อความ */
function parseAmountFromOcrText_(text) {
  var labeled = /(?:จำนวนเงิน|ยอดเงิน|โอนเงิน|ยอดโอน|Amount)[^\d]{0,10}(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/i.exec(text);
  if (labeled) return numFrom(labeled[1].replace(/,/g, ''));
  var matches = text.match(/\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?/g) || [];
  var nums = matches.map(function (m) { return numFrom(m.replace(/,/g, '')); }).filter(function (n) { return n > 0 && n < 1000000; });
  if (!nums.length) return null;
  return Math.max.apply(null, nums);
}

/** แกะวันที่โอนจากข้อความ OCR — รองรับรูปแบบตัวเลข dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy (ไม่แปลง พ.ศ./ค.ศ. คืนค่าดิบตามที่อ่านได้) */
function parseDateFromOcrText_(text) {
  var m = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/.exec(text);
  return m ? (m[1] + '/' + m[2] + '/' + m[3]) : null;
}

/** admin.orders.analyzeSlip — อ่านยอดเงิน/วันที่จากรูปสลิปด้วย OCR แล้วเทียบกับยอดที่ต้องชำระของออเดอร์นั้น */
function adminOrdersAnalyzeSlip(payload, token) {
  requireRole(token, ['staff', 'manager', 'admin']);
  requireFields(payload, ['order_id']);
  var order = findOne('Orders', function (r) { return r.order_id === payload.order_id; }, true);
  if (!order) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบออเดอร์', 'order_id');
  if (!slipOcrAvailable_()) {
    return ok({ ocr_available: false, message: 'ยังไม่ได้เปิดใช้งาน Drive API (Advanced Service) ในโปรเจกต์ Apps Script — ดูวิธีเปิดในคอมเมนต์ท้ายไฟล์ SlipOcrService.gs' });
  }
  var urls = parseSlipUrls_(order);
  var targetUrl = urls.length ? urls[urls.length - 1] : order.slip_url;
  var m = /[?&]id=([^&]+)/.exec(targetUrl || '');
  if (!m) return ok({ ocr_available: true, extracted_amount: null, extracted_date: null, amount_match: null, message: 'ไม่พบไฟล์สลิป' });
  try {
    var text = extractTextFromDriveImage_(m[1]);
    var amount = parseAmountFromOcrText_(text);
    var date = parseDateFromOcrText_(text);
    var orderAmount = numFrom(order.grand_total);
    var amountMatch = amount === null ? null : Math.abs(amount - orderAmount) < 1;
    return ok({ ocr_available: true, extracted_amount: amount, extracted_date: date, order_amount: orderAmount, amount_match: amountMatch });
  } catch (e) {
    return ok({ ocr_available: true, extracted_amount: null, extracted_date: null, amount_match: null, message: 'อ่านสลิปไม่สำเร็จ: ' + e.message });
  }
}
