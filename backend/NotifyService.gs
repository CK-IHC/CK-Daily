/**
 * NotifyService.gs — บันทึกแจ้งเตือนในแอป + LINE Notify + Email
 * ยังไม่ได้ต่อ SMS provider จริง (ดู sendOtpSms_) — ตอนนี้ระบบทำงานผ่าน OTP_DEV_MODE แทน
 */

var ORDER_EVENT_TEXT_ = {
  created: { title: 'รับออเดอร์แล้ว', body: 'เราได้รับคำสั่งซื้อ #{no} รอดำเนินการ' },
  status_in_progress: { title: 'กำลังดำเนินการ', body: 'ออเดอร์ #{no} กำลังดำเนินการ' },
  status_completed: { title: 'สำเร็จ', body: 'ออเดอร์ #{no} เสร็จสมบูรณ์' },
  status_cancelled: { title: 'ออเดอร์ถูกยกเลิก', body: 'ออเดอร์ #{no} ถูกยกเลิกแล้ว' },
  slip_uploaded: { title: 'ได้รับสลิปแล้ว', body: 'เราได้รับสลิปโอนเงินของออเดอร์ #{no} แล้ว รอตรวจสอบ' },
  payment_approved: { title: 'ยืนยันการชำระเงินแล้ว', body: 'การชำระเงินของออเดอร์ #{no} ได้รับการอนุมัติแล้ว' },
  payment_rejected: { title: 'สลิปไม่ผ่านการตรวจสอบ', body: 'สลิปของออเดอร์ #{no} ไม่ผ่านการตรวจสอบ กรุณาติดต่อร้าน' },
  payment_refunded: { title: 'คืนเงินแล้ว', body: 'ร้านได้คืนเงินสำหรับออเดอร์ #{no} เรียบร้อยแล้ว' }
};

function notifyOrderEvent_(order, eventType) {
  var text = ORDER_EVENT_TEXT_[eventType];
  if (!text) return;
  var body = text.body.replace('{no}', order.order_no);
  insertRow('Notifications', {
    noti_id: genId('NTF'), user_id: order.user_id, title: text.title, body: body,
    type: 'order', is_read: false, ref_id: order.order_id
  });
  if (eventType === 'created' || eventType === 'slip_uploaded') {
    notifyAdmins_('🔔 ' + text.title, 'ออเดอร์ #' + order.order_no + ' (' + order.customer_name + ') ยอด ฿' + order.grand_total);
  }
}

function notifyAdmins_(title, message) {
  var token = getSetting('line_notify_admin_token', '');
  if (token) sendLineNotify_(token, title + '\n' + message);
}

/** ===================== LINE Notify ===================== */
function sendLineNotify_(lineToken, message) {
  if (!lineToken) return false;
  try {
    UrlFetchApp.fetch('https://notify-api.line.me/api/notify', {
      method: 'post',
      headers: { Authorization: 'Bearer ' + lineToken },
      payload: { message: message },
      muteHttpExceptions: true
    });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * ส่ง OTP ทาง SMS จริง — ยังไม่ได้ผูก provider (Twilio/ThaiBulkSMS ฯลฯ)
 * ตอนต่อจริง: เก็บ SMS_API_KEY ไว้ใน PropertiesService แล้วเรียก UrlFetchApp ที่นี่
 * ปัจจุบัน (OTP_DEV_MODE=true) ฟังก์ชันนี้จะไม่ถูกเรียกใช้เลย
 */
function sendOtpSms_(phone, otpCode) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('SMS_API_KEY');
  if (!apiKey) return false;
  try {
    // ตัวอย่างโครงสร้างสำหรับต่อ provider จริง (ปรับ endpoint/payload ตาม provider ที่เลือกใช้)
    UrlFetchApp.fetch('https://api.thaibulksms.com/sms', {
      method: 'post',
      headers: { Authorization: 'Bearer ' + apiKey },
      payload: { msisdn: phone, message: 'CK Daily รหัส OTP ของคุณคือ ' + otpCode },
      muteHttpExceptions: true
    });
    return true;
  } catch (e) {
    return false;
  }
}

/** ===================== In-app notifications ===================== */
function notifyList(payload, token) {
  var auth = requireAuth(token);
  var rows = findAll('Notifications', function (n) { return n.user_id === auth.user.user_id; })
    .sort(function (a, b) { return toDate(b.created_at) - toDate(a.created_at); })
    .slice(0, numFrom(payload && payload.limit, 30));
  var unread = countRows('Notifications', function (n) { return n.user_id === auth.user.user_id && !boolFrom(n.is_read); });
  return ok({ items: rows, unread_count: unread });
}

function notifyMarkRead(payload, token) {
  var auth = requireAuth(token);
  requireFields(payload, ['noti_id']);
  var row = findOne('Notifications', function (n) { return n.noti_id === payload.noti_id && n.user_id === auth.user.user_id; }, true);
  if (row) updateRowAt('Notifications', row.__row, { is_read: true });
  return ok(null);
}

function notifyMarkAllRead(payload, token) {
  var auth = requireAuth(token);
  var rows = findAll('Notifications', function (n) { return n.user_id === auth.user.user_id && !boolFrom(n.is_read); });
  rows.forEach(function (r) { updateRowAt('Notifications', r.__row, { is_read: true }); });
  return ok(null);
}

/** ลบการแจ้งเตือนของตัวเอง (soft delete) — เช็คความเป็นเจ้าของด้วย user_id กันลบของคนอื่น */
function notifyDelete(payload, token) {
  var auth = requireAuth(token);
  requireFields(payload, ['noti_id']);
  var row = findOne('Notifications', function (n) { return n.noti_id === payload.noti_id && n.user_id === auth.user.user_id; }, true);
  if (row) updateRowAt('Notifications', row.__row, { is_deleted: true });
  return ok(null, 'ลบการแจ้งเตือนแล้ว');
}

/** ===================== แจ้งเตือนสต็อกต่ำ + สรุปยอดขายรายวัน (เรียกจาก Triggers.gs) ===================== */
function runLowStockAlert_() {
  var products = findAll('Products', function (p) { return boolFrom(p.track_stock) && boolFrom(p.is_active); });
  var low = products.filter(function (p) { return numFrom(p.stock_qty) <= numFrom(p.reorder_point); });
  if (!low.length) return;

  var lines = low.map(function (p) { return '- ' + p.name + ': เหลือ ' + numFrom(p.stock_qty) + ' ' + p.unit; });
  var message = '⚠️ สินค้าใกล้หมด/หมดสต็อก (' + low.length + ' รายการ)\n' + lines.join('\n');
  notifyAdmins_('แจ้งเตือนสต็อกต่ำ', message);

  var email = getSetting('admin_alert_email', '');
  if (email) {
    MailApp.sendEmail({ to: email, subject: '[CK Daily] แจ้งเตือนสต็อกต่ำ ' + low.length + ' รายการ', body: message });
  }
}

function runDailySummaryEmail_() {
  var email = getSetting('admin_alert_email', '');
  if (!email) return;
  var todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  var todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  var completed = ordersInRange_(todayStart, todayEnd, true);
  var sales = round2(completed.reduce(function (s, o) { return s + numFrom(o.grand_total); }, 0));
  var body = 'สรุปยอดขายวันที่ ' + Utilities.formatDate(new Date(), TIMEZONE, 'dd/MM/yyyy') + '\n' +
    'จำนวนออเดอร์สำเร็จ: ' + completed.length + '\n' + 'ยอดขายรวม: ฿' + sales;
  MailApp.sendEmail({ to: email, subject: '[CK Daily] สรุปยอดขายประจำวัน', body: body });
  notifyAdmins_('สรุปยอดขายวันนี้', 'ยอดขาย ฿' + sales + ' (' + completed.length + ' ออเดอร์)');
}
