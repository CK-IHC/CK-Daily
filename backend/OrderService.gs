/**
 * OrderService.gs — order.create (LockService, ตัดสต็อกแบบ transaction เดียว), state machine, admin.orders.*
 */

/**
 * สถานะออเดอร์มี 4 ค่าเดียวทั้งระบบ: pending / in_progress / completed / cancelled
 * (เดิมมี confirmed/preparing/ready/delivering คั่นกลาง — ยุบรวมเป็น in_progress ค่าเดียวตามคำขอ
 * ข้อมูลเก่าที่ยังเป็นสถานะเดิมต้องรัน migrateOrderStatuses() ครั้งเดียวจาก Apps Script Editor — ดู Setup.gs)
 * เปลี่ยนสถานะได้อิสระทุกทิศทาง (ตามคำขอให้แอดมินแก้ไขสถานะผิดพลาดย้อนหลังได้) — ผลข้างเคียง (คืนสต็อก/แต้มสะสม)
 * ยังคงมีเงื่อนไขป้องกันซ้ำอยู่ใน transitionOrderStatus_/awardLoyaltyPoints_ ด้านล่าง
 */
var ORDER_STATUSES_ALL_ = ['pending', 'in_progress', 'completed', 'cancelled'];
var ORDER_TRANSITIONS = ORDER_STATUSES_ALL_.reduce(function (m, s) {
  m[s] = ORDER_STATUSES_ALL_.filter(function (x) { return x !== s; });
  return m;
}, {});
var STOCK_RETURN_STATUSES = { pending: 1, in_progress: 1 };
var STATUS_TIMESTAMP_FIELD = { in_progress: 'confirmed_at', completed: 'completed_at' };

/** slip_urls เก็บเป็น JSON array string ในชีต — คืนค่าเป็น array เสมอ (รองรับออเดอร์เก่าที่มีแค่ slip_url เดี่ยว) */
function parseSlipUrls_(o) {
  var list = [];
  if (o.slip_urls) {
    try { list = JSON.parse(o.slip_urls); if (!Array.isArray(list)) list = []; } catch (e) { list = []; }
  }
  if (!list.length && o.slip_url) list = [o.slip_url];
  return list;
}

function publicOrder_(o) {
  return {
    order_id: o.order_id, order_no: o.order_no, user_id: o.user_id, phone: normalizePhone_(o.phone), customer_name: o.customer_name,
    round_id: o.round_id, order_type: o.order_type, address: o.address, delivery_note: o.delivery_note,
    subtotal: numFrom(o.subtotal), discount: numFrom(o.discount), coupon_code: o.coupon_code,
    delivery_fee: numFrom(o.delivery_fee), vat: numFrom(o.vat), grand_total: numFrom(o.grand_total),
    payment_method: o.payment_method, payment_status: o.payment_status, slip_url: o.slip_url,
    slip_urls: parseSlipUrls_(o),
    status: normalizeOrderStatus_(o.status), cancel_reason: o.cancel_reason, placed_at: o.placed_at, confirmed_at: o.confirmed_at,
    ready_at: o.ready_at, completed_at: o.completed_at, staff_id: o.staff_id,
    photo_url: o.photo_url || '', admin_note: o.admin_note || ''
  };
}

/** ===================== order.create ===================== */
function orderCreate(payload, token) {
  var auth = requireAuth(token);
  requireFields(payload, ['items', 'round_id', 'order_type']);
  if (['pickup', 'delivery', 'dine_in'].indexOf(payload.order_type) === -1) {
    throw new ApiError('E_INVALID_PAYLOAD', 'ประเภทออเดอร์ไม่ถูกต้อง', 'order_type');
  }
  // หมายเหตุ: ไม่บังคับ address อีกต่อไป — ที่อยู่จัดส่งย้ายไปอยู่ระดับรอบ (Rounds.delivery_location) แทน
  var paymentMethod = payload.payment_method || 'cash';
  if (['cash', 'transfer', 'promptpay', 'credit'].indexOf(paymentMethod) === -1) {
    throw new ApiError('E_INVALID_PAYLOAD', 'วิธีชำระเงินไม่ถูกต้อง', 'payment_method');
  }

  var lock = LockService.getScriptLock();
  var acquired = lock.tryLock(30000);
  if (!acquired) throw new ApiError('E_SERVER', 'ระบบกำลังประมวลผลคำสั่งซื้ออื่นอยู่ กรุณาลองใหม่อีกครั้ง');

  try {
    var round = getRoundOrThrow_(payload.round_id);
    assertRoundOpenForOrder_(round);

    // คำนวณราคาจริงใหม่ทั้งหมดภายใน Lock (strict) — ห้ามเชื่อราคา/สต็อกจาก client เด็ดขาด
    var totals = computeOrderTotals_(payload.items, payload.order_type, payload.coupon_code, auth.user.user_id, true);

    var idPair = genOrderId();
    var isTransferLike = paymentMethod === 'transfer' || paymentMethod === 'promptpay';
    var order = {
      order_id: idPair.order_id, order_no: idPair.order_no, user_id: auth.user.user_id, phone: auth.user.phone,
      customer_name: auth.user.name || auth.user.phone, round_id: round.round_id, order_type: payload.order_type,
      address: payload.order_type === 'delivery' ? String(payload.address) : '', delivery_note: String(payload.delivery_note || '').slice(0, 300),
      subtotal: totals.subtotal, discount: totals.discount, coupon_code: payload.coupon_code || '',
      delivery_fee: totals.delivery_fee, vat: totals.vat, grand_total: totals.grand_total,
      payment_method: paymentMethod, payment_status: isTransferLike ? 'pending_verify' : 'unpaid',
      slip_url: payload.slip_url || '', status: 'pending', cancel_reason: '',
      placed_at: fmtDateTime(new Date()), confirmed_at: '', ready_at: '', completed_at: '', staff_id: ''
    };
    insertRow('Orders', order);

    var itemRows = totals.items.map(function (i) {
      return {
        item_id: genId('ITM'), order_id: order.order_id, product_id: i.product_id, category_id: i.category_id || '', sku: i.sku || '', product_name: i.product_name,
        options_json: i.options_json, unit_price: i.unit_price, qty: i.qty, line_total: i.line_total, note: i.note
      };
    });
    insertRows('OrderItems', itemRows);

    // ตัดสต็อกทีละสินค้า — ทุกจุดนี้อยู่ภายใน Lock เดียวกัน + invalidate cache ทันทีทุกครั้งที่เขียน กัน overselling
    itemRows.forEach(function (i) {
      deductStock_(i.product_id, i.qty, 'order', order.order_id, auth.user.user_id);
    });

    updateRowAt('Rounds', round.__row, { current_orders: numFrom(round.current_orders) + 1 });
    if (payload.coupon_code) incrementCouponUsage_(payload.coupon_code);

    writeAudit(auth.user.user_id, auth.user.role, 'create', 'Order', order.order_id, null, order);
    notifyOrderEvent_(order, 'created');

    return ok(publicOrder_(order), 'สั่งซื้อสำเร็จ');
  } finally {
    lock.releaseLock();
  }
}

/** ===================== order.uploadSlip ===================== */
function orderUploadSlip(payload, token) {
  var auth = requireAuth(token);
  requireFields(payload, ['order_id', 'image_base64']);
  var order = findOne('Orders', function (r) { return r.order_id === payload.order_id; }, true);
  if (!order) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบออเดอร์', 'order_id');
  if (order.user_id !== auth.user.user_id && ['staff', 'manager', 'admin'].indexOf(auth.user.role) === -1) {
    throw new ApiError('E_FORBIDDEN', 'ไม่มีสิทธิ์เข้าถึงออเดอร์นี้');
  }
  var url = uploadImageToDrive_(payload.image_base64, 'slip-' + order.order_id + '.jpg', order.order_id, null, 'CK Daily - Payment Slips');
  // สะสมประวัติสลิปทุกครั้งที่แนบ (ไม่ทับของเดิม) — ใช้แสดงเป็นแกลเลอรีในหน้าตรวจสอบสลิปฝั่งแอดมิน
  var urlHistory = parseSlipUrls_(order);
  urlHistory.push(url);
  var updated = updateRowAt('Orders', order.__row, { slip_url: url, slip_urls: JSON.stringify(urlHistory), payment_status: 'pending_verify' });

  // แนบซ้ำ (ครั้งที่ 2 ขึ้นไป) ให้อัปเดตแถว Payments เดิมของออเดอร์นี้แทนการสร้างแถวใหม่ กันแถวซ้ำซ้อนในหน้าตรวจสอบสลิป
  var existingPayment = findOne('Payments', function (p) { return p.order_id === order.order_id; }, true);
  if (existingPayment) {
    updateRowAt('Payments', existingPayment.__row, {
      customer_name: order.customer_name, phone: normalizePhone_(order.phone),
      amount: numFrom(order.grand_total), method: order.payment_method, slip_url: url,
      verified_by: '', verified_at: '', status: 'pending'
    });
  } else {
    insertRow('Payments', {
      payment_id: genId('PAY'), order_id: order.order_id, customer_name: order.customer_name, phone: normalizePhone_(order.phone),
      amount: numFrom(order.grand_total), method: order.payment_method, slip_url: url, verified_by: '', verified_at: '', status: 'pending'
    });
  }
  writeAudit(auth.user.user_id, auth.user.role, 'upload_slip', 'Order', order.order_id, null, { slip_url: url });
  notifyOrderEvent_(updated, 'slip_uploaded');
  return ok({ slip_url: url, slip_urls: urlHistory }, 'อัปโหลดสลิปแล้ว รอตรวจสอบ');
}

/** ===================== order.list / detail / track ===================== */
function orderList(payload, token) {
  var auth = requireAuth(token);
  payload = payload || {};
  var rows = findAll('Orders', function (o) {
    if (o.user_id !== auth.user.user_id) return false;
    var st = normalizeOrderStatus_(o.status);
    if (payload.status_group === 'active') return ['pending', 'in_progress'].indexOf(st) > -1;
    if (payload.status_group === 'completed') return st === 'completed';
    if (payload.status_group === 'cancelled') return st === 'cancelled';
    return true;
  }).sort(function (a, b) { return toDate(b.placed_at) - toDate(a.placed_at); });

  var page = numFrom(payload.page, 1), pageSize = numFrom(payload.page_size, 20);
  var start = (page - 1) * pageSize;
  var pageRows = rows.slice(start, start + pageSize);
  var orderIds = {};
  pageRows.forEach(function (o) { orderIds[o.order_id] = true; });
  var allItems = findAll('OrderItems', function (i) { return orderIds[i.order_id]; });

  var result = pageRows.map(function (o) {
    var d = publicOrder_(o);
    d.items = allItems.filter(function (i) { return i.order_id === o.order_id; });
    return d;
  });
  return ok({ total: rows.length, page: page, page_size: pageSize, items: result });
}

/** แผนกของลูกค้า (จากโปรไฟล์ผู้ใช้) — ใช้แสดงบนใบเสร็จ/รายงานพิมพ์ทุกใบ */
function departmentForUser_(userId) {
  if (!userId) return '';
  var u = findOne('Users', function (r) { return r.user_id === userId; });
  return (u && u.department) || '';
}

function loadOrderDetail_(orderId) {
  var order = findOne('Orders', function (r) { return r.order_id === orderId; });
  if (!order) return null;
  var items = findAll('OrderItems', function (i) { return i.order_id === orderId; });
  var frozenIds = frozenProductIdSet_();
  items = items.map(function (i) {
    var copy = {}; for (var k in i) copy[k] = i[k];
    copy.is_frozen = !!frozenIds[i.product_id];
    return copy;
  });
  var d = publicOrder_(order);
  d.items = items;
  d.has_frozen = items.some(function (i) { return i.is_frozen; });
  d.department = departmentForUser_(order.user_id);
  return { order: order, detail: d };
}

/** map product_id -> true สำหรับสินค้าที่ตั้งค่าเป็นแช่แข็ง (ใช้ join แสดง badge บน order card) */
function frozenProductIdSet_() {
  var set = {};
  findAll('Products', function (p) { return boolFrom(p.is_frozen); }, true).forEach(function (p) { set[p.product_id] = true; });
  return set;
}

function orderDetail(payload, token) {
  var auth = requireAuth(token);
  requireFields(payload, ['order_id']);
  var found = loadOrderDetail_(payload.order_id);
  if (!found) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบออเดอร์', 'order_id');
  if (found.order.user_id !== auth.user.user_id && ['staff', 'manager', 'admin'].indexOf(auth.user.role) === -1) {
    throw new ApiError('E_FORBIDDEN', 'ไม่มีสิทธิ์เข้าถึงออเดอร์นี้');
  }
  return ok(found.detail);
}

function orderTrack(payload, token) {
  return orderDetail(payload, token);
}

/**
 * รูปสลิปโอนเงินของออเดอร์ — ดึงเป็น data URI ฝั่งเซิร์ฟเวอร์แทนการลิงก์ตรงไปที่ Drive
 * เพราะบางองค์กร (Google Workspace) ตั้งนโยบายบล็อกการแชร์ไฟล์แบบ "Anyone with the link"
 * ทำให้ลูกค้า/แอดมินเปิดลิงก์ Drive ตรงๆ ไม่ได้ขึ้น "ไม่สามารถเข้าถึง" แม้จะ setSharing ไว้แล้วก็ตาม
 * ใช้ DriveApp.getFileById().getBlob() ซึ่งอ่านผ่านสิทธิ์ของสคริปต์เอง ไม่ต้องพึ่ง sharing link เลย
 */
function orderGetSlipBase64(payload, token) {
  var auth = requireAuth(token);
  requireFields(payload, ['order_id']);
  var order = findOne('Orders', function (r) { return r.order_id === payload.order_id; });
  if (!order) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบออเดอร์', 'order_id');
  if (order.user_id !== auth.user.user_id && ['staff', 'manager', 'admin'].indexOf(auth.user.role) === -1) {
    throw new ApiError('E_FORBIDDEN', 'ไม่มีสิทธิ์เข้าถึงออเดอร์นี้');
  }
  if (!order.slip_url) return ok({ data_uri: '' });
  var m = /[?&]id=([^&]+)/.exec(order.slip_url);
  if (!m) return ok({ data_uri: '' });
  try {
    var blob = DriveApp.getFileById(m[1]).getBlob();
    return ok({ data_uri: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) });
  } catch (e) {
    return ok({ data_uri: '' });
  }
}

/** helper: แปลง Drive URL (มี ?id=) เป็น data URI เดียว ใช้ร่วมกับทั้ง orderGetSlipBase64 และ orderGetSlipsBase64 */
function driveUrlToDataUri_(url) {
  var m = /[?&]id=([^&]+)/.exec(url || '');
  if (!m) return '';
  try {
    var blob = DriveApp.getFileById(m[1]).getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (e) {
    return '';
  }
}

/** ดึงรูปสลิปทุกใบที่เคยแนบของออเดอร์นี้ (ประวัติการแนบซ้ำ) — ใช้แสดงเป็นแกลเลอรีในหน้าตรวจสอบสลิปฝั่งแอดมิน */
function orderGetSlipsBase64(payload, token) {
  var auth = requireAuth(token);
  requireFields(payload, ['order_id']);
  var order = findOne('Orders', function (r) { return r.order_id === payload.order_id; });
  if (!order) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบออเดอร์', 'order_id');
  if (order.user_id !== auth.user.user_id && ['staff', 'manager', 'admin'].indexOf(auth.user.role) === -1) {
    throw new ApiError('E_FORBIDDEN', 'ไม่มีสิทธิ์เข้าถึงออเดอร์นี้');
  }
  var urls = parseSlipUrls_(order);
  var dataUris = urls.map(driveUrlToDataUri_).filter(function (u) { return !!u; });
  return ok({ data_uris: dataUris });
}

/**
 * QR โค้ดของเลขที่ออเดอร์ (สำหรับใบเสร็จรับเงินหลังชำระเงินสำเร็จ) — ดึงจาก qrserver.com ฝั่งเซิร์ฟเวอร์
 * แล้วแปลงเป็น data URI แทนการฝัง URL ตรงๆ เพราะ html2canvas วาดรูปข้ามโดเมนที่ไม่ส่ง CORS header
 * ลง canvas ไม่ได้ (เหมือนปัญหาเดียวกับ QR ชำระเงินจาก Drive) — ใช้ pattern เดียวกับ catalogGetPaymentQrBase64
 */
function orderGetReceiptQrBase64(payload, token) {
  var auth = requireAuth(token);
  requireFields(payload, ['order_id']);
  var order = findOne('Orders', function (r) { return r.order_id === payload.order_id; });
  if (!order) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบออเดอร์', 'order_id');
  if (order.user_id !== auth.user.user_id && ['staff', 'manager', 'admin'].indexOf(auth.user.role) === -1) {
    throw new ApiError('E_FORBIDDEN', 'ไม่มีสิทธิ์เข้าถึงออเดอร์นี้');
  }
  try {
    var url = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(order.order_no);
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return ok({ data_uri: '' });
    var blob = resp.getBlob();
    return ok({ data_uri: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) });
  } catch (e) {
    return ok({ data_uri: '' });
  }
}

/** ===================== order.cancel ===================== */
function orderCancel(payload, token) {
  var auth = requireAuth(token);
  requireFields(payload, ['order_id']);
  var order = findOne('Orders', function (r) { return r.order_id === payload.order_id; }, true);
  if (!order) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบออเดอร์', 'order_id');
  var isOwner = order.user_id === auth.user.user_id;
  var isStaff = ['staff', 'manager', 'admin'].indexOf(auth.user.role) > -1;
  if (!isOwner && !isStaff) throw new ApiError('E_FORBIDDEN', 'ไม่มีสิทธิ์ยกเลิกออเดอร์นี้');

  if (isOwner && !isStaff) {
    var round = findOne('Rounds', function (r) { return r.round_id === order.round_id; });
    var roundStillOpen = round && round.status === 'open' && toDate(round.close_at) > new Date();
    if (order.status !== 'pending' || !roundStillOpen) {
      throw new ApiError('E_ORDER_NOT_CANCELLABLE', 'ยกเลิกออเดอร์นี้ไม่ได้แล้ว (สถานะเปลี่ยนไปแล้วหรือรอบปิดรับแล้ว)');
    }
  } else {
    if (ORDER_TRANSITIONS[order.status].indexOf('cancelled') === -1) {
      throw new ApiError('E_ORDER_NOT_CANCELLABLE', 'ออเดอร์นี้อยู่ในสถานะที่ยกเลิกไม่ได้แล้ว');
    }
  }

  return transitionOrderStatus_(order, 'cancelled', auth, payload.reason || 'ลูกค้ายกเลิก');
}

/** ===================== State machine กลาง ===================== */
function transitionOrderStatus_(order, toStatus, auth, cancelReason) {
  var allowed = ORDER_TRANSITIONS[order.status] || [];
  if (allowed.indexOf(toStatus) === -1) {
    throw new ApiError('E_STATUS_TRANSITION_INVALID', 'เปลี่ยนสถานะจาก ' + order.status + ' เป็น ' + toStatus + ' ไม่ได้');
  }
  var patch = { status: toStatus, staff_id: auth.user.role === 'customer' ? order.staff_id : auth.user.user_id };
  var tsField = STATUS_TIMESTAMP_FIELD[toStatus];
  if (tsField) patch[tsField] = fmtDateTime(new Date());
  if (toStatus === 'cancelled') patch.cancel_reason = cancelReason || '';

  if (toStatus === 'cancelled' && STOCK_RETURN_STATUSES[order.status]) {
    var items = findAll('OrderItems', function (i) { return i.order_id === order.order_id; });
    items.forEach(function (i) { restoreStock_(i.product_id, numFrom(i.qty), 'order', order.order_id, auth.user.user_id); });
    var round = findOne('Rounds', function (r) { return r.round_id === order.round_id; }, true);
    if (round) updateRowAt('Rounds', round.__row, { current_orders: Math.max(0, numFrom(round.current_orders) - 1) });
  }

  // เดิมเปลี่ยนสถานะได้ทางเดียว completed จึงเป็น terminal state ไม่มีทางกลับมา completed ซ้ำ
  // ตอนนี้เปลี่ยนสถานะย้อนกลับไปกลับมาได้อิสระ ต้องกันแต้มสะสมซ้ำ — ให้แต้มเฉพาะครั้งแรกที่ถึง completed เท่านั้น
  if (toStatus === 'completed' && !order.completed_at) {
    awardLoyaltyPoints_(order);
  }

  var updated = updateRowAt('Orders', order.__row, patch);
  writeAudit(auth.user.user_id, auth.user.role, 'order_status_' + toStatus, 'Order', order.order_id, { status: order.status }, { status: toStatus });
  notifyOrderEvent_(updated, 'status_' + toStatus);
  return ok(publicOrder_(updated), 'อัปเดตสถานะเป็น ' + toStatus + ' แล้ว');
}

function awardLoyaltyPoints_(order) {
  var user = findOne('Users', function (u) { return u.user_id === order.user_id; }, true);
  if (!user) return;
  var rate = numFrom(getSetting('points_per_baht', '0.01'));
  var earned = Math.floor(numFrom(order.grand_total) * rate);
  if (earned <= 0) return;
  var newPoints = numFrom(user.points) + earned;
  var tier = newPoints >= 2000 ? 'gold' : (newPoints >= 500 ? 'silver' : 'bronze');
  updateRowAt('Users', user.__row, { points: newPoints, tier: tier });
}

/** ===================== Admin: Orders ===================== */
/** เงื่อนไขกรองร่วมของ admin.orders.list / admin.orders.summary */
function orderMatchesFilters_(o, payload) {
  if (payload.round_id && o.round_id !== payload.round_id) return false;
  if (payload.status && normalizeOrderStatus_(o.status) !== payload.status) return false;
  if (payload.payment_status && o.payment_status !== payload.payment_status) return false;
  if (payload.phone && normalizePhone_(o.phone).indexOf(payload.phone) === -1) return false;
  if (payload.order_no && String(o.order_no || '').indexOf(payload.order_no) === -1) return false;
  if (payload.date_from && toDate(o.placed_at) < toDate(payload.date_from)) return false;
  if (payload.date_to && toDate(o.placed_at) > toDate(payload.date_to)) return false;
  return true;
}

function adminOrdersList(payload, token) {
  requireRole(token, ['staff', 'manager', 'admin']);
  payload = payload || {};
  var allActive = findAll('Orders', null); // อ่านทั้งชีตครั้งเดียว ใช้ทั้งกรองรายการและคำนวณจำนวนครั้งที่สั่งของแต่ละเบอร์
  var rows = allActive.filter(function (o) { return orderMatchesFilters_(o, payload); })
    .sort(function (a, b) { return toDate(b.placed_at) - toDate(a.placed_at); });

  var page = numFrom(payload.page, 1), pageSize = numFrom(payload.page_size, 30);
  var start = (page - 1) * pageSize;
  var pageRows = rows.slice(start, start + pageSize);
  var frozenIds = frozenProductIdSet_();
  var pageOrderIds = {}; pageRows.forEach(function (o) { pageOrderIds[o.order_id] = true; });
  var pageItems = findAll('OrderItems', function (i) { return pageOrderIds[i.order_id]; });
  var frozenByOrder = {};
  var itemsByOrder = {};
  pageItems.forEach(function (i) {
    if (frozenIds[i.product_id]) frozenByOrder[i.order_id] = true;
    (itemsByOrder[i.order_id] = itemsByOrder[i.order_id] || []).push({
      product_id: i.product_id, product_name: i.product_name, qty: numFrom(i.qty),
      unit_price: numFrom(i.unit_price), line_total: numFrom(i.line_total), is_frozen: !!frozenIds[i.product_id]
    });
  });

  var phoneGroups = {};
  allActive.forEach(function (o) { var p = normalizePhone_(o.phone); (phoneGroups[p] = phoneGroups[p] || []).push(o); });
  Object.keys(phoneGroups).forEach(function (p) {
    phoneGroups[p].sort(function (a, b) { return toDate(a.placed_at) - toDate(b.placed_at); });
  });

  var usersById_ = {};
  findAll('Users', null).forEach(function (u) { usersById_[u.user_id] = u.department || ''; });

  return ok({
    total: rows.length, page: page, page_size: pageSize,
    items: pageRows.map(function (o) {
      var d = publicOrder_(o);
      d.has_frozen = !!frozenByOrder[o.order_id];
      d.items = itemsByOrder[o.order_id] || [];
      d.department = usersById_[o.user_id] || '';
      var grp = phoneGroups[normalizePhone_(o.phone)] || [o];
      d.phone_order_total = grp.length;
      d.phone_order_seq = grp.map(function (x) { return x.order_id; }).indexOf(o.order_id) + 1;
      return d;
    })
  });
}

/** ค้นหาออเดอร์จากเลขที่ (ใช้กับช่องกรอกเลขสำรองตอนสแกน QR ไม่สำเร็จ) */
function adminOrdersFindByOrderNo(payload, token) {
  requireRole(token, ['staff', 'manager', 'admin']);
  requireFields(payload, ['order_no']);
  var order = findOne('Orders', function (r) { return r.order_no === String(payload.order_no).trim(); }, true);
  if (!order) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบออเดอร์เลขที่นี้', 'order_no');
  var found = loadOrderDetail_(order.order_id);
  return ok(found.detail);
}

/** สรุปยอดออเดอร์ตามตัวกรองเดียวกับ admin.orders.list — รวมยอดตามสินค้า (จำนวน/ยอดเงิน) สำหรับแท็บ "สรุปยอด" */
function adminOrdersSummary(payload, token) {
  requireRole(token, ['staff', 'manager', 'admin']);
  payload = payload || {};
  var orders = findAll('Orders', function (o) { return orderMatchesFilters_(o, payload) && o.status !== 'cancelled'; });
  var orderIds = {}; orders.forEach(function (o) { orderIds[o.order_id] = true; });
  var items = findAll('OrderItems', function (i) { return orderIds[i.order_id]; });
  var productById = {};
  findAll('Products', null, true).forEach(function (p) { productById[p.product_id] = p; });
  var byProduct = {};
  items.forEach(function (i) {
    var g = byProduct[i.product_id] || (byProduct[i.product_id] = {
      product_id: i.product_id, sku: i.sku || (productById[i.product_id] && productById[i.product_id].sku) || '',
      product_name: i.product_name, qty: 0, amount: 0,
      stock_qty: productById[i.product_id] ? numFrom(productById[i.product_id].stock_qty) : null
    });
    g.qty += numFrom(i.qty);
    g.amount += numFrom(i.line_total);
  });
  var totalAmount = orders.reduce(function (s, o) { return s + numFrom(o.grand_total); }, 0);

  // สรุปการแนบรูปออเดอร์/สลิปโอนเงิน (ใช้ตัวกรองเดียวกับด้านบน) — สำหรับการ์ดสรุปรูปแนบในแท็บ "สรุปยอด"
  var withPhoto = 0, withSlip = 0;
  var attachmentRows = orders.map(function (o) {
    var slipUrls = parseSlipUrls_(o);
    var hasPhoto = !!o.photo_url;
    var hasSlip = slipUrls.length > 0;
    if (hasPhoto) withPhoto++;
    if (hasSlip) withSlip++;
    return {
      order_id: o.order_id, order_no: o.order_no, customer_name: o.customer_name, phone: normalizePhone_(o.phone),
      placed_at: o.placed_at, has_photo: hasPhoto, photo_url: o.photo_url || '', slip_count: slipUrls.length, has_slip: hasSlip
    };
  }).sort(function (a, b) { return toDate(b.placed_at) - toDate(a.placed_at); });

  return ok({
    order_count: orders.length,
    total_amount: round2(totalAmount),
    by_product: Object.keys(byProduct).map(function (k) { return byProduct[k]; })
      .map(function (g) { g.amount = round2(g.amount); return g; })
      .sort(function (a, b) { return b.qty - a.qty; }),
    attachments_summary: {
      with_photo: withPhoto, without_photo: orders.length - withPhoto,
      with_slip: withSlip, without_slip: orders.length - withSlip,
      orders: attachmentRows
    }
  });
}

function adminOrdersUpdateStatus(payload, token) {
  var auth = requireRole(token, ['staff', 'manager', 'admin']);
  requireFields(payload, ['order_id', 'status']);
  var order = findOne('Orders', function (r) { return r.order_id === payload.order_id; }, true);
  if (!order) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบออเดอร์', 'order_id');
  return transitionOrderStatus_(order, payload.status, auth, payload.reason);
}

function adminOrdersBulkUpdateStatus(payload, token) {
  var auth = requireRole(token, ['staff', 'manager', 'admin']);
  requireFields(payload, ['order_ids', 'status']);
  var results = [];
  payload.order_ids.forEach(function (id) {
    try {
      var order = findOne('Orders', function (r) { return r.order_id === id; }, true);
      if (!order) { results.push({ order_id: id, ok: false, message: 'ไม่พบออเดอร์' }); return; }
      transitionOrderStatus_(order, payload.status, auth, payload.reason);
      results.push({ order_id: id, ok: true });
    } catch (e) {
      results.push({ order_id: id, ok: false, message: e.message });
    }
  });
  return ok(results, 'อัปเดตทั้งหมด ' + results.filter(function (r) { return r.ok; }).length + '/' + results.length + ' รายการ');
}

function adminOrdersVerifyPayment(payload, token) {
  var auth = requireRole(token, ['staff', 'manager', 'admin']);
  requireFields(payload, ['order_id', 'approve']);
  var order = findOne('Orders', function (r) { return r.order_id === payload.order_id; }, true);
  if (!order) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบออเดอร์', 'order_id');
  var approved = boolFrom(payload.approve);
  var newStatus = approved ? 'paid' : 'unpaid';
  var patch = { payment_status: newStatus };
  // อนุมัติสลิปแล้วถือว่าเริ่มเตรียมออเดอร์ได้เลย เปลี่ยนสถานะออเดอร์เป็น "กำลังดำเนินการ" ให้อัตโนมัติ
  // (เฉพาะออเดอร์ที่ยังอยู่สถานะรอดำเนินการ ไม่แตะออเดอร์ที่ถูกเปลี่ยนสถานะไปไกลกว่านั้นแล้วด้วยมือ)
  if (approved && order.status === 'pending') {
    patch.status = 'in_progress';
    patch.confirmed_at = fmtDateTime(new Date());
    patch.staff_id = auth.user.user_id;
  }
  var updated = updateRowAt('Orders', order.__row, patch);

  var payment = findOne('Payments', function (p) { return p.order_id === order.order_id; }, true);
  if (payment) {
    updateRowAt('Payments', payment.__row, {
      status: boolFrom(payload.approve) ? 'approved' : 'rejected',
      verified_by: auth.user.user_id, verified_at: fmtDateTime(new Date())
    });
  }
  writeAudit(auth.user.user_id, auth.user.role, 'verify_payment', 'Order', order.order_id, null, { payment_status: newStatus });
  notifyOrderEvent_(updated, boolFrom(payload.approve) ? 'payment_approved' : 'payment_rejected');
  return ok(publicOrder_(updated), boolFrom(payload.approve) ? 'อนุมัติสลิปแล้ว' : 'ปฏิเสธสลิปแล้ว');
}

/** คืนเงิน — ใช้ได้เฉพาะออเดอร์ที่ชำระเงินแล้ว (paid) เท่านั้น เปลี่ยน payment_status เป็น refunded ถาวร (ย้อนกลับไม่ได้ผ่าน UI) */
function adminOrdersRefund(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['order_id']);
  var order = findOne('Orders', function (r) { return r.order_id === payload.order_id; }, true);
  if (!order) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบออเดอร์', 'order_id');
  if (order.payment_status !== 'paid') {
    throw new ApiError('E_STATUS_TRANSITION_INVALID', 'คืนเงินได้เฉพาะออเดอร์ที่ชำระเงินแล้วเท่านั้น (สถานะปัจจุบัน: ' + order.payment_status + ')');
  }
  var updated = updateRowAt('Orders', order.__row, { payment_status: 'refunded', admin_note: (order.admin_note ? order.admin_note + '\n' : '') + 'คืนเงิน: ' + (payload.reason || 'ไม่ระบุเหตุผล') });
  var payment = findOne('Payments', function (p) { return p.order_id === order.order_id; }, true);
  if (payment) updateRowAt('Payments', payment.__row, { status: 'refunded' });
  writeAudit(auth.user.user_id, auth.user.role, 'refund', 'Order', order.order_id, { payment_status: 'paid' }, { payment_status: 'refunded', reason: payload.reason || '' });
  notifyOrderEvent_(updated, 'payment_refunded');
  return ok(publicOrder_(updated), 'คืนเงินแล้ว');
}

/** รายการสลิป/การชำระเงินจากชีต Payments โดยตรง (ไม่ใช่ผ่าน Orders) — กรองตามสถานะ pending/approved/rejected ได้ */
function adminPaymentsList(payload, token) {
  requireRole(token, ['staff', 'manager', 'admin']);
  payload = payload || {};
  var rows = findAll('Payments', function (p) { return !payload.status || p.status === payload.status; })
    .sort(function (a, b) { return toDate(b.created_at) - toDate(a.created_at); });
  var orderIds = {}; rows.forEach(function (p) { orderIds[p.order_id] = true; });
  var orders = findAll('Orders', function (o) { return orderIds[o.order_id]; }, true);
  var orderById = {}; orders.forEach(function (o) { orderById[o.order_id] = o; });
  var items = findAll('OrderItems', function (i) { return orderIds[i.order_id]; });
  var itemsByOrder = {};
  items.forEach(function (i) { (itemsByOrder[i.order_id] = itemsByOrder[i.order_id] || []).push({ product_name: i.product_name, qty: numFrom(i.qty) }); });
  return ok(rows.map(function (p) {
    var o = orderById[p.order_id] || {};
    return {
      payment_id: p.payment_id, order_id: p.order_id, order_no: o.order_no || '', customer_name: o.customer_name || '',
      phone: normalizePhone_(o.phone || ''), amount: numFrom(p.amount), method: p.method, slip_url: p.slip_url,
      slip_urls: parseSlipUrls_(o),
      status: p.status, verified_by: p.verified_by || '', verified_at: p.verified_at || '', created_at: p.created_at,
      items: itemsByOrder[p.order_id] || []
    };
  }));
}

/** ลบออเดอร์ (soft delete — ซ่อนจากรายการ ไม่กระทบ StockMovements/Payments ที่บันทึกไว้แล้ว) */
function adminOrdersDelete(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['order_id']);
  var order = findOne('Orders', function (r) { return r.order_id === payload.order_id; }, true);
  if (!order) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบออเดอร์', 'order_id');
  softDelete('Orders', 'order_id', payload.order_id);
  writeAudit(auth.user.user_id, auth.user.role, 'delete', 'Order', payload.order_id, null, null);
  return ok(null, 'ลบออเดอร์แล้ว');
}

/** แนบรูปกับออเดอร์ (เช่น รูปแพ็คของ/ตรวจสอบก่อนส่ง) — แนะนำไม่เกิน ~3MB ต่อรูป (ยิ่งเล็กยิ่งอัปโหลดไว) */
function adminOrdersUploadPhoto(payload, token) {
  var auth = requireRole(token, ['staff', 'manager', 'admin']);
  requireFields(payload, ['order_id', 'image_base64']);
  var order = findOne('Orders', function (r) { return r.order_id === payload.order_id; }, true);
  if (!order) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบออเดอร์', 'order_id');
  var url = uploadImageToDrive_(payload.image_base64, 'order-' + order.order_id + '.jpg', order.order_id);
  var updated = updateRowAt('Orders', order.__row, { photo_url: url });
  writeAudit(auth.user.user_id, auth.user.role, 'upload_order_photo', 'Order', order.order_id, null, { photo_url: url });
  return ok(publicOrder_(updated), 'แนบรูปแล้ว');
}

/** บันทึกหมายเหตุภายใน (staff) แยกจาก delivery_note ของลูกค้า */
function adminOrdersSetNote(payload, token) {
  var auth = requireRole(token, ['staff', 'manager', 'admin']);
  requireFields(payload, ['order_id']);
  var order = findOne('Orders', function (r) { return r.order_id === payload.order_id; }, true);
  if (!order) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบออเดอร์', 'order_id');
  var updated = updateRowAt('Orders', order.__row, { admin_note: String(payload.admin_note || '').slice(0, 500) });
  writeAudit(auth.user.user_id, auth.user.role, 'set_order_note', 'Order', order.order_id, null, { admin_note: updated.admin_note });
  return ok(publicOrder_(updated), 'บันทึกหมายเหตุแล้ว');
}
