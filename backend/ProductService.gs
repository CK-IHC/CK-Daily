/**
 * ProductService.gs — catalog.* (ลูกค้า) และ admin.products.* / admin.categories.* / admin.productOptions.*
 */

/** ===================== Catalog (ลูกค้า) ===================== */
function catalogGetCategories() {
  var cats = findAll('Categories', function (r) { return boolFrom(r.is_active); })
    .sort(function (a, b) { return numFrom(a.sort_order) - numFrom(b.sort_order); })
    .map(publicCategory_);
  return ok(cats);
}

function publicCategory_(c) {
  return { category_id: c.category_id, name: c.name, sort_order: numFrom(c.sort_order), icon: c.icon, color: c.color || '', is_active: boolFrom(c.is_active) };
}

function publicProduct_(p) {
  return {
    product_id: p.product_id, sku: p.sku, name: p.name, category_id: p.category_id,
    description: p.description, image_url: p.image_url, price: numFrom(p.price), unit: p.unit,
    track_stock: boolFrom(p.track_stock), stock_qty: numFrom(p.stock_qty), max_per_order: numFrom(p.max_per_order),
    has_options: boolFrom(p.has_options), is_active: boolFrom(p.is_active), sort_order: numFrom(p.sort_order),
    in_stock: !boolFrom(p.track_stock) || numFrom(p.stock_qty) > 0, is_frozen: boolFrom(p.is_frozen)
  };
}

function catalogGetProducts(payload) {
  payload = payload || {};
  var products = findAll('Products', function (p) { return boolFrom(p.is_active); });
  if (payload.category) {
    products = products.filter(function (p) { return p.category_id === payload.category; });
  }
  if (payload.search) {
    var q = String(payload.search).toLowerCase();
    products = products.filter(function (p) {
      return String(p.name).toLowerCase().indexOf(q) > -1 || String(p.sku).toLowerCase().indexOf(q) > -1;
    });
  }
  var result = products.map(publicProduct_);
  if (boolFrom(payload.in_stock_only)) {
    result = result.filter(function (p) { return p.in_stock; });
  }
  result.sort(function (a, b) { return a.sort_order - b.sort_order; });
  return ok(result);
}

function catalogGetProductDetail(payload) {
  requireFields(payload, ['product_id']);
  var p = findOne('Products', function (r) { return r.product_id === payload.product_id && boolFrom(r.is_active); });
  if (!p) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบสินค้า', 'product_id');
  var options = findAll('ProductOptions', function (o) { return o.product_id === p.product_id; })
    .map(function (o) {
      return {
        option_id: o.option_id, group_name: o.group_name, option_name: o.option_name,
        price_delta: numFrom(o.price_delta), is_required: boolFrom(o.is_required), max_select: numFrom(o.max_select, 1)
      };
    });
  var groups = {};
  options.forEach(function (o) {
    if (!groups[o.group_name]) groups[o.group_name] = { group_name: o.group_name, is_required: o.is_required, max_select: o.max_select, options: [] };
    groups[o.group_name].options.push({ option_id: o.option_id, option_name: o.option_name, price_delta: o.price_delta });
  });
  var data = publicProduct_(p);
  data.option_groups = Object.keys(groups).map(function (k) { return groups[k]; });
  return ok(data);
}

/** ค่าตั้งค่าที่ปลอดภัยให้ frontend ลูกค้าเรียกได้โดยไม่ต้อง login/role admin (เช่น QR PromptPay, ชื่อร้าน) */
function catalogGetPublicSettings() {
  var all = getAllSettings();
  return ok({
    shop_name: all.shop_name || '', delivery_fee: all.delivery_fee || '0',
    promptpay_id: all.promptpay_id || '', open_hours: all.open_hours || '',
    payment_qr_url: all.payment_qr_url || '', payment_qr_note: all.payment_qr_note || ''
  });
}

/**
 * คืนรูป QR ชำระเงินเป็น data URI (base64) แทนลิงก์ Drive ตรงๆ — ใช้ตอนแปะรูปลง <canvas> (html2canvas
 * สร้างใบสรุปคำสั่งซื้อ) เพราะ drive.google.com/thumbnail ไม่ส่ง CORS header ที่เสถียรพอให้ browser
 * วาดลง canvas ได้ (ทำให้รูป QR หายไปเงียบๆ ในรูปที่ export) ดึงไฟล์ผ่าน DriveApp ฝั่งเซิร์ฟเวอร์แทนเลย
 * ไม่ติดปัญหา CORS เพราะไม่ใช่การเรียกข้าม origin จาก browser
 */
function catalogGetPaymentQrBase64() {
  var url = getSetting('payment_qr_url', '');
  if (!url) return ok({ data_uri: '' });
  var m = /[?&]id=([^&]+)/.exec(url);
  if (!m) return ok({ data_uri: '' });
  try {
    var blob = DriveApp.getFileById(m[1]).getBlob();
    return ok({ data_uri: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) });
  } catch (e) {
    return ok({ data_uri: '' });
  }
}

/** ===================== Admin: Products CRUD ===================== */
function adminProductsList(payload, token) {
  requireRole(token, ['manager', 'admin']);
  var rows = findAll('Products', null).sort(function (a, b) { return numFrom(a.sort_order) - numFrom(b.sort_order); });
  return ok(rows.map(function (p) {
    var o = publicProduct_(p);
    o.cost_price = numFrom(p.cost_price);
    o.reorder_point = numFrom(p.reorder_point);
    return o;
  }));
}

function adminProductsCreate(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['sku', 'name', 'category_id', 'price']);
  var dup = findOne('Products', function (r) { return r.sku === payload.sku; });
  if (dup) throw new ApiError('E_INVALID_PAYLOAD', 'SKU นี้มีอยู่แล้ว', 'sku');

  var obj = {
    product_id: genId('PRD'), sku: payload.sku, name: payload.name, category_id: payload.category_id,
    description: payload.description || '', image_url: payload.image_base64 ? uploadImageToDrive_(payload.image_base64, payload.image_name, payload.sku) : (payload.image_url || ''),
    cost_price: numFrom(payload.cost_price), price: numFrom(payload.price), unit: payload.unit || 'ชิ้น',
    track_stock: boolFrom(payload.track_stock), stock_qty: numFrom(payload.stock_qty),
    reorder_point: numFrom(payload.reorder_point), max_per_order: numFrom(payload.max_per_order, 20),
    has_options: boolFrom(payload.has_options), is_active: payload.is_active === undefined ? true : boolFrom(payload.is_active),
    sort_order: numFrom(payload.sort_order), is_frozen: boolFrom(payload.is_frozen)
  };
  var created = insertRow('Products', obj);
  if (numFrom(obj.stock_qty) > 0) {
    writeStockMovement_(obj.product_id, 'in', numFrom(obj.stock_qty), 0, numFrom(obj.stock_qty), 'manual', obj.product_id, 'สต็อกตั้งต้นตอนสร้างสินค้า', auth.user.user_id);
  }
  writeAudit(auth.user.user_id, auth.user.role, 'create', 'Product', obj.product_id, null, obj);
  return ok(publicProduct_(created), 'สร้างสินค้าแล้ว');
}

function adminProductsUpdate(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['product_id']);
  var p = findOne('Products', function (r) { return r.product_id === payload.product_id; }, true);
  if (!p) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบสินค้า', 'product_id');
  var patch = {};
  ['name', 'category_id', 'description', 'unit'].forEach(function (f) { if (payload[f] !== undefined) patch[f] = payload[f]; });
  ['cost_price', 'price', 'reorder_point', 'max_per_order', 'sort_order'].forEach(function (f) { if (payload[f] !== undefined) patch[f] = numFrom(payload[f]); });
  ['track_stock', 'has_options', 'is_active', 'is_frozen'].forEach(function (f) { if (payload[f] !== undefined) patch[f] = boolFrom(payload[f]); });
  if (payload.image_base64) patch.image_url = uploadImageToDrive_(payload.image_base64, payload.image_name, p.sku);
  var updated = updateRowAt('Products', p.__row, patch);
  writeAudit(auth.user.user_id, auth.user.role, 'update', 'Product', p.product_id, p, updated);
  return ok(publicProduct_(updated), 'บันทึกสินค้าแล้ว');
}

function adminProductsToggleActive(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['product_id']);
  var p = findOne('Products', function (r) { return r.product_id === payload.product_id; }, true);
  if (!p) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบสินค้า', 'product_id');
  var updated = updateRowAt('Products', p.__row, { is_active: !boolFrom(p.is_active) });
  writeAudit(auth.user.user_id, auth.user.role, 'toggle_active', 'Product', p.product_id, p, updated);
  return ok(publicProduct_(updated));
}

/**
 * นำเข้าสินค้าจาก CSV — อัปเดตสินค้าเดิมถ้าเจอ sku ตรงกัน (เฉพาะฟิลด์ที่ระบุมา) หรือสร้างใหม่ถ้าไม่เจอ
 * (สร้างใหม่ต้องมี name, price, category_name ครบ — category_name ต้องตรงกับชื่อหมวดหมู่ที่มีอยู่แล้วเป๊ะๆ)
 */
function adminProductsImportCsv(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['rows']); // rows: [{sku,name,category_name,price,cost_price,unit,is_frozen,track_stock,stock_qty,reorder_point,max_per_order,is_active}]
  var categories = findAll('Categories', null);
  var results = [];
  payload.rows.forEach(function (row) {
    if (!row.sku) { results.push({ sku: '', ok: false, message: 'ไม่มี sku' }); return; }
    var existing = findOne('Products', function (r) { return r.sku === row.sku; }, true);
    if (existing) {
      var patch = {};
      if (row.name) patch.name = row.name;
      if (row.price !== undefined && row.price !== '') patch.price = numFrom(row.price);
      if (row.cost_price !== undefined && row.cost_price !== '') patch.cost_price = numFrom(row.cost_price);
      if (row.unit) patch.unit = row.unit;
      if (row.reorder_point !== undefined && row.reorder_point !== '') patch.reorder_point = numFrom(row.reorder_point);
      if (row.max_per_order !== undefined && row.max_per_order !== '') patch.max_per_order = numFrom(row.max_per_order);
      if (row.is_frozen !== undefined && row.is_frozen !== '') patch.is_frozen = boolFrom(row.is_frozen);
      if (row.track_stock !== undefined && row.track_stock !== '') patch.track_stock = boolFrom(row.track_stock);
      if (row.is_active !== undefined && row.is_active !== '') patch.is_active = boolFrom(row.is_active);
      if (row.category_name) {
        var cat = categories.filter(function (c) { return c.name === row.category_name; })[0];
        if (cat) patch.category_id = cat.category_id;
      }
      updateRowAt('Products', existing.__row, patch);
      results.push({ sku: row.sku, ok: true, action: 'updated' });
      return;
    }
    if (!row.name || row.price === undefined || row.price === '' || !row.category_name) {
      results.push({ sku: row.sku, ok: false, message: 'สร้างสินค้าใหม่ต้องมี name, price, category_name ครบ' }); return;
    }
    var newCat = categories.filter(function (c) { return c.name === row.category_name; })[0];
    if (!newCat) { results.push({ sku: row.sku, ok: false, message: 'ไม่พบหมวดหมู่ "' + row.category_name + '"' }); return; }
    var obj = {
      product_id: genId('PRD'), sku: row.sku, name: row.name, category_id: newCat.category_id,
      description: '', image_url: '', cost_price: numFrom(row.cost_price), price: numFrom(row.price), unit: row.unit || 'ชิ้น',
      track_stock: row.track_stock !== undefined && row.track_stock !== '' ? boolFrom(row.track_stock) : true,
      stock_qty: numFrom(row.stock_qty), reorder_point: numFrom(row.reorder_point), max_per_order: numFrom(row.max_per_order, 20),
      has_options: false, is_active: row.is_active !== undefined && row.is_active !== '' ? boolFrom(row.is_active) : true,
      sort_order: 0, is_frozen: boolFrom(row.is_frozen)
    };
    insertRow('Products', obj);
    if (numFrom(obj.stock_qty) > 0) {
      writeStockMovement_(obj.product_id, 'in', numFrom(obj.stock_qty), 0, numFrom(obj.stock_qty), 'manual', obj.product_id, 'นำเข้าจาก CSV', auth.user.user_id);
    }
    results.push({ sku: row.sku, ok: true, action: 'created' });
  });
  writeAudit(auth.user.user_id, auth.user.role, 'import_csv', 'Product', '', null, { count: results.length });
  return ok(results, 'นำเข้าสินค้าแล้ว');
}

function adminProductsDelete(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['product_id']);
  softDelete('Products', 'product_id', payload.product_id);
  writeAudit(auth.user.user_id, auth.user.role, 'delete', 'Product', payload.product_id, null, null);
  return ok(null, 'ลบสินค้าแล้ว');
}

/**
 * raw=true: คืนลิงก์ไฟล์ตรง (uc?export=view) แทน thumbnail — จำเป็นสำหรับ GIF ที่ต้องการให้เล่นภาพเคลื่อนไหว
 * และ SVG (thumbnail endpoint ของ Drive แปลงเป็นภาพนิ่ง/แรสเตอร์เสมอ ทำให้ GIF หยุดขยับและ SVG เสียความคมชัด)
 * ใช้เฉพาะจุดที่จำเป็นจริงๆ เพราะไฟล์ใหญ่มากอาจเจอหน้าเตือนไวรัสของ Drive ได้ (ปกติไม่เจอกับรูปขนาดปกติ)
 */
function uploadImageToDrive_(base64, fileName, prefix, folderId, folderName, raw) {
  var m = /^data:(.+);base64,(.+)$/.exec(base64);
  var contentType = m ? m[1] : 'image/jpeg';
  var data = m ? m[2] : base64;
  var blob = Utilities.newBlob(Utilities.base64Decode(data), contentType, (fileName || (prefix + '-' + Date.now())));
  // ใช้โฟลเดอร์ที่สร้าง/หาอัตโนมัติเสมอ (getOrCreateDriveFolder_) แทน folder ID คงที่ — folder ID ที่ผูกไว้ตายตัว
  // จากบัญชี Google อื่นอาจใช้ไม่ได้เมื่อสคริปต์ถูก deploy ใหม่ภายใต้บัญชีที่ไม่มีสิทธิ์เข้าถึงโฟลเดอร์นั้น
  // ทำให้ DriveApp.getFolderById() throw และอัปโหลดล้มเหลวเงียบๆ (ไม่มีแถวถูกบันทึกเลย)
  var folder = folderId ? DriveApp.getFolderById(folderId) : getOrCreateDriveFolder_(folderName || 'CK Daily - Product Images');
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  if (raw) return 'https://drive.google.com/uc?export=view&id=' + file.getId();
  // ใช้ URL แบบ thumbnail แทน uc?id= — ฝังเป็น <img> ได้เสถียรกว่ามาก (uc?id= มักโดนหน้าเตือนไวรัส/redirect บล็อกไม่โหลดรูป)
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1600';
}

function getOrCreateDriveFolder_(name) {
  var it = DriveApp.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(name);
}

/** ===================== Admin: Categories CRUD ===================== */
function adminCategoriesList(payload, token) {
  requireRole(token, ['manager', 'admin']);
  return ok(findAll('Categories', null).sort(function (a, b) { return numFrom(a.sort_order) - numFrom(b.sort_order); }).map(publicCategory_));
}

function adminCategoriesCreate(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['name']);
  var obj = { category_id: genId('CAT'), name: payload.name, sort_order: numFrom(payload.sort_order), icon: payload.icon || '', color: payload.color || '#f97316', is_active: true };
  insertRow('Categories', obj);
  writeAudit(auth.user.user_id, auth.user.role, 'create', 'Category', obj.category_id, null, obj);
  return ok(obj, 'สร้างหมวดหมู่แล้ว');
}

function adminCategoriesUpdate(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['category_id']);
  var patch = {};
  ['name', 'icon', 'color'].forEach(function (f) { if (payload[f] !== undefined) patch[f] = payload[f]; });
  if (payload.sort_order !== undefined) patch.sort_order = numFrom(payload.sort_order);
  if (payload.is_active !== undefined) patch.is_active = boolFrom(payload.is_active);
  var updated = updateByKey('Categories', 'category_id', payload.category_id, patch);
  writeAudit(auth.user.user_id, auth.user.role, 'update', 'Category', payload.category_id, null, updated);
  return ok(publicCategory_(updated), 'บันทึกหมวดหมู่แล้ว');
}

function adminCategoriesDelete(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['category_id']);
  softDelete('Categories', 'category_id', payload.category_id);
  writeAudit(auth.user.user_id, auth.user.role, 'delete', 'Category', payload.category_id, null, null);
  return ok(null, 'ลบหมวดหมู่แล้ว');
}

/** ===================== Admin: Product Options CRUD ===================== */
function adminProductOptionsList(payload, token) {
  requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['product_id']);
  return ok(findAll('ProductOptions', function (r) { return r.product_id === payload.product_id; }));
}

function adminProductOptionsUpsert(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['product_id', 'group_name', 'option_name']);
  if (payload.option_id) {
    var updated = updateByKey('ProductOptions', 'option_id', payload.option_id, {
      group_name: payload.group_name, option_name: payload.option_name,
      price_delta: numFrom(payload.price_delta), is_required: boolFrom(payload.is_required),
      max_select: numFrom(payload.max_select, 1), stock_link_product_id: payload.stock_link_product_id || ''
    });
    writeAudit(auth.user.user_id, auth.user.role, 'update', 'ProductOption', payload.option_id, null, updated);
    return ok(updated, 'บันทึกตัวเลือกแล้ว');
  }
  var obj = {
    option_id: genId('OPT'), product_id: payload.product_id, group_name: payload.group_name, option_name: payload.option_name,
    price_delta: numFrom(payload.price_delta), is_required: boolFrom(payload.is_required),
    max_select: numFrom(payload.max_select, 1), stock_link_product_id: payload.stock_link_product_id || ''
  };
  insertRow('ProductOptions', obj);
  writeAudit(auth.user.user_id, auth.user.role, 'create', 'ProductOption', obj.option_id, null, obj);
  return ok(obj, 'เพิ่มตัวเลือกแล้ว');
}

function adminProductOptionsDelete(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['option_id']);
  softDelete('ProductOptions', 'option_id', payload.option_id);
  writeAudit(auth.user.user_id, auth.user.role, 'delete', 'ProductOption', payload.option_id, null, null);
  return ok(null, 'ลบตัวเลือกแล้ว');
}
