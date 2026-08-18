/**
 * Repository.gs — CRUD กลางสำหรับทุก Sheet + Cache
 * อ่านทั้งชีตครั้งเดียวด้วย getDataRange().getValues() แล้ว filter ใน memory เสมอ (ห้ามวนอ่านทีละแถว)
 */

var SHEET_SCHEMAS = {
  Users: ['user_id', 'phone', 'name', 'role', 'points', 'tier', 'default_address', 'status', 'last_login_at', 'created_at', 'updated_at', 'is_deleted', 'department', 'avatar_url'],
  OTP: ['otp_id', 'phone', 'otp_code', 'ref_code', 'expires_at', 'attempts', 'is_used', 'created_at'],
  Sessions: ['token', 'user_id', 'role', 'device_info', 'issued_at', 'expires_at', 'revoked'],
  Categories: ['category_id', 'name', 'sort_order', 'icon', 'color', 'is_active', 'created_at', 'updated_at', 'is_deleted'],
  Products: ['product_id', 'sku', 'name', 'category_id', 'description', 'image_url', 'cost_price', 'price', 'unit', 'track_stock', 'stock_qty', 'reorder_point', 'max_per_order', 'has_options', 'is_active', 'sort_order', 'created_at', 'updated_at', 'is_deleted', 'is_frozen'],
  ProductOptions: ['option_id', 'product_id', 'group_name', 'option_name', 'price_delta', 'is_required', 'max_select', 'stock_link_product_id', 'created_at', 'updated_at', 'is_deleted'],
  Rounds: ['round_id', 'round_name', 'open_at', 'close_at', 'delivery_at', 'status', 'capacity', 'current_orders', 'note', 'created_at', 'updated_at', 'is_deleted', 'delivery_location'],
  Orders: ['order_id', 'order_no', 'user_id', 'phone', 'customer_name', 'round_id', 'order_type', 'address', 'delivery_note', 'subtotal', 'discount', 'coupon_code', 'delivery_fee', 'vat', 'grand_total', 'payment_method', 'payment_status', 'slip_url', 'slip_urls', 'status', 'cancel_reason', 'placed_at', 'confirmed_at', 'ready_at', 'completed_at', 'staff_id', 'created_at', 'updated_at', 'is_deleted', 'photo_url', 'admin_note'],
  OrderItems: ['item_id', 'order_id', 'product_id', 'category_id', 'sku', 'product_name', 'options_json', 'unit_price', 'qty', 'line_total', 'note', 'created_at', 'updated_at', 'is_deleted'],
  StockMovements: ['movement_id', 'product_id', 'sku', 'type', 'qty_change', 'qty_before', 'qty_after', 'ref_type', 'ref_id', 'reason', 'by_user_id', 'created_at'],
  Coupons: ['coupon_id', 'code', 'type', 'value', 'min_spend', 'max_discount', 'usage_limit', 'used_count', 'per_user_limit', 'start_at', 'end_at', 'is_active', 'created_at', 'updated_at', 'is_deleted'],
  Payments: ['payment_id', 'order_id', 'customer_name', 'phone', 'amount', 'method', 'slip_url', 'verified_by', 'verified_at', 'status', 'created_at', 'updated_at'],
  Notifications: ['noti_id', 'user_id', 'title', 'body', 'type', 'is_read', 'ref_id', 'created_at', 'is_deleted'],
  AuditLog: ['log_id', 'user_id', 'role', 'action', 'entity', 'entity_id', 'before_json', 'after_json', 'ip', 'created_at'],
  Settings: ['key', 'value', 'description'],
  Announcements: ['announcement_id', 'text', 'link_url', 'image_url', 'size', 'sort_order', 'is_active', 'start_at', 'end_at', 'created_at', 'updated_at', 'is_deleted'],
  Orders_Archive: ['order_id', 'order_no', 'user_id', 'phone', 'customer_name', 'round_id', 'order_type', 'address', 'delivery_note', 'subtotal', 'discount', 'coupon_code', 'delivery_fee', 'vat', 'grand_total', 'payment_method', 'payment_status', 'slip_url', 'slip_urls', 'status', 'cancel_reason', 'placed_at', 'confirmed_at', 'ready_at', 'completed_at', 'staff_id', 'created_at', 'updated_at', 'is_deleted', 'photo_url', 'admin_note']
};

// TTL (วินาที) — Users/Rounds cache สั้นๆ เพื่อความไวโดยยังทันความเปลี่ยนแปลง (ทุกจุดเขียนข้อมูล invalidate cache ทันทีอยู่แล้ว)
var CACHEABLE_SHEETS = { Categories: 300, Products: 300, ProductOptions: 300, Settings: 300, Users: 30, Rounds: 15 };

function getSheet(name) {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) throw new ApiError('E_SERVER', 'ไม่พบ Sheet: ' + name);
  return sh;
}

function headersOf_(name) {
  var h = SHEET_SCHEMAS[name];
  if (!h) throw new ApiError('E_SERVER', 'ไม่รู้จัก schema: ' + name);
  return h;
}

/**
 * อ่าน header แถวแรกจริงของ Sheet (ไม่ใช่ค่าคงที่ SHEET_SCHEMAS) — ทำให้เพิ่มคอลัมน์ใหม่ภายหลัง
 * (ต่อท้ายแถว header จริงด้วย repairSchema) ไม่ทำให้ตำแหน่งคอลัมน์เดิมเพี้ยน
 */
function actualHeaders_(name, sh) {
  var lastCol = sh.getLastColumn();
  if (lastCol === 0) return headersOf_(name); // ชีตใหม่เอี่ยมยังไม่มี header แถวแรก
  return sh.getRange(1, 1, 1, lastCol).getValues()[0].filter(function (h) { return h !== ''; });
}

/** อ่านทั้งชีตเป็น array of object ครั้งเดียว รองรับ cache สำหรับชีตอ่านบ่อย */
function readAll(name) {
  var ttl = CACHEABLE_SHEETS[name];
  var cache = ttl ? CacheService.getScriptCache() : null;
  var cacheKey = 'tbl_' + name;
  if (cache) {
    var cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
  }
  var sh = getSheet(name);
  var lastRow = sh.getLastRow();
  var headers = actualHeaders_(name, sh);
  if (lastRow < 2) return [];
  var values = sh.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = values[i][c];
    obj.__row = i + 2; // เก็บเลขแถวจริงไว้ update/delete เร็ว
    rows.push(obj);
  }
  if (cache) {
    try { cache.put(cacheKey, JSON.stringify(rows), ttl); } catch (e) { /* payload ใหญ่เกิน cache limit ก็ข้ามได้ */ }
  }
  return rows;
}

function invalidateCache(name) {
  if (CACHEABLE_SHEETS[name]) {
    CacheService.getScriptCache().remove('tbl_' + name);
  }
}

function findAll(name, predicate, includeDeleted) {
  var rows = readAll(name);
  return rows.filter(function (r) {
    if (!includeDeleted && r.hasOwnProperty('is_deleted') && boolFrom(r.is_deleted)) return false;
    return predicate ? predicate(r) : true;
  });
}

function findOne(name, predicate, includeDeleted) {
  var res = findAll(name, predicate, includeDeleted);
  return res.length ? res[0] : null;
}

function findById(name, idField, idValue) {
  var obj = {};
  obj[idField] = idValue;
  return findOne(name, function (r) { return r[idField] === idValue; });
}

/**
 * ถ้า object ที่จะเขียนมี field ที่รู้จักใน SHEET_SCHEMAS แต่ยังไม่มีเป็นคอลัมน์จริงในชีต (เช่น เพิ่ง
 * เพิ่ม field ใหม่ในโค้ดแต่ยังไม่ได้รัน repairSchema) ให้เติมคอลัมน์นั้นให้อัตโนมัติทันที กัน field
 * หายเงียบๆ ตอนบันทึก — ทำให้ไม่ต้องพึ่งการรัน repairSchema ด้วยมืออีกต่อไป
 */
function ensureColumns_(name, sh, headers, keys) {
  var known = SHEET_SCHEMAS[name] || [];
  var missing = keys.filter(function (k) { return headers.indexOf(k) === -1 && known.indexOf(k) > -1; });
  if (!missing.length) return headers;
  var startCol = headers.length + 1;
  sh.getRange(1, startCol, 1, missing.length).setValues([missing]);
  sh.getRange(1, startCol, 1, missing.length).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  return headers.concat(missing);
}

/** เขียนแถวเดียวแบบ batch (setValues บนช่วงเดียว ไม่ใช้ getRange ทีละเซลล์) */
function insertRow(name, obj) {
  var sh = getSheet(name);
  var headers = actualHeaders_(name, sh);
  headers = ensureColumns_(name, sh, headers, Object.keys(obj));
  var ts = nowIso_();
  if (headers.indexOf('created_at') > -1 && !obj.created_at) obj.created_at = ts;
  if (headers.indexOf('updated_at') > -1 && !obj.updated_at) obj.updated_at = ts;
  if (headers.indexOf('is_deleted') > -1 && obj.is_deleted === undefined) obj.is_deleted = false;
  var clean = sanitizeObject(obj);
  var row = headers.map(function (h) { return clean[h] === undefined ? '' : clean[h]; });
  sh.getRange(sh.getLastRow() + 1, 1, 1, headers.length).setValues([row]);
  invalidateCache(name);
  return obj;
}

function insertRows(name, objs) {
  if (!objs.length) return [];
  var sh = getSheet(name);
  var headers = actualHeaders_(name, sh);
  var allKeys = [];
  objs.forEach(function (o) { Object.keys(o).forEach(function (k) { if (allKeys.indexOf(k) === -1) allKeys.push(k); }); });
  headers = ensureColumns_(name, sh, headers, allKeys);
  var ts = nowIso_();
  var matrix = objs.map(function (obj) {
    if (headers.indexOf('created_at') > -1 && !obj.created_at) obj.created_at = ts;
    if (headers.indexOf('updated_at') > -1 && !obj.updated_at) obj.updated_at = ts;
    if (headers.indexOf('is_deleted') > -1 && obj.is_deleted === undefined) obj.is_deleted = false;
    var clean = sanitizeObject(obj);
    return headers.map(function (h) { return clean[h] === undefined ? '' : clean[h]; });
  });
  sh.getRange(sh.getLastRow() + 1, 1, matrix.length, headers.length).setValues(matrix);
  invalidateCache(name);
  return objs;
}

/** อัปเดตแถวด้วยเลขแถวจริง (จาก __row ที่ readAll แนบมาให้) เร็วกว่าค้นหาใหม่ */
function updateRowAt(name, rowIndex, patch) {
  var sh = getSheet(name);
  var headers = actualHeaders_(name, sh);
  headers = ensureColumns_(name, sh, headers, Object.keys(patch));
  if (headers.indexOf('updated_at') > -1) patch.updated_at = nowIso_();
  var current = sh.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  var clean = sanitizeObject(patch);
  headers.forEach(function (h, i) {
    if (clean.hasOwnProperty(h)) current[i] = clean[h];
  });
  sh.getRange(rowIndex, 1, 1, headers.length).setValues([current]);
  invalidateCache(name);
  var obj = {};
  headers.forEach(function (h, i) { obj[h] = current[i]; });
  return obj;
}

/** ค้นหาด้วย key field แล้วอัปเดต (สะดวกกว่าเมื่อไม่มี __row ในมือ) */
function updateByKey(name, keyField, keyValue, patch) {
  var row = findOne(name, function (r) { return r[keyField] === keyValue; }, true);
  if (!row) throw new ApiError('E_SERVER', 'ไม่พบข้อมูล ' + name + ' ที่ ' + keyField + '=' + keyValue);
  return updateRowAt(name, row.__row, patch);
}

function softDelete(name, keyField, keyValue) {
  return updateByKey(name, keyField, keyValue, { is_deleted: true });
}

function countRows(name, predicate) {
  return findAll(name, predicate).length;
}

/** ===================== Audit Log ===================== */
function writeAudit(userId, role, action, entity, entityId, before, after) {
  try {
    insertRow('AuditLog', {
      log_id: genId('LOG'),
      user_id: userId || '',
      role: role || '',
      action: action,
      entity: entity,
      entity_id: entityId || '',
      before_json: before ? JSON.stringify(before) : '',
      after_json: after ? JSON.stringify(after) : '',
      ip: ''
    });
  } catch (e) {
    // audit log ต้องไม่ทำให้ request หลักล้มเหลว
  }
}

/** ===================== Settings ===================== */
function getSetting(key, def) {
  var row = findOne('Settings', function (r) { return r.key === key; });
  return row ? row.value : def;
}

function getAllSettings() {
  var rows = readAll('Settings');
  var out = {};
  rows.forEach(function (r) { out[r.key] = r.value; });
  return out;
}

function setSetting(key, value, description) {
  var row = findOne('Settings', function (r) { return r.key === key; }, true);
  if (row) {
    return updateRowAt('Settings', row.__row, { value: value, description: description !== undefined ? description : row.description });
  }
  return insertRow('Settings', { key: key, value: value, description: description || '' });
}
