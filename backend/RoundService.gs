/**
 * RoundService.gs — รอบการขาย: catalog.getActiveRounds (ลูกค้า) + admin.rounds.* (แอดมิน)
 */

var ROUND_STATUSES = ['draft', 'open', 'closed', 'preparing', 'delivering', 'completed', 'cancelled'];

function publicRound_(r) {
  return {
    round_id: r.round_id, round_name: r.round_name, open_at: r.open_at, close_at: r.close_at,
    delivery_at: r.delivery_at, status: r.status, capacity: numFrom(r.capacity),
    current_orders: numFrom(r.current_orders), note: r.note, delivery_location: r.delivery_location || '',
    is_open_for_order: r.status === 'open' && toDate(r.close_at) > new Date() &&
      (numFrom(r.capacity) === 0 || numFrom(r.current_orders) < numFrom(r.capacity))
  };
}

function catalogGetActiveRounds() {
  var rows = findAll('Rounds', function (r) { return r.status === 'open' || r.status === 'draft'; })
    .sort(function (a, b) { return toDate(a.open_at) - toDate(b.open_at); });
  return ok(rows.map(publicRound_));
}

function getRoundOrThrow_(roundId) {
  var round = findOne('Rounds', function (r) { return r.round_id === roundId; }, true);
  if (!round) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบรอบการขาย', 'round_id');
  return round;
}

/** ตรวจว่ารอบยังเปิดรับออเดอร์อยู่จริง — เรียกซ้ำภายใน Lock ตอน order.create เสมอ */
function assertRoundOpenForOrder_(round) {
  if (round.status !== 'open') throw new ApiError('E_ROUND_CLOSED', 'รอบนี้ปิดรับออเดอร์แล้ว');
  if (toDate(round.close_at) < new Date()) throw new ApiError('E_ROUND_CLOSED', 'เลยเวลาปิดรับออเดอร์ของรอบนี้แล้ว');
  if (numFrom(round.capacity) > 0 && numFrom(round.current_orders) >= numFrom(round.capacity)) {
    throw new ApiError('E_ROUND_FULL', 'รอบนี้เต็มแล้ว กรุณาเลือกรอบถัดไป');
  }
}

/** ===================== Admin: Rounds CRUD/lifecycle ===================== */
function adminRoundsList(payload, token) {
  requireRole(token, ['manager', 'admin', 'staff']);
  var rows = findAll('Rounds', null).sort(function (a, b) { return toDate(b.open_at) - toDate(a.open_at); });
  return ok(rows.map(function (r) {
    var o = publicRound_(r);
    var orders = findAll('Orders', function (x) { return x.round_id === r.round_id; });
    o.sales_total = round2(orders.filter(function (x) { return x.status !== 'cancelled'; })
      .reduce(function (s, x) { return s + numFrom(x.grand_total); }, 0));
    return o;
  }));
}

function adminRoundsCreate(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['round_name', 'open_at', 'close_at', 'delivery_at']);
  var obj = {
    round_id: genRoundId(), round_name: payload.round_name, open_at: payload.open_at, close_at: payload.close_at,
    delivery_at: payload.delivery_at, status: payload.status || 'draft', capacity: numFrom(payload.capacity),
    current_orders: 0, note: payload.note || '', delivery_location: payload.delivery_location || ''
  };
  insertRow('Rounds', obj);
  writeAudit(auth.user.user_id, auth.user.role, 'create', 'Round', obj.round_id, null, obj);
  return ok(publicRound_(obj), 'สร้างรอบแล้ว');
}

function adminRoundsUpdate(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['round_id']);
  var patch = {};
  ['round_name', 'open_at', 'close_at', 'delivery_at', 'note', 'delivery_location'].forEach(function (f) { if (payload[f] !== undefined) patch[f] = payload[f]; });
  if (payload.capacity !== undefined) patch.capacity = numFrom(payload.capacity);
  var updated = updateByKey('Rounds', 'round_id', payload.round_id, patch);
  writeAudit(auth.user.user_id, auth.user.role, 'update', 'Round', payload.round_id, null, updated);
  return ok(publicRound_(updated), 'บันทึกรอบแล้ว');
}

var ROUND_TRANSITIONS = {
  draft: ['open', 'cancelled'], open: ['closed', 'cancelled'], closed: ['preparing', 'cancelled'],
  preparing: ['delivering', 'cancelled'], delivering: ['completed'], completed: [], cancelled: []
};

function transitionRound_(round, toStatus, auth) {
  var allowed = ROUND_TRANSITIONS[round.status] || [];
  if (allowed.indexOf(toStatus) === -1) {
    throw new ApiError('E_STATUS_TRANSITION_INVALID', 'เปลี่ยนสถานะรอบจาก ' + round.status + ' เป็น ' + toStatus + ' ไม่ได้');
  }
  var updated = updateRowAt('Rounds', round.__row, { status: toStatus });
  writeAudit(auth.user.user_id, auth.user.role, 'round_status_' + toStatus, 'Round', round.round_id, { status: round.status }, { status: toStatus });
  return updated;
}

function adminRoundsOpen(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['round_id']);
  var round = getRoundOrThrow_(payload.round_id);
  return ok(publicRound_(transitionRound_(round, 'open', auth)), 'เปิดรอบแล้ว');
}

function adminRoundsClose(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['round_id']);
  var round = getRoundOrThrow_(payload.round_id);
  return ok(publicRound_(transitionRound_(round, 'closed', auth)), 'ปิดรับออเดอร์แล้ว');
}

function adminRoundsSetStatus(payload, token) {
  var auth = requireRole(token, ['manager', 'admin', 'staff']);
  requireFields(payload, ['round_id', 'status']);
  if (ROUND_STATUSES.indexOf(payload.status) === -1) throw new ApiError('E_INVALID_PAYLOAD', 'สถานะไม่ถูกต้อง', 'status');
  var round = getRoundOrThrow_(payload.round_id);
  return ok(publicRound_(transitionRound_(round, payload.status, auth)), 'อัปเดตสถานะรอบแล้ว');
}

function adminRoundsDelete(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['round_id']);
  var round = getRoundOrThrow_(payload.round_id);
  if (round.status !== 'draft') throw new ApiError('E_STATUS_TRANSITION_INVALID', 'ลบได้เฉพาะรอบที่ยังเป็น draft');
  softDelete('Rounds', 'round_id', payload.round_id);
  writeAudit(auth.user.user_id, auth.user.role, 'delete', 'Round', payload.round_id, null, null);
  return ok(null, 'ลบรอบแล้ว');
}

/** ===================== ใบสรุปการผลิต + สรุปการเงินของรอบ ===================== */
function adminRoundsSummary(payload, token) {
  requireRole(token, ['manager', 'admin', 'staff']);
  requireFields(payload, ['round_id']);
  var round = getRoundOrThrow_(payload.round_id);
  var orders = findAll('Orders', function (o) { return o.round_id === payload.round_id && o.status !== 'cancelled'; });
  var orderIds = {};
  orders.forEach(function (o) { orderIds[o.order_id] = true; });
  var items = findAll('OrderItems', function (i) { return orderIds[i.order_id]; });

  var productTotals = {};
  items.forEach(function (i) {
    var key = i.product_name;
    if (!productTotals[key]) productTotals[key] = 0;
    productTotals[key] += numFrom(i.qty);
  });
  var productionSheet = Object.keys(productTotals).map(function (name) {
    return { product_name: name, qty: productTotals[name] };
  }).sort(function (a, b) { return b.qty - a.qty; });

  var financeSummary = { cash: 0, transfer: 0, promptpay: 0, credit: 0, pending_verify: 0, total: 0 };
  orders.forEach(function (o) {
    var amt = numFrom(o.grand_total);
    financeSummary.total += amt;
    if (o.payment_status === 'pending_verify') financeSummary.pending_verify += amt;
    else if (financeSummary.hasOwnProperty(o.payment_method)) financeSummary[o.payment_method] += amt;
  });
  Object.keys(financeSummary).forEach(function (k) { financeSummary[k] = round2(financeSummary[k]); });

  return ok({
    round: publicRound_(round),
    production_sheet: productionSheet,
    total_items: productionSheet.reduce(function (s, p) { return s + p.qty; }, 0),
    total_orders: orders.length,
    finance_summary: financeSummary
  });
}

function adminRoundsOrders(payload, token) {
  requireRole(token, ['manager', 'admin', 'staff']);
  requireFields(payload, ['round_id']);
  var orders = findAll('Orders', function (o) { return o.round_id === payload.round_id; })
    .sort(function (a, b) { return toDate(b.placed_at) - toDate(a.placed_at); });
  return ok(orders.map(publicOrder_));
}

