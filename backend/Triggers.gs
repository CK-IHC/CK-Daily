/**
 * Triggers.gs — Time-driven triggers: ปิดรอบอัตโนมัติ, แจ้งสต็อกต่ำ, สรุปยอดรายวัน, archive
 * วิธีติดตั้ง: เปิด Apps Script Editor เลือกฟังก์ชัน installAllTriggers แล้วกด Run ครั้งเดียว
 */

function installAllTriggers() {
  removeAllTriggers_();
  ScriptApp.newTrigger('autoCloseRoundsJob').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('lowStockAlertJob').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('dailySummaryEmailJob').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('archiveOldOrdersJob').timeBased().onMonthDay(1).atHour(2).create();
  return ok(null, 'ติดตั้ง Trigger ทั้งหมดแล้ว');
}

function removeAllTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

/** ปิดรอบอัตโนมัติเมื่อถึงเวลา close_at — รันทุก 5 นาที */
function autoCloseRoundsJob() {
  var now = new Date();
  var toClose = findAll('Rounds', function (r) { return r.status === 'open' && toDate(r.close_at) && toDate(r.close_at) <= now; }, true);
  toClose.forEach(function (r) {
    updateRowAt('Rounds', r.__row, { status: 'closed' });
    writeAudit('system', 'system', 'auto_close_round', 'Round', r.round_id, { status: 'open' }, { status: 'closed' });
  });
}

/** แจ้งเตือนสต็อกต่ำ — รันทุกชั่วโมง แต่ยิงจริงเฉพาะชั่วโมงที่ตั้งไว้ใน Settings (กันสแปม) */
function lowStockAlertJob() {
  var targetHour = numFrom(getSetting('low_stock_check_hour', '8'));
  var currentHour = Number(Utilities.formatDate(new Date(), TIMEZONE, 'H'));
  if (currentHour !== targetHour) return;
  runLowStockAlert_();
}

/** สรุปยอดขายประจำวันทาง Email — รันทุกชั่วโมง แต่ยิงจริงเฉพาะชั่วโมงที่ตั้งไว้ */
function dailySummaryEmailJob() {
  var targetHour = numFrom(getSetting('daily_summary_hour', '21'));
  var currentHour = Number(Utilities.formatDate(new Date(), TIMEZONE, 'H'));
  if (currentHour !== targetHour) return;
  runDailySummaryEmail_();
}

/** Archive ออเดอร์เก่ากว่า 6 เดือน ไปยัง Orders_Archive — รันวันที่ 1 ของทุกเดือน */
function archiveOldOrdersJob() {
  var cutoff = addDays(new Date(), -180);
  var oldOrders = findAll('Orders', function (o) {
    return toDate(o.placed_at) && toDate(o.placed_at) < cutoff && (o.status === 'completed' || o.status === 'cancelled');
  }, true);
  if (!oldOrders.length) return;
  insertRows('Orders_Archive', oldOrders.map(function (o) {
    var copy = {}; SHEET_SCHEMAS.Orders.forEach(function (h) { copy[h] = o[h]; }); return copy;
  }));
  var sh = getSheet('Orders');
  oldOrders.sort(function (a, b) { return b.__row - a.__row; }).forEach(function (o) { sh.deleteRow(o.__row); });
  invalidateCache('Orders');
  writeAudit('system', 'system', 'archive_orders', 'Order', '', null, { count: oldOrders.length });
}
