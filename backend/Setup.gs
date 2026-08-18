/**
 * Setup.gs — สร้าง Sheet ทั้งหมด + header + seed data ในคลิกเดียว
 * วิธีใช้: เปิด Apps Script Editor เลือกฟังก์ชัน setupDatabase แล้วกด Run ครั้งเดียว
 */

function setupDatabase() {
  var ss = getSpreadsheet();
  var sheetNames = Object.keys(SHEET_SCHEMAS);

  sheetNames.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    var headers = SHEET_SCHEMAS[name];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  });

  // ลบชีตเริ่มต้น "Sheet1" ถ้ายังไม่ถูกใช้งานเป็นหนึ่งใน 15 ตาราง
  var default1 = ss.getSheetByName('Sheet1');
  if (default1 && sheetNames.indexOf('Sheet1') === -1) {
    ss.deleteSheet(default1);
  }

  seedSettings_();
  seedCategoriesAndProducts_();
  seedSampleRound_();
  seedAdminUser_();

  SpreadsheetApp.flush();
  return ok({ sheets: sheetNames }, 'สร้างฐานข้อมูลสำเร็จ ' + sheetNames.length + ' ตาราง');
}

function seedSettings_() {
  var defaults = [
    ['shop_name', 'CK Daily by IHC-Central Kitchen', 'ชื่อร้าน'],
    ['vat_rate', '7', 'อัตรา VAT (%)'],
    ['delivery_fee', '0', 'ค่าส่งมาตรฐาน (บาท)'],
    ['promptpay_id', '', 'เบอร์/เลขบัตร PromptPay (ใส่เองภายหลัง)'],
    ['payment_qr_url', '', 'รูป QR ชำระเงินของร้าน (อัปโหลดจากหน้าตั้งค่า)'],
    ['open_hours', '08:00-18:00', 'เวลาเปิด-ปิดร้าน'],
    ['points_per_baht', '0.01', 'อัตราแต้มสะสมต่อ 1 บาท'],
    ['line_token', '', 'LINE Notify token (ใส่เองภายหลัง)'],
    ['line_notify_admin_token', '', 'LINE token แจ้งเตือนแอดมิน'],
    ['admin_alert_email', '', 'อีเมลรับสรุปยอดขาย/แจ้งสต็อกต่ำ'],
    ['otp_dev_mode', 'true', 'true = ไม่ส่ง SMS จริง คืน OTP ใน response เพื่อทดสอบ'],
    ['low_stock_check_hour', '8', 'ชั่วโมงที่เช็คสต็อกต่ำทุกเช้า (0-23)'],
    ['daily_summary_hour', '21', 'ชั่วโมงส่งสรุปยอดขายประจำวัน (0-23)']
  ];
  defaults.forEach(function (d) {
    var existing = findOne('Settings', function (r) { return r.key === d[0]; });
    if (!existing) insertRow('Settings', { key: d[0], value: d[1], description: d[2] });
  });
}

function seedCategoriesAndProducts_() {
  var existingCats = readAll('Categories');
  if (existingCats.length > 0) return; // seed แค่ครั้งแรก

  var cats = [
    { category_id: 'CAT-0001', name: 'เครื่องดื่ม', sort_order: 1, icon: '🥤', is_active: true },
    { category_id: 'CAT-0002', name: 'เบเกอรี่', sort_order: 2, icon: '🥐', is_active: true },
    { category_id: 'CAT-0003', name: 'อาหารจานหลัก', sort_order: 3, icon: '🍱', is_active: true }
  ];
  insertRows('Categories', cats);

  var products = [
    { product_id: 'PRD-00001', sku: 'DRK-001', name: 'ลาเต้ร้อน', category_id: 'CAT-0001', description: 'กาแฟลาเต้ร้อนหอมกรุ่น', image_url: '', cost_price: 20, price: 55, unit: 'แก้ว', track_stock: true, stock_qty: 50, reorder_point: 10, max_per_order: 10, has_options: true, is_active: true, sort_order: 1 },
    { product_id: 'PRD-00002', sku: 'DRK-002', name: 'ลาเต้เย็น', category_id: 'CAT-0001', description: 'กาแฟลาเต้เย็นชื่นใจ', image_url: '', cost_price: 22, price: 60, unit: 'แก้ว', track_stock: true, stock_qty: 50, reorder_point: 10, max_per_order: 10, has_options: true, is_active: true, sort_order: 2 },
    { product_id: 'PRD-00003', sku: 'BKY-001', name: 'ครัวซองต์เนย', category_id: 'CAT-0002', description: 'ครัวซองต์เนยสดอบใหม่', image_url: '', cost_price: 15, price: 45, unit: 'ชิ้น', track_stock: true, stock_qty: 30, reorder_point: 5, max_per_order: 10, has_options: false, is_active: true, sort_order: 1 },
    { product_id: 'PRD-00004', sku: 'MAIN-001', name: 'ข้าวกะเพราไก่', category_id: 'CAT-0003', description: 'ข้าวกะเพราไก่ไข่ดาว', image_url: '', cost_price: 30, price: 65, unit: 'กล่อง', track_stock: true, stock_qty: 20, reorder_point: 5, max_per_order: 5, has_options: false, is_active: true, sort_order: 1 }
  ];
  insertRows('Products', products);

  var options = [
    { option_id: 'OPT-0001', product_id: 'PRD-00001', group_name: 'ระดับความหวาน', option_name: 'หวานน้อย', price_delta: 0, is_required: true, max_select: 1, stock_link_product_id: '' },
    { option_id: 'OPT-0002', product_id: 'PRD-00001', group_name: 'ระดับความหวาน', option_name: 'หวานปกติ', price_delta: 0, is_required: true, max_select: 1, stock_link_product_id: '' },
    { option_id: 'OPT-0003', product_id: 'PRD-00001', group_name: 'ขนาด', option_name: 'ไซส์ใหญ่ (+10.-)', price_delta: 10, is_required: false, max_select: 1, stock_link_product_id: '' },
    { option_id: 'OPT-0004', product_id: 'PRD-00002', group_name: 'ระดับความหวาน', option_name: 'หวานน้อย', price_delta: 0, is_required: true, max_select: 1, stock_link_product_id: '' },
    { option_id: 'OPT-0005', product_id: 'PRD-00002', group_name: 'ระดับความหวาน', option_name: 'หวานปกติ', price_delta: 0, is_required: true, max_select: 1, stock_link_product_id: '' }
  ];
  insertRows('ProductOptions', options);
}

function seedSampleRound_() {
  var existing = readAll('Rounds');
  if (existing.length > 0) return;
  var now = new Date();
  var open = now;
  var close = addMinutes(now, 180);
  var deliver = addMinutes(now, 240);
  insertRow('Rounds', {
    round_id: genRoundId(),
    round_name: 'รอบตัวอย่าง (แก้ไข/ลบได้จากหน้าแอดมิน)',
    open_at: fmtDateTime(open),
    close_at: fmtDateTime(close),
    delivery_at: fmtDateTime(deliver),
    status: 'open',
    capacity: 0,
    current_orders: 0,
    note: 'สั่งได้ถึง ' + Utilities.formatDate(close, TIMEZONE, 'HH:mm')
  });
}

function seedAdminUser_() {
  var existing = findOne('Users', function (r) { return r.role === 'admin'; });
  if (existing) return;
  insertRow('Users', {
    user_id: genId('USR'),
    phone: '0800000000',
    name: 'Admin',
    role: 'admin',
    points: 0,
    tier: 'gold',
    default_address: '',
    status: 'active',
    last_login_at: ''
  });
}

/**
 * migrateOrderStatuses — ย้ายสถานะออเดอร์เก่า (confirmed/preparing/ready/delivering) มาเป็น
 * "in_progress" ค่าเดียว ตามระบบสถานะใหม่ 4 ค่า (pending/in_progress/completed/cancelled)
 * รันครั้งเดียวจาก Apps Script Editor หลังอัปเดตโค้ดรอบนี้ (ปลอดภัย รันซ้ำได้เสมอ ไม่มีอะไรให้ย้ายก็แค่ไม่ทำอะไร)
 * วิธีใช้: เลือกฟังก์ชัน migrateOrderStatuses แล้วกด Run
 */
function migrateOrderStatuses() {
  var legacy = ['confirmed', 'preparing', 'ready', 'delivering'];
  var count = 0;
  ['Orders', 'Orders_Archive'].forEach(function (name) {
    var rows = findAll(name, function (r) { return legacy.indexOf(r.status) > -1; }, true);
    rows.forEach(function (r) { updateRowAt(name, r.__row, { status: 'in_progress' }); count++; });
  });
  return ok({ migrated: count }, 'ย้ายสถานะออเดอร์เก่า ' + count + ' รายการ เป็น "กำลังดำเนินการ" แล้ว');
}

/**
 * repairSchema — เติมคอลัมน์ที่ขาดไปให้ Sheet ที่มีข้อมูลอยู่แล้ว (ไม่ลบ/ไม่ย้ายข้อมูลเดิม)
 * ใช้รันทุกครั้งหลังอัปเดตโค้ด backend ที่มีการเพิ่ม field ใหม่ใน SHEET_SCHEMAS (ปลอดภัย รันซ้ำได้เสมอ)
 * วิธีใช้: เลือกฟังก์ชัน repairSchema แล้วกด Run
 */
function repairSchema() {
  var ss = getSpreadsheet();
  var report = [];

  Object.keys(SHEET_SCHEMAS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      var headers = SHEET_SCHEMAS[name];
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
      report.push(name + ': สร้างชีตใหม่ทั้งหมด');
      return;
    }
    var lastCol = sh.getLastColumn();
    var existing = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    var missing = SHEET_SCHEMAS[name].filter(function (h) { return existing.indexOf(h) === -1; });
    if (missing.length) {
      var startCol = existing.length + 1;
      sh.getRange(1, startCol, 1, missing.length).setValues([missing]);
      sh.getRange(1, startCol, 1, missing.length).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
      report.push(name + ': เพิ่มคอลัมน์ ' + missing.join(', '));
    }
    invalidateCache(name);
  });

  SpreadsheetApp.flush();
  return ok({ report: report }, report.length ? ('อัปเดต schema แล้ว: ' + report.length + ' ชีต') : 'schema ครบถ้วนอยู่แล้ว ไม่มีอะไรต้องแก้');
}

/**
 * migratePaymentsAddCustomerColumns — จัดคอลัมน์ชีต Payments ใหม่ให้ตรงกับ SHEET_SCHEMAS ปัจจุบัน
 * (customer_name, phone ถัดจาก order_id) พร้อมย้อนกลับไปเติมชื่อ/เบอร์ให้แถวเก่าที่ยังไม่มีข้อมูลนี้
 * โดย join จาก Orders ผ่าน order_id — ต้องรันหลัง repairSchema ครั้งเดียว (ปลอดภัย รันซ้ำได้เสมอ)
 * เหตุผลที่ repairSchema เพียงอย่างเดียวไม่พอ: มันแค่ต่อคอลัมน์ใหม่ท้ายชีตเสมอ ไม่ได้จัดตำแหน่งให้ตรงกับที่ประกาศไว้
 * วิธีใช้: เลือกฟังก์ชัน migratePaymentsAddCustomerColumns แล้วกด Run
 */
function migratePaymentsAddCustomerColumns() {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName('Payments');
  if (!sh) return ok({ migrated: 0 }, 'ยังไม่มีชีต Payments');

  var orderById_ = {};
  findAll('Orders', null, true).forEach(function (o) { orderById_[o.order_id] = o; });
  var archiveById_ = {};
  findAll('Orders_Archive', null, true).forEach(function (o) { archiveById_[o.order_id] = o; });

  var rows = findAll('Payments', null, true);
  var headers = SHEET_SCHEMAS.Payments;
  var matrix = rows.map(function (p) {
    var ord = orderById_[p.order_id] || archiveById_[p.order_id];
    var customerName = p.customer_name || (ord ? ord.customer_name : '');
    var phone = p.phone || (ord ? normalizePhone_(ord.phone) : '');
    return headers.map(function (h) {
      if (h === 'customer_name') return customerName;
      if (h === 'phone') return phone;
      return p[h] !== undefined ? p[h] : '';
    });
  });

  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  if (matrix.length) sh.getRange(2, 1, matrix.length, headers.length).setValues(matrix);
  invalidateCache('Payments');
  return ok({ migrated: matrix.length }, 'จัดคอลัมน์ Payments ใหม่แล้ว (' + matrix.length + ' แถว)');
}

/**
 * migrateOrderItemsBackfillFields — จัดคอลัมน์ชีต OrderItems ใหม่ให้ตรงกับ SHEET_SCHEMAS ปัจจุบัน (sku ตาม
 * ด้วย customer_name, user_id, phone, category_id ก่อน product_name) พร้อมเติมย้อนหลังให้แถวเก่าที่ยังไม่มี
 * ข้อมูลพวกนี้ — category_id ผูกจาก product_id ไปยัง Products.category_id, ที่เหลือ (order_no, customer_name,
 * user_id, phone) ผูกจาก order_id ไปยัง Orders/Orders_Archive (สินค้า/ออเดอร์ที่ถูกลบไปแล้วจะไม่มีข้อมูล
 * ย้อนหลังให้ เพราะไม่มีต้นทางให้ join) — แทนที่ migrateOrderItemsAddCategory/migrateOrderItemsAddCategoryAndOrderNo
 * รุ่นก่อนหน้าไปเลย (รันตัวนี้แทนได้ทันที ไม่ต้องรันตัวเก่าก่อน ปลอดภัย รันซ้ำได้เสมอ)
 * ต้องรันหลัง repairSchema ครั้งเดียว วิธีใช้: เลือกฟังก์ชัน migrateOrderItemsBackfillFields แล้วกด Run
 */
function migrateOrderItemsBackfillFields() {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName('OrderItems');
  if (!sh) return ok({ migrated: 0 }, 'ยังไม่มีชีต OrderItems');

  var productById_ = {};
  findAll('Products', null, true).forEach(function (p) { productById_[p.product_id] = p; });
  var orderById_ = {};
  findAll('Orders', null, true).forEach(function (o) { orderById_[o.order_id] = o; });
  findAll('Orders_Archive', null, true).forEach(function (o) { if (!orderById_[o.order_id]) orderById_[o.order_id] = o; });

  var rows = findAll('OrderItems', null, true);
  var headers = SHEET_SCHEMAS.OrderItems;
  var filledCategory = 0, filledOrderNo = 0, filledCustomer = 0;
  var matrix = rows.map(function (i) {
    var product = productById_[i.product_id];
    var order = orderById_[i.order_id];
    var categoryId = i.category_id || (product ? product.category_id : '') || '';
    var orderNo = i.order_no || (order ? order.order_no : '') || '';
    var customerName = i.customer_name || (order ? order.customer_name : '') || '';
    var userId = i.user_id || (order ? order.user_id : '') || '';
    var phone = i.phone || (order ? normalizePhone_(order.phone) : '') || '';
    if (categoryId && !i.category_id) filledCategory++;
    if (orderNo && !i.order_no) filledOrderNo++;
    if (customerName && !i.customer_name) filledCustomer++;
    return headers.map(function (h) {
      if (h === 'category_id') return categoryId;
      if (h === 'order_no') return orderNo;
      if (h === 'customer_name') return customerName;
      if (h === 'user_id') return userId;
      if (h === 'phone') return phone;
      return i[h] !== undefined ? i[h] : '';
    });
  });

  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  if (matrix.length) sh.getRange(2, 1, matrix.length, headers.length).setValues(matrix);
  invalidateCache('OrderItems');
  return ok({ migrated: matrix.length, filled_category: filledCategory, filled_order_no: filledOrderNo, filled_customer: filledCustomer },
    'จัดคอลัมน์ OrderItems ใหม่ + เติมข้อมูลย้อนหลังแล้ว (category_id: ' + filledCategory + ', order_no: ' + filledOrderNo + ', ลูกค้า: ' + filledCustomer + ' จากทั้งหมด ' + matrix.length + ' แถว)');
}

/**
 * รันซ้ำได้ปลอดภัย: ล้างข้อมูลทั้งหมดแล้ว seed ใหม่ (ใช้ตอน dev/demo เท่านั้น — ห้ามรันบนข้อมูลจริง)
 */
function resetAndReseedDemoData() {
  var ss = getSpreadsheet();
  Object.keys(SHEET_SCHEMAS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    var lastRow = sh.getLastRow();
    if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).clearContent();
    invalidateCache(name);
  });
  return setupDatabase();
}
