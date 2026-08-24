/**
 * ReportSheetService.gs — สร้าง/รีเฟรช "Report Sheet" อ่านง่ายสำหรับ Orders/OrderItems/StockMovements
 * ต่างจากชีตข้อมูลดิบ (Orders/OrderItems/StockMovements) ตรงที่ตัดคอลัมน์ภายใน (is_deleted, __row ฯลฯ) ออก
 * รวมชื่อ/รหัสที่อ่านง่าย (order_no แทน order_id, ชื่อผู้ทำรายการแทน user_id) เหมาะให้ฝ่ายบัญชี/ผู้บริหาร
 * เปิดดูตรงใน Google Sheets ได้ทันทีโดยไม่ต้องเข้าระบบแอดมิน — เรียกซ้ำได้ปลอดภัยเสมอ (เขียนทับของเดิมทั้งชีต)
 */

var REPORT_SHEET_HEADER_BG_ = '#1f2937';

/** เขียนชีตรายงานหนึ่งชีต: ล้างข้อมูลเดิมทั้งหมดแล้วเขียน header + rows ใหม่ในครั้งเดียว (เร็ว ไม่วนเขียนทีละเซลล์) */
function writeReportSheet_(ss, name, headers, rows) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground(REPORT_SHEET_HEADER_BG_).setFontColor('#ffffff');
  sh.setFrozenRows(1);
  if (rows.length) {
    sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  sh.autoResizeColumns(1, headers.length);
  return rows.length;
}

/**
 * admin.reports.generateSheets — สร้าง/รีเฟรชชีต Report_Orders, Report_OrderItems, Report_StockMovements
 * เรียกซ้ำได้ปลอดภัยเสมอ (เขียนทับข้อมูลเดิมทั้งชีตทุกครั้ง ไม่สะสมข้อมูลซ้ำ)
 */
function adminReportsGenerateSheets(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  var ss = getSpreadsheet();

  // ---------- Report_Orders ----------
  var orders = findAll('Orders', null).sort(function (a, b) { return toDate(b.placed_at) - toDate(a.placed_at); });
  var roundNameById = {};
  findAll('Rounds', null, true).forEach(function (r) { roundNameById[r.round_id] = r.round_name; });
  var orderTypeLabel_ = { pickup: 'รับที่ร้าน', delivery: 'จัดส่ง', dine_in: 'ทานที่ร้าน' };
  var paymentMethodLabel_ = { cash: 'เงินสด', transfer: 'โอนเงิน', promptpay: 'พร้อมเพย์', credit: 'บัตรเครดิต' };
  var paymentStatusLabel_ = { unpaid: 'ยังไม่ชำระ', pending_verify: 'รอตรวจสอบสลิป', paid: 'ชำระแล้ว', refunded: 'คืนเงินแล้ว' };
  var orderStatusLabel_ = { pending: 'รอดำเนินการ', in_progress: 'กำลังดำเนินการ', completed: 'สำเร็จ', cancelled: 'ยกเลิก' };
  var ordersHeaders = ['เลขที่ออเดอร์', 'ชื่อลูกค้า', 'เบอร์โทร', 'แผนก', 'รอบการขาย', 'ประเภท', 'ยอดรวมสินค้า', 'ส่วนลด', 'ยอดสุทธิ', 'วิธีชำระเงิน', 'สถานะการชำระเงิน', 'สถานะออเดอร์', 'เวลาสั่งซื้อ', 'เวลาสำเร็จ'];
  var ordersRows = orders.map(function (o) {
    var status = normalizeOrderStatus_(o.status);
    return [
      o.order_no, o.customer_name, normalizePhone_(o.phone), departmentForUser_(o.user_id), roundNameById[o.round_id] || '',
      orderTypeLabel_[o.order_type] || o.order_type, numFrom(o.subtotal), numFrom(o.discount), numFrom(o.grand_total),
      paymentMethodLabel_[o.payment_method] || o.payment_method, paymentStatusLabel_[o.payment_status] || o.payment_status,
      orderStatusLabel_[status] || status, o.placed_at, o.completed_at || ''
    ];
  });
  var ordersCount = writeReportSheet_(ss, 'Report_Orders', ordersHeaders, ordersRows);

  // ---------- Report_OrderItems ----------
  var orderNoById = {};
  orders.forEach(function (o) { orderNoById[o.order_id] = o.order_no; });
  var items = findAll('OrderItems', null).sort(function (a, b) { return toDate(b.created_at) - toDate(a.created_at); });
  var itemsHeaders = ['เลขที่ออเดอร์', 'รหัส SKU', 'ชื่อสินค้า', 'จำนวน', 'ราคาต่อหน่วย', 'ยอดรวม', 'หมายเหตุ', 'เวลา'];
  var itemsRows = items.map(function (i) {
    return [orderNoById[i.order_id] || i.order_id, i.sku || '', i.product_name, numFrom(i.qty), numFrom(i.unit_price), numFrom(i.line_total), i.note || '', i.created_at];
  });
  var itemsCount = writeReportSheet_(ss, 'Report_OrderItems', itemsHeaders, itemsRows);

  // ---------- Report_StockMovements ----------
  var productNameById = {};
  findAll('Products', null, true).forEach(function (p) { productNameById[p.product_id] = p.name; });
  var userNameById = {};
  findAll('Users', null, true).forEach(function (u) { userNameById[u.user_id] = u.name || normalizePhone_(u.phone); });
  var movTypeLabel = { out: 'ตัดสต็อก (ขาย)', 'return': 'คืนสต็อก (ยกเลิก)', in: 'รับเข้า', adjust: 'ปรับยอด', waste: 'ของเสีย/สูญหาย' };
  var movRefTypeLabel_ = { order: 'ออเดอร์', manual: 'ปรับปรุงมือ' };
  var movements = findAll('StockMovements', null, true).sort(function (a, b) { return toDate(b.created_at) - toDate(a.created_at); });
  var movHeaders = ['รหัส SKU', 'ชื่อสินค้า', 'ประเภทการเคลื่อนไหว', 'จำนวนที่เปลี่ยน', 'คงเหลือก่อน', 'คงเหลือหลัง', 'อ้างอิงจาก', 'เหตุผล', 'ผู้ทำรายการ', 'เวลา'];
  var movRows = movements.map(function (m) {
    return [
      m.sku || '', productNameById[m.product_id] || m.product_id, movTypeLabel[m.type] || m.type, numFrom(m.qty_change),
      numFrom(m.qty_before), numFrom(m.qty_after), movRefTypeLabel_[m.ref_type] || m.ref_type || '', m.reason || '', userNameById[m.by_user_id] || m.by_user_id || 'ระบบ', m.created_at
    ];
  });
  var movCount = writeReportSheet_(ss, 'Report_StockMovements', movHeaders, movRows);

  writeAudit(auth.user.user_id, auth.user.role, 'generate_report_sheets', 'Report', '', null, { orders: ordersCount, items: itemsCount, movements: movCount });
  return ok({ orders: ordersCount, order_items: itemsCount, stock_movements: movCount }, 'สร้าง Report Sheet แล้ว (Report_Orders, Report_OrderItems, Report_StockMovements)');
}
