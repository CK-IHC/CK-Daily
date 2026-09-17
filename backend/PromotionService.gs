/**
 * PromotionService.gs — โปรโมชั่นลดราคาอัตโนมัติผูกกับสินค้ารายชิ้น (ไม่ต้องกรอกโค้ดเหมือนคูปอง)
 * รองรับ 3 แบบ: percent (ลด%), fixed (ลดคงที่ต่อชิ้น), bogo (ซื้อ X แถม Y)
 * ตั้ง start_at/end_at ช่วงสั้นๆ ใช้เป็น "แฟลชเซล" ได้ทันที ไม่ต้องมี type แยกต่างหาก
 * ต่อสินค้าหนึ่งชิ้นมีโปรโมชั่นที่ "active" พร้อมกันได้แค่ 1 รายการเท่านั้น (บันทึกโปรใหม่เป็น active
 * จะปิดโปรเดิมของสินค้าเดียวกันให้อัตโนมัติ กันสับสนว่าจะใช้ส่วนลดไหน)
 */

var PROMOTION_TYPES_ = ['percent', 'fixed', 'bogo'];

function publicPromotion_(p) {
  return {
    promotion_id: p.promotion_id, product_id: p.product_id, name: p.name || '', type: p.type,
    value: numFrom(p.value), buy_qty: numFrom(p.buy_qty), free_qty: numFrom(p.free_qty),
    start_at: p.start_at || '', end_at: p.end_at || '', is_active: boolFrom(p.is_active),
    created_at: p.created_at, updated_at: p.updated_at
  };
}

/** โปรโมชั่นที่ "กำลังใช้งานจริงตอนนี้" (is_active + อยู่ในช่วงเวลาถ้ามีกำหนด) คืน map product_id -> โปร */
function activePromotionsByProduct_() {
  var now = new Date();
  var rows = findAll('Promotions', function (p) {
    if (!boolFrom(p.is_active)) return false;
    if (p.start_at && toDate(p.start_at) > now) return false;
    if (p.end_at && toDate(p.end_at) < now) return false;
    return true;
  });
  var map = {};
  rows.forEach(function (p) { map[p.product_id] = p; });
  return map;
}

/**
 * ป้ายโปรโมชั่นแบบย่อสำหรับแสดงหน้าร้าน (ก่อนหยิบใส่ตะกร้า) — คำนวณราคาหลังลดตรงๆ ได้เฉพาะ percent/fixed
 * (bogo ต้องมีจำนวนในตะกร้าก่อนถึงจะรู้ว่าฟรีกี่ชิ้น เลยมีแค่ป้ายข้อความ ไม่มี display_price)
 */
function publicPromotionBadge_(promo, price) {
  var badge = { type: promo.type, label: '', display_price: null, end_at: promo.end_at || '' };
  if (promo.type === 'percent') {
    var pct = Math.max(0, Math.min(100, numFrom(promo.value)));
    badge.label = 'ลด ' + pct + '%';
    badge.display_price = round2(price * (1 - pct / 100));
  } else if (promo.type === 'fixed') {
    var off = Math.max(0, Math.min(price, numFrom(promo.value)));
    badge.label = 'ลด ' + off + ' บาท';
    badge.display_price = round2(price - off);
  } else if (promo.type === 'bogo') {
    badge.label = 'ซื้อ ' + numFrom(promo.buy_qty, 1) + ' แถม ' + numFrom(promo.free_qty, 1);
  }
  return badge;
}

/**
 * คำนวณส่วนลดจากโปรโมชั่นของสินค้าชิ้นนี้ (ถ้ามี) จาก unit_price/qty ที่คำนวณไว้แล้ว
 * คืน { line_total, discount, promo_label } — line_total ใหม่ (หลังหักส่วนลด)
 */
function applyProductPromotion_(promo, unitPrice, qty) {
  var originalTotal = round2(unitPrice * qty);
  if (!promo) return { line_total: originalTotal, discount: 0, promo_label: '' };

  if (promo.type === 'percent') {
    var pct = Math.max(0, Math.min(100, numFrom(promo.value)));
    var discount = round2(originalTotal * pct / 100);
    return { line_total: round2(originalTotal - discount), discount: discount, promo_label: 'ลด ' + pct + '%' };
  }
  if (promo.type === 'fixed') {
    var offPerUnit = Math.max(0, Math.min(unitPrice, numFrom(promo.value)));
    var discount2 = round2(offPerUnit * qty);
    return { line_total: round2(originalTotal - discount2), discount: discount2, promo_label: 'ลด ' + offPerUnit + ' บาท/ชิ้น' };
  }
  if (promo.type === 'bogo') {
    var buyQty = Math.max(1, numFrom(promo.buy_qty, 1)), freeQty = Math.max(1, numFrom(promo.free_qty, 1));
    var groupSize = buyQty + freeQty;
    var freeUnits = Math.floor(qty / groupSize) * freeQty;
    var discount3 = round2(freeUnits * unitPrice);
    var label = 'ซื้อ ' + buyQty + ' แถม ' + freeQty + (freeUnits > 0 ? ' (ฟรี ' + freeUnits + ' ชิ้น)' : '');
    return { line_total: round2(originalTotal - discount3), discount: discount3, promo_label: label };
  }
  return { line_total: originalTotal, discount: 0, promo_label: '' };
}

/** ===================== Admin CRUD ===================== */
function adminPromotionsList(payload, token) {
  requireRole(token, ['manager', 'admin']);
  var products = {}; findAll('Products', null, true).forEach(function (p) { products[p.product_id] = p.name; });
  return ok(findAll('Promotions', null).sort(function (a, b) { return toDate(b.created_at) - toDate(a.created_at); }).map(function (p) {
    var pub = publicPromotion_(p);
    pub.product_name = products[p.product_id] || '(ไม่พบสินค้า)';
    return pub;
  }));
}

function validatePromotionPayload_(payload) {
  if (PROMOTION_TYPES_.indexOf(payload.type) === -1) throw new ApiError('E_INVALID_PAYLOAD', 'ประเภทโปรโมชั่นไม่ถูกต้อง', 'type');
  if (payload.type === 'bogo') {
    if (numFrom(payload.buy_qty) < 1 || numFrom(payload.free_qty) < 1) {
      throw new ApiError('E_INVALID_PAYLOAD', 'กรุณาระบุจำนวนซื้อและจำนวนแถมอย่างน้อย 1', 'buy_qty');
    }
  } else if (numFrom(payload.value) <= 0) {
    throw new ApiError('E_INVALID_PAYLOAD', 'กรุณาระบุมูลค่าส่วนลด', 'value');
  }
}

/** ปิดโปรโมชั่น active อื่นของสินค้าเดียวกัน กันมีโปรซ้อนกันมากกว่า 1 รายการพร้อมกัน */
function deactivateOtherPromotionsForProduct_(productId, keepPromotionId) {
  findAll('Promotions', function (p) { return p.product_id === productId && p.promotion_id !== keepPromotionId && boolFrom(p.is_active); })
    .forEach(function (p) { updateRowAt('Promotions', p.__row, { is_active: false }); });
}

function adminPromotionsCreate(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['product_id', 'type']);
  validatePromotionPayload_(payload);
  var product = findOne('Products', function (r) { return r.product_id === payload.product_id; }, true);
  if (!product) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบสินค้า', 'product_id');
  var obj = {
    promotion_id: genId('PROMO'), product_id: payload.product_id, name: String(payload.name || '').slice(0, 200), type: payload.type,
    value: numFrom(payload.value), buy_qty: numFrom(payload.buy_qty), free_qty: numFrom(payload.free_qty),
    start_at: payload.start_at || '', end_at: payload.end_at || '',
    is_active: payload.is_active !== undefined ? boolFrom(payload.is_active) : true
  };
  insertRow('Promotions', obj);
  if (obj.is_active) deactivateOtherPromotionsForProduct_(obj.product_id, obj.promotion_id);
  writeAudit(auth.user.user_id, auth.user.role, 'create', 'Promotion', obj.promotion_id, null, obj);
  return ok(publicPromotion_(obj), 'สร้างโปรโมชั่นแล้ว');
}

function adminPromotionsUpdate(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['promotion_id']);
  if (payload.type !== undefined) validatePromotionPayload_(payload);
  var patch = {};
  ['product_id', 'name', 'type', 'start_at', 'end_at'].forEach(function (f) { if (payload[f] !== undefined) patch[f] = payload[f]; });
  ['value', 'buy_qty', 'free_qty'].forEach(function (f) { if (payload[f] !== undefined) patch[f] = numFrom(payload[f]); });
  if (payload.is_active !== undefined) patch.is_active = boolFrom(payload.is_active);
  var updated = updateByKey('Promotions', 'promotion_id', payload.promotion_id, patch);
  if (boolFrom(updated.is_active)) deactivateOtherPromotionsForProduct_(updated.product_id, updated.promotion_id);
  writeAudit(auth.user.user_id, auth.user.role, 'update', 'Promotion', payload.promotion_id, null, updated);
  return ok(publicPromotion_(updated), 'บันทึกโปรโมชั่นแล้ว');
}

function adminPromotionsDelete(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['promotion_id']);
  softDelete('Promotions', 'promotion_id', payload.promotion_id);
  writeAudit(auth.user.user_id, auth.user.role, 'delete', 'Promotion', payload.promotion_id, null, null);
  return ok(null, 'ลบโปรโมชั่นแล้ว');
}
