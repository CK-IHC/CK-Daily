/**
 * CartService.gs — คำนวณราคา/ส่วนลด/VAT ฝั่ง backend เสมอ (ห้ามเชื่อราคาจาก client)
 * ใช้ร่วมกันโดย cart.validate และ order.create
 */

/**
 * คำนวณราคารายการสินค้าจริงจาก DB
 * strict=true (ใช้ตอน order.create): เจอปัญหาอะไรก็ throw ทันที ไม่มีการปรับตะกร้าเงียบๆ
 * strict=false (ใช้ตอน cart.validate): ปรับตะกร้าให้อัตโนมัติ (clip จำนวน/ตัดสินค้าที่หมด) พร้อมแจ้ง issues[]
 */
function priceCartItems_(items, strict) {
  if (!items || !items.length) throw new ApiError('E_INVALID_PAYLOAD', 'ตะกร้าว่างเปล่า', 'items');
  var computed = [];
  var issues = [];

  items.forEach(function (it) {
    var product = findOne('Products', function (r) { return r.product_id === it.product_id; });
    if (!product || !boolFrom(product.is_active)) {
      if (strict) throw new ApiError('E_INVALID_PAYLOAD', 'สินค้าไม่พร้อมขายแล้ว', 'product_id');
      issues.push({ product_id: it.product_id, issue: 'unavailable', message: 'สินค้านี้ถูกนำออกจากตะกร้าเนื่องจากไม่พร้อมขาย' });
      return;
    }

    var qty = Math.max(1, Math.floor(numFrom(it.qty, 1)));
    var maxPerOrder = numFrom(product.max_per_order);
    if (maxPerOrder > 0 && qty > maxPerOrder) {
      if (strict) throw new ApiError('E_INVALID_PAYLOAD', 'สั่งสินค้า "' + product.name + '" เกินจำกัดต่อออเดอร์ (สูงสุด ' + maxPerOrder + ')', 'qty');
      qty = maxPerOrder;
      issues.push({ product_id: it.product_id, issue: 'max_per_order_clipped', message: '"' + product.name + '" ปรับจำนวนเหลือ ' + qty + ' (จำกัดต่อออเดอร์)' });
    }

    if (boolFrom(product.track_stock)) {
      var avail = numFrom(product.stock_qty);
      if (avail < qty) {
        if (strict) throw new ApiError('E_STOCK_INSUFFICIENT', 'สินค้า "' + product.name + '" คงเหลือไม่พอ (เหลือ ' + avail + ')', 'product_id');
        qty = avail;
        if (qty <= 0) {
          issues.push({ product_id: it.product_id, issue: 'out_of_stock', qty_available: 0, message: '"' + product.name + '" หมดแล้ว ถูกนำออกจากตะกร้า' });
          return;
        }
        issues.push({ product_id: it.product_id, issue: 'stock_clipped', qty_available: qty, message: '"' + product.name + '" เหลือ ' + qty + ' ชิ้น ปรับจำนวนในตะกร้าให้แล้ว' });
      }
    }

    var selectedOptionIds = it.options || it.option_ids || [];
    var allOptions = findAll('ProductOptions', function (o) { return o.product_id === product.product_id; });
    var groups = {};
    allOptions.forEach(function (o) { (groups[o.group_name] = groups[o.group_name] || []).push(o); });
    Object.keys(groups).forEach(function (g) {
      var groupOpts = groups[g];
      var required = boolFrom(groupOpts[0].is_required);
      var selectedInGroup = groupOpts.filter(function (o) { return selectedOptionIds.indexOf(o.option_id) > -1; });
      if (required && selectedInGroup.length === 0) {
        if (strict) throw new ApiError('E_INVALID_PAYLOAD', 'กรุณาเลือก "' + g + '" สำหรับสินค้า "' + product.name + '"', 'options');
        issues.push({ product_id: it.product_id, issue: 'missing_required_option', message: 'กรุณาเลือก "' + g + '" สำหรับ "' + product.name + '"' });
      }
    });

    var optionDelta = 0, optionSnapshot = [];
    selectedOptionIds.forEach(function (optId) {
      var opt = allOptions.filter(function (o) { return o.option_id === optId; })[0];
      if (opt) { optionDelta += numFrom(opt.price_delta); optionSnapshot.push({ option_id: opt.option_id, name: opt.option_name, price_delta: numFrom(opt.price_delta) }); }
    });

    var unitPrice = round2(numFrom(product.price) + optionDelta);
    computed.push({
      product_id: product.product_id, sku: product.sku || '', product_name: product.name, unit_price: unitPrice, qty: qty,
      line_total: round2(unitPrice * qty), note: String(it.note || '').slice(0, 200),
      options_json: JSON.stringify(optionSnapshot), option_names: optionSnapshot.map(function (o) { return o.name; }),
      track_stock: boolFrom(product.track_stock), is_frozen: boolFrom(product.is_frozen)
    });
  });

  if (strict && computed.length === 0) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่มีสินค้าที่สั่งซื้อได้ในตะกร้า', 'items');
  return { computed: computed, issues: issues };
}

/** คำนวณยอดรวมทั้งออเดอร์ (subtotal/discount/delivery/vat/grand_total) จากราคาจริง */
function computeOrderTotals_(items, orderType, couponCode, userId, strict) {
  var priced = priceCartItems_(items, strict);
  var subtotal = round2(priced.computed.reduce(function (s, i) { return s + i.line_total; }, 0));

  var couponResult = { discount: 0, freeDelivery: false, coupon: null };
  if (couponCode) {
    couponResult = evaluateCoupon_(couponCode, subtotal, userId);
  }

  var settings = getAllSettings();
  var deliveryFee = orderType === 'delivery' ? numFrom(settings.delivery_fee) : 0;
  if (couponResult.freeDelivery) deliveryFee = 0;

  var discount = couponResult.discount || 0;
  var taxableBase = Math.max(0, subtotal - discount);
  var vat = 0; // ไม่คิด VAT ตามนโยบายร้าน (ปิดการคำนวณ VAT ทั้งระบบ)
  var grandTotal = round2(taxableBase + deliveryFee + vat);

  return {
    items: priced.computed, issues: priced.issues, subtotal: subtotal, discount: discount,
    delivery_fee: round2(deliveryFee), vat: vat, grand_total: grandTotal, coupon: couponResult.coupon
  };
}

/** ===================== cart.validate ===================== */
function cartValidate(payload, token) {
  var userId = null;
  try { userId = requireAuth(token).user.user_id; } catch (e) { /* อนุญาตให้ guest preview ราคาได้ */ }
  requireFields(payload, ['items']);

  var roundInfo = null;
  if (payload.round_id) {
    var round = findOne('Rounds', function (r) { return r.round_id === payload.round_id; });
    if (!round) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบรอบการขาย', 'round_id');
    assertRoundOpenForOrder_(round);
    roundInfo = publicRound_(round);
  }

  var totals = computeOrderTotals_(payload.items, payload.order_type || 'pickup', payload.coupon_code, userId, false);

  return ok({
    items: totals.items, issues: totals.issues, round: roundInfo,
    subtotal: totals.subtotal, discount: totals.discount, delivery_fee: totals.delivery_fee,
    vat: totals.vat, grand_total: totals.grand_total, has_changes: totals.issues.length > 0
  });
}
