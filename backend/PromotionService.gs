/**
 * PromotionService.gs — โปรโมชั่นลดราคาอัตโนมัติผูกกับสินค้าได้หลายรายการ (ไม่ต้องกรอกโค้ดเหมือนคูปอง)
 * รองรับ 3 แบบ: percent (ลด%), fixed (ลดคงที่ต่อชิ้น), bogo (ซื้อ X แถม Y)
 * ตั้ง start_at/end_at ช่วงสั้นๆ ใช้เป็น "แฟลชเซล" ได้ทันที ไม่ต้องมี type แยกต่างหาก
 *
 * โปรโมชั่นหนึ่งรายการผูกกับสินค้าได้หลายชิ้น (product_ids เก็บเป็น JSON array) — สำหรับ percent/fixed
 * แต่ละสินค้าในรายการลดราคาแยกอิสระจากกัน ส่วน bogo จะนับจำนวนรวมของสินค้าทุกชิ้นในรายการปนกัน (ซื้อ
 * A+B+C รวมกันครบตามจำนวนที่กำหนด ก็แถมได้เลย "แบบผสม") ของแถมจะหักจากชิ้นที่ราคาถูกที่สุดในรายการก่อนเสมอ
 *
 * ต่อสินค้าหนึ่งชิ้นมีโปรโมชั่นที่ "active" พร้อมกันได้แค่ 1 รายการเท่านั้น (บันทึกโปรใหม่เป็น active
 * จะปิดโปรเดิมที่มีสินค้าซ้อนทับกันให้อัตโนมัติ กันสับสนว่าจะใช้ส่วนลดไหน)
 */

var PROMOTION_TYPES_ = ['percent', 'fixed', 'bogo'];

function parsePromotionProductIds_(raw) {
  try { var arr = JSON.parse(raw || '[]'); return Array.isArray(arr) ? arr : []; } catch (e) { return []; }
}

function publicPromotion_(p) {
  return {
    promotion_id: p.promotion_id, product_ids: parsePromotionProductIds_(p.product_ids), name: p.name || '', type: p.type,
    value: numFrom(p.value), buy_qty: numFrom(p.buy_qty), free_qty: numFrom(p.free_qty),
    start_at: p.start_at || '', end_at: p.end_at || '', is_active: boolFrom(p.is_active),
    created_at: p.created_at, updated_at: p.updated_at
  };
}

/** โปรโมชั่นที่ "กำลังใช้งานจริงตอนนี้" (is_active + อยู่ในช่วงเวลาถ้ามีกำหนด) คืน map product_id -> โปร (ค่าดิบจากชีต) */
function activePromotionsByProduct_() {
  var now = new Date();
  var rows = findAll('Promotions', function (p) {
    if (!boolFrom(p.is_active)) return false;
    if (p.start_at && toDate(p.start_at) > now) return false;
    if (p.end_at && toDate(p.end_at) < now) return false;
    return true;
  });
  var map = {};
  rows.forEach(function (p) {
    parsePromotionProductIds_(p.product_ids).forEach(function (pid) { if (!map[pid]) map[pid] = p; });
  });
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

/** ส่วนลด percent/fixed ของสินค้าชิ้นนี้ (คำนวณแยกอิสระต่อรายการ ไม่ต้องรวมกับสินค้าอื่นในโปรเดียวกัน) */
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
  return { line_total: originalTotal, discount: 0, promo_label: '' };
}

/**
 * ของแถม (bogo) แบบ "มิกซ์แอนด์แมทช์" — นับจำนวนรวมของทุกสินค้าที่ร่วมโปรเดียวกันในตะกร้าปนกัน
 * แล้วหักของแถมจากชิ้นที่ราคาถูกที่สุดก่อนเสมอ (มาตรฐานโปรร้านสะดวกซื้อทั่วไป)
 * แก้ไข rows (แถวที่ผ่าน priceCartItems_ มาแล้ว มี unit_price/qty/line_total ของแต่ละรายการ) ให้มี
 * line_total/promo_discount/promo_label ที่ถูกต้องโดยตรง ใช้ร่วมกับ CartService.gs
 */
function applyMixMatchBogoDiscounts_(rows) {
  var groups = {};
  rows.forEach(function (row) {
    if (!row.__bogoPromo) return;
    var key = row.__bogoPromo.promotion_id;
    (groups[key] = groups[key] || { promo: row.__bogoPromo, rows: [] }).rows.push(row);
  });
  Object.keys(groups).forEach(function (key) {
    var g = groups[key], promo = g.promo;
    var buyQty = Math.max(1, numFrom(promo.buy_qty, 1)), freeQty = Math.max(1, numFrom(promo.free_qty, 1));
    var groupSize = buyQty + freeQty;
    var totalQty = g.rows.reduce(function (s, r) { return s + r.qty; }, 0);
    var freeUnits = Math.floor(totalQty / groupSize) * freeQty;
    var label = 'ซื้อ ' + buyQty + ' แถม ' + freeQty + (freeUnits > 0 ? ' (ฟรี ' + freeUnits + ' ชิ้น)' : '');
    var remaining = freeUnits;
    g.rows.slice().sort(function (a, b) { return a.unit_price - b.unit_price; }).forEach(function (row) {
      row.promo_label = label;
      if (remaining > 0) {
        var freeFromThis = Math.min(remaining, row.qty);
        var discount = round2(freeFromThis * row.unit_price);
        row.line_total = round2(row.line_total - discount);
        row.promo_discount = discount;
        remaining -= freeFromThis;
      }
    });
  });
  rows.forEach(function (row) { delete row.__bogoPromo; });
}

/** ===================== Admin CRUD ===================== */
function adminPromotionsList(payload, token) {
  requireRole(token, ['manager', 'admin']);
  var products = {}; findAll('Products', null, true).forEach(function (p) { products[p.product_id] = p.name; });
  return ok(findAll('Promotions', null).sort(function (a, b) { return toDate(b.created_at) - toDate(a.created_at); }).map(function (p) {
    var pub = publicPromotion_(p);
    pub.product_names = pub.product_ids.map(function (id) { return products[id] || '(ไม่พบสินค้า)'; });
    return pub;
  }));
}

function validatePromotionPayload_(payload) {
  if (PROMOTION_TYPES_.indexOf(payload.type) === -1) throw new ApiError('E_INVALID_PAYLOAD', 'ประเภทโปรโมชั่นไม่ถูกต้อง', 'type');
  if (!payload.product_ids || !payload.product_ids.length) throw new ApiError('E_INVALID_PAYLOAD', 'กรุณาเลือกสินค้าที่ร่วมโปรโมชั่นอย่างน้อย 1 รายการ', 'product_ids');
  if (payload.type === 'bogo') {
    if (numFrom(payload.buy_qty) < 1 || numFrom(payload.free_qty) < 1) {
      throw new ApiError('E_INVALID_PAYLOAD', 'กรุณาระบุจำนวนซื้อและจำนวนแถมอย่างน้อย 1', 'buy_qty');
    }
  } else if (numFrom(payload.value) <= 0) {
    throw new ApiError('E_INVALID_PAYLOAD', 'กรุณาระบุมูลค่าส่วนลด', 'value');
  }
}

/** สินค้า id ที่ระบุมามีอยู่จริงในระบบไหม — กรองทิ้งตัวที่ไม่พบ (เช่น สินค้าถูกลบไปแล้วหลังตั้งโปรไว้) */
function validProductIds_(ids) {
  var products = findAll('Products', null, true);
  return ids.filter(function (id) { return products.some(function (p) { return p.product_id === id; }); });
}

/** ปิดโปรโมชั่น active อื่นที่มีสินค้าซ้อนทับกับรายการนี้ กันสินค้าชิ้นเดียวมีโปร active มากกว่า 1 รายการพร้อมกัน */
function deactivateOverlappingPromotions_(productIds, keepPromotionId) {
  var idSet = {}; productIds.forEach(function (id) { idSet[id] = true; });
  findAll('Promotions', function (p) {
    if (p.promotion_id === keepPromotionId || !boolFrom(p.is_active)) return false;
    return parsePromotionProductIds_(p.product_ids).some(function (id) { return idSet[id]; });
  }).forEach(function (p) { updateRowAt('Promotions', p.__row, { is_active: false }); });
}

function adminPromotionsCreate(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['product_ids', 'type']);
  validatePromotionPayload_(payload);
  var validIds = validProductIds_(payload.product_ids);
  if (!validIds.length) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบสินค้าที่เลือก', 'product_ids');
  var obj = {
    promotion_id: genId('PROMO'), product_ids: JSON.stringify(validIds), name: String(payload.name || '').slice(0, 200), type: payload.type,
    value: numFrom(payload.value), buy_qty: numFrom(payload.buy_qty), free_qty: numFrom(payload.free_qty),
    start_at: payload.start_at || '', end_at: payload.end_at || '',
    is_active: payload.is_active !== undefined ? boolFrom(payload.is_active) : true
  };
  insertRow('Promotions', obj);
  if (obj.is_active) deactivateOverlappingPromotions_(validIds, obj.promotion_id);
  writeAudit(auth.user.user_id, auth.user.role, 'create', 'Promotion', obj.promotion_id, null, obj);
  return ok(publicPromotion_(obj), 'สร้างโปรโมชั่นแล้ว');
}

function adminPromotionsUpdate(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['promotion_id']);
  var patch = {};
  if (payload.type !== undefined || payload.product_ids !== undefined) {
    validatePromotionPayload_(payload);
    var validIds = validProductIds_(payload.product_ids);
    if (!validIds.length) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบสินค้าที่เลือก', 'product_ids');
    patch.product_ids = JSON.stringify(validIds);
  }
  ['name', 'type', 'start_at', 'end_at'].forEach(function (f) { if (payload[f] !== undefined) patch[f] = payload[f]; });
  ['value', 'buy_qty', 'free_qty'].forEach(function (f) { if (payload[f] !== undefined) patch[f] = numFrom(payload[f]); });
  if (payload.is_active !== undefined) patch.is_active = boolFrom(payload.is_active);
  var updated = updateByKey('Promotions', 'promotion_id', payload.promotion_id, patch);
  if (boolFrom(updated.is_active)) deactivateOverlappingPromotions_(parsePromotionProductIds_(updated.product_ids), updated.promotion_id);
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
