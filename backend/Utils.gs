/**
 * Utils.gs — ค่าคงที่ร่วม, ตัวสร้าง ID, validation, response schema, helper วันเวลา
 * CK Daily — by IHC-Central Kitchen
 */

// ตั้งค่า Sheet ID เริ่มต้น (override ได้ผ่าน Script Properties key "SHEET_ID")
var DEFAULT_SHEET_ID = '1o_oJ2R29pfs15YbxStAUfb6j4VggVA2xLWgWvKeoGRU';
var TIMEZONE = 'Asia/Bangkok';

// ถ้า true, action auth.requestOtp จะคืน otp_code/ref_code ตรงใน response แทนการส่ง SMS จริง
// (ยังไม่ได้ผูก SMS provider — เปลี่ยนเป็น false หลังต่อ Twilio/ThaiBulkSMS ใน NotifyService.gs)
var OTP_DEV_MODE = true;

function getSheetId_() {
  var override = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return override || DEFAULT_SHEET_ID;
}

function getSpreadsheet() {
  return SpreadsheetApp.openById(getSheetId_());
}

/** ===================== Response Schema มาตรฐาน ===================== */
function nowIso_() {
  return Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function ok(data, message) {
  return {
    success: true,
    data: (data === undefined) ? null : data,
    error: null,
    message: message || '',
    timestamp: nowIso_()
  };
}

function fail(code, message, field) {
  return {
    success: false,
    data: null,
    error: { code: code, field: field || null },
    message: message || '',
    timestamp: nowIso_()
  };
}

/** Error โยนขึ้นภายในระบบ พร้อม error code มาตรฐาน */
function ApiError(code, message, field) {
  this.code = code;
  this.message = message;
  this.field = field || null;
}
ApiError.prototype = Object.create(Error.prototype);
ApiError.prototype.name = 'ApiError';

/** ===================== ID Generators ===================== */
function randomDigits_(n) {
  var s = '';
  for (var i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function genId(prefix) {
  var datePart = Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMdd');
  return prefix + '-' + datePart + '-' + randomDigits_(4) + Utilities.getUuid().slice(0, 4).toUpperCase();
}

function genRoundId() {
  var datePart = Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMdd');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var cache = CacheService.getScriptCache();
    var key = 'round_seq_' + datePart;
    var seq = Number(cache.get(key) || '0') + 1;
    cache.put(key, String(seq), 21600);
    return 'RND-' + datePart + '-' + (seq < 10 ? '0' + seq : seq);
  } finally {
    lock.releaseLock();
  }
}

/**
 * เลขที่ออเดอร์รันต่อเดือน รูปแบบ YYMM-### (เช่น 2607-001 = กรกฎาคม 2569 ลำดับที่ 1)
 * หาลำดับถัดไปจากข้อมูลจริงใน Sheet (ไม่ใช้ CacheService เพราะ TTL สั้นเกินไปสำหรับรอบเดือน)
 * ต้องเรียกภายใต้ LockService ของผู้เรียกเสมอ (OrderService ถือ lock อยู่แล้วตอนสั่งซื้อ) กันเลขซ้ำ
 */
function nextOrderSeqForMonth_(monthKey) {
  var prefix = monthKey + '-';
  var max = 0;
  findAll('Orders', function (o) { return String(o.order_no || '').indexOf(prefix) === 0; }, true).forEach(function (o) {
    var n = Number(String(o.order_no).slice(prefix.length));
    if (!isNaN(n) && n > max) max = n;
  });
  return max + 1;
}

function genOrderId() {
  var monthKey = Utilities.formatDate(new Date(), TIMEZONE, 'yyMM');
  var seq = nextOrderSeqForMonth_(monthKey);
  var no = (seq < 10 ? '00' : seq < 100 ? '0' : '') + seq;
  var orderNo = monthKey + '-' + no;
  return { order_id: 'ORD-' + orderNo, order_no: orderNo };
}

/** ===================== Validation & Sanitize ===================== */
function isValidThaiPhone(phone) {
  return /^0[689][0-9]{8}$/.test(String(phone || ''));
}

function requireFields(payload, fields) {
  payload = payload || {};
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    if (payload[f] === undefined || payload[f] === null || payload[f] === '') {
      throw new ApiError('E_INVALID_PAYLOAD', 'กรุณากรอกข้อมูล: ' + f, f);
    }
  }
}

/**
 * กัน formula injection เมื่อเขียนลง Sheets + บังคับ text สำหรับสตริงที่ขึ้นต้นด้วยเลข 0
 * (เช่นเบอร์โทร "08xxxxxxxx") ไม่งั้น Sheets จะตีความเป็นตัวเลขแล้วตัดเลข 0 นำหน้าทิ้งอัตโนมัติ
 */
function sanitizeCell(value) {
  if (typeof value !== 'string') return value;
  if (/^[=+\-@]/.test(value)) return "'" + value;
  if (/^0[0-9]+$/.test(value)) return "'" + value;
  return value;
}

function sanitizeObject(obj) {
  var out = {};
  for (var k in obj) {
    if (!obj.hasOwnProperty(k)) continue;
    out[k] = sanitizeCell(obj[k]);
  }
  return out;
}

/**
 * แก้เบอร์โทรที่ Sheets ตัดเลข 0 นำหน้าทิ้งไปแล้ว (แถวเก่าก่อนแก้ sanitizeCell หรือกรณีอื่นๆ ที่หลุดรอด)
 * เบอร์มือถือไทยมี 10 หลักเสมอ ถ้าเหลือ 9 หลักพอดีแปลว่าเลข 0 ตัวแรกหายไป — เติมกลับให้
 */
function normalizePhone_(v) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (/^[0-9]{9}$/.test(s)) s = '0' + s;
  return s;
}

/**
 * แปลงสถานะออเดอร์รุ่นเก่า (confirmed/preparing/ready/delivering — ก่อนยุบเหลือ 4 สถานะ) ให้เป็นสถานะปัจจุบันเสมอ
 * กันออเดอร์เก่าที่ยังไม่ได้รัน migrateOrderStatuses() หายไปจากทุกหน้าจอที่กรอง/แสดงสถานะ (ประวัติการสั่งซื้อ ฯลฯ)
 */
var LEGACY_ORDER_STATUS_MAP_ = { confirmed: 'in_progress', preparing: 'in_progress', ready: 'in_progress', delivering: 'in_progress' };
function normalizeOrderStatus_(s) {
  return LEGACY_ORDER_STATUS_MAP_[s] || s;
}

/** ===================== Date helpers ===================== */
function toDate(v) {
  if (v instanceof Date) return v;
  if (!v) return null;
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function addDays(date, days) {
  var d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function fmtDateTime(date) {
  if (!date) return '';
  return Utilities.formatDate(toDate(date), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/** ===================== Password/OTP hash (SHA-256) ===================== */
function sha256_(text) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return raw.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

/** ===================== Misc ===================== */
function boolFrom(v) {
  return v === true || v === 'TRUE' || v === 'true' || v === 1 || v === '1';
}

function numFrom(v, def) {
  var n = Number(v);
  return isNaN(n) ? (def === undefined ? 0 : def) : n;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
