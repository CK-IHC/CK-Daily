/**
 * CouponService.gs — admin.coupons.* CRUD + coupon.check (คำนวณส่วนลดจริงฝั่ง backend)
 */

function publicCoupon_(c) {
  return {
    coupon_id: c.coupon_id, code: c.code, type: c.type, value: numFrom(c.value),
    min_spend: numFrom(c.min_spend), max_discount: c.max_discount === '' ? null : numFrom(c.max_discount),
    usage_limit: numFrom(c.usage_limit), used_count: numFrom(c.used_count), per_user_limit: numFrom(c.per_user_limit),
    start_at: c.start_at, end_at: c.end_at, is_active: boolFrom(c.is_active)
  };
}

/** ตรวจคูปองและคำนวณส่วนลดจริง คืน {valid, discount, coupon} — ใช้ทั้งจาก coupon.check และ order.create */
function evaluateCoupon_(code, subtotal, userId) {
  if (!code) return { valid: true, discount: 0, coupon: null };
  var c = findOne('Coupons', function (r) { return r.code === code && boolFrom(r.is_active); });
  if (!c) throw new ApiError('E_COUPON_INVALID', 'ไม่พบคูปองนี้หรือถูกปิดใช้งาน', 'coupon_code');

  var now = new Date();
  if (c.start_at && toDate(c.start_at) > now) throw new ApiError('E_COUPON_INVALID', 'คูปองยังไม่เริ่มใช้งาน', 'coupon_code');
  if (c.end_at && toDate(c.end_at) < now) throw new ApiError('E_COUPON_INVALID', 'คูปองหมดอายุแล้ว', 'coupon_code');
  if (numFrom(c.usage_limit) > 0 && numFrom(c.used_count) >= numFrom(c.usage_limit)) {
    throw new ApiError('E_COUPON_INVALID', 'คูปองถูกใช้ครบจำนวนแล้ว', 'coupon_code');
  }
  if (numFrom(c.min_spend) > 0 && subtotal < numFrom(c.min_spend)) {
    throw new ApiError('E_COUPON_INVALID', 'ยอดสั่งซื้อไม่ถึงขั้นต่ำ ฿' + numFrom(c.min_spend), 'coupon_code');
  }
  if (numFrom(c.per_user_limit) > 0 && userId) {
    var usedByUser = countRows('Orders', function (o) {
      return o.coupon_code === code && o.user_id === userId && o.status !== 'cancelled';
    });
    if (usedByUser >= numFrom(c.per_user_limit)) {
      throw new ApiError('E_COUPON_INVALID', 'คุณใช้คูปองนี้ครบจำนวนสิทธิ์แล้ว', 'coupon_code');
    }
  }

  var discount = 0;
  if (c.type === 'percent') {
    discount = subtotal * (numFrom(c.value) / 100);
    if (c.max_discount !== '' && numFrom(c.max_discount) > 0) discount = Math.min(discount, numFrom(c.max_discount));
  } else if (c.type === 'fixed') {
    discount = numFrom(c.value);
  } else if (c.type === 'free_delivery') {
    discount = 0; // ค่าส่งจะถูกยกเว้นแยกใน CartService
  }
  discount = round2(Math.min(discount, subtotal));
  return { valid: true, discount: discount, coupon: c, freeDelivery: c.type === 'free_delivery' };
}

function couponCheck(payload, token) {
  var auth = null;
  try { auth = requireAuth(token); } catch (e) { /* guest ตรวจคูปองได้แต่ต้อง login ก่อนสั่งจริง */ }
  requireFields(payload, ['code', 'subtotal']);
  var result = evaluateCoupon_(payload.code, numFrom(payload.subtotal), auth ? auth.user.user_id : null);
  return ok({ discount: result.discount, free_delivery: !!result.freeDelivery });
}

/** ===================== Admin CRUD ===================== */
function adminCouponsList(payload, token) {
  requireRole(token, ['manager', 'admin']);
  return ok(findAll('Coupons', null).map(publicCoupon_));
}

function adminCouponsCreate(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['code', 'type', 'value']);
  var dup = findOne('Coupons', function (r) { return r.code === payload.code; });
  if (dup) throw new ApiError('E_INVALID_PAYLOAD', 'รหัสคูปองนี้มีอยู่แล้ว', 'code');
  var obj = {
    coupon_id: genId('CPN'), code: payload.code, type: payload.type, value: numFrom(payload.value),
    min_spend: numFrom(payload.min_spend), max_discount: payload.max_discount !== undefined ? numFrom(payload.max_discount) : '',
    usage_limit: numFrom(payload.usage_limit), used_count: 0, per_user_limit: numFrom(payload.per_user_limit),
    start_at: payload.start_at || '', end_at: payload.end_at || '', is_active: true
  };
  insertRow('Coupons', obj);
  writeAudit(auth.user.user_id, auth.user.role, 'create', 'Coupon', obj.coupon_id, null, obj);
  return ok(publicCoupon_(obj), 'สร้างคูปองแล้ว');
}

function adminCouponsUpdate(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['coupon_id']);
  var patch = {};
  ['type', 'code', 'start_at', 'end_at'].forEach(function (f) { if (payload[f] !== undefined) patch[f] = payload[f]; });
  ['value', 'min_spend', 'max_discount', 'usage_limit', 'per_user_limit'].forEach(function (f) { if (payload[f] !== undefined) patch[f] = numFrom(payload[f]); });
  if (payload.is_active !== undefined) patch.is_active = boolFrom(payload.is_active);
  var updated = updateByKey('Coupons', 'coupon_id', payload.coupon_id, patch);
  writeAudit(auth.user.user_id, auth.user.role, 'update', 'Coupon', payload.coupon_id, null, updated);
  return ok(publicCoupon_(updated), 'บันทึกคูปองแล้ว');
}

function adminCouponsDelete(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['coupon_id']);
  softDelete('Coupons', 'coupon_id', payload.coupon_id);
  writeAudit(auth.user.user_id, auth.user.role, 'delete', 'Coupon', payload.coupon_id, null, null);
  return ok(null, 'ลบคูปองแล้ว');
}

function incrementCouponUsage_(code) {
  if (!code) return;
  var c = findOne('Coupons', function (r) { return r.code === code; }, true);
  if (c) updateRowAt('Coupons', c.__row, { used_count: numFrom(c.used_count) + 1 });
}
