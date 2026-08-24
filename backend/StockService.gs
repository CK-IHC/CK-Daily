/**
 * StockService.gs — ตัดสต็อก/คืนสต็อก/ปรับปรุง + StockMovements ledger (ห้ามแก้ย้อนหลัง)
 */

function writeStockMovement_(productId, sku, type, qtyChange, qtyBefore, qtyAfter, refType, refId, reason, byUserId) {
  insertRow('StockMovements', {
    movement_id: genId('MOV'), product_id: productId, sku: sku || '', type: type, qty_change: qtyChange,
    qty_before: qtyBefore, qty_after: qtyAfter, ref_type: refType, ref_id: refId || '',
    reason: reason || '', by_user_id: byUserId || ''
  });
}

/** ตัดสต็อกสินค้าเดียว คืน product ที่อัปเดตแล้ว — เรียกเฉพาะภายใน LockService ของผู้เรียก */
function deductStock_(productId, qty, refType, refId, byUserId) {
  var p = findOne('Products', function (r) { return r.product_id === productId; }, true);
  if (!p) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบสินค้า: ' + productId, 'product_id');
  if (!boolFrom(p.track_stock)) return p;
  var before = numFrom(p.stock_qty);
  if (before < qty) {
    throw new ApiError('E_STOCK_INSUFFICIENT', 'สินค้า "' + p.name + '" คงเหลือไม่พอ (เหลือ ' + before + ')', 'product_id');
  }
  var after = before - qty;
  var updated = updateRowAt('Products', p.__row, { stock_qty: after });
  writeStockMovement_(productId, p.sku, 'out', -qty, before, after, refType, refId, '', byUserId);
  return updated;
}

/** คืนสต็อก (ยกเลิกออเดอร์) */
function restoreStock_(productId, qty, refType, refId, byUserId) {
  var p = findOne('Products', function (r) { return r.product_id === productId; }, true);
  if (!p || !boolFrom(p.track_stock)) return;
  var before = numFrom(p.stock_qty);
  var after = before + qty;
  updateRowAt('Products', p.__row, { stock_qty: after });
  writeStockMovement_(productId, p.sku, 'return', qty, before, after, refType, refId, 'คืนสต็อกจากการยกเลิก/ปฏิเสธออเดอร์', byUserId);
}

/** ===================== Admin: Stock ===================== */
function adminStockList(payload, token) {
  requireRole(token, ['manager', 'admin', 'staff']);
  var products = findAll('Products', function (p) { return boolFrom(p.track_stock); });
  var rows = products.map(function (p) {
    var qty = numFrom(p.stock_qty);
    var reorder = numFrom(p.reorder_point);
    var level = qty <= 0 ? 'out' : (qty <= reorder ? 'low' : 'ok');
    return {
      product_id: p.product_id, sku: p.sku, name: p.name, stock_qty: qty, reorder_point: reorder,
      unit: p.unit, cost_price: numFrom(p.cost_price), stock_value: round2(qty * numFrom(p.cost_price)), level: level,
      is_active: boolFrom(p.is_active)
    };
  }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  return ok(rows);
}

function adminStockAdjust(payload, token) {
  var auth = requireRole(token, ['manager', 'admin', 'staff']);
  requireFields(payload, ['product_id', 'type', 'qty']);
  if (['in', 'adjust', 'waste'].indexOf(payload.type) === -1) {
    throw new ApiError('E_INVALID_PAYLOAD', 'ประเภทต้องเป็น in / adjust / waste', 'type');
  }
  if ((payload.type === 'adjust' || payload.type === 'waste') && !payload.reason) {
    throw new ApiError('E_INVALID_PAYLOAD', 'กรุณาระบุเหตุผล', 'reason');
  }
  var p = findOne('Products', function (r) { return r.product_id === payload.product_id; }, true);
  if (!p) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบสินค้า', 'product_id');

  var before = numFrom(p.stock_qty);
  var qtyInput = numFrom(payload.qty);
  var after, change;
  if (payload.type === 'in') {
    change = Math.abs(qtyInput); after = before + change;
    if (payload.cost_price !== undefined) {
      updateRowAt('Products', p.__row, { cost_price: numFrom(payload.cost_price) });
    }
  } else if (payload.type === 'waste') {
    change = -Math.abs(qtyInput); after = before + change;
    if (after < 0) throw new ApiError('E_INVALID_PAYLOAD', 'จำนวนของเสียมากกว่าสต็อกคงเหลือ', 'qty');
  } else { // adjust: qty คือยอดนับจริงใหม่ทั้งหมด
    after = qtyInput; change = after - before;
  }

  updateRowAt('Products', p.__row, { stock_qty: after });
  writeStockMovement_(p.product_id, p.sku, payload.type, change, before, after, 'manual', payload.ref_id || '',
    (payload.reason || '') + (payload.supplier ? (' | ซัพพลายเออร์: ' + payload.supplier) : ''), auth.user.user_id);
  writeAudit(auth.user.user_id, auth.user.role, 'stock_' + payload.type, 'Product', p.product_id, { stock_qty: before }, { stock_qty: after });
  return ok({ product_id: p.product_id, stock_qty: after }, 'บันทึกการเคลื่อนไหวสต็อกแล้ว');
}

function adminStockImportCsv(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['rows']); // rows: [{sku, qty, cost_price, reason}]
  var results = [];
  payload.rows.forEach(function (row) {
    var p = findOne('Products', function (r) { return r.sku === row.sku; }, true);
    if (!p) { results.push({ sku: row.sku, ok: false, message: 'ไม่พบ SKU' }); return; }
    var before = numFrom(p.stock_qty);
    var change = Math.abs(numFrom(row.qty));
    var after = before + change;
    updateRowAt('Products', p.__row, { stock_qty: after, cost_price: row.cost_price !== undefined ? numFrom(row.cost_price) : p.cost_price });
    writeStockMovement_(p.product_id, p.sku, 'in', change, before, after, 'purchase', '', row.reason || 'นำเข้าจาก CSV', auth.user.user_id);
    results.push({ sku: row.sku, ok: true, stock_qty: after });
  });
  return ok(results, 'นำเข้าสต็อกแล้ว');
}

function adminStockMovements(payload, token) {
  requireRole(token, ['manager', 'admin', 'staff']);
  payload = payload || {};
  var rows = findAll('StockMovements', function (m) {
    if (payload.product_id && m.product_id !== payload.product_id) return false;
    if (payload.type && m.type !== payload.type) return false;
    if (payload.date_from && toDate(m.created_at) < toDate(payload.date_from)) return false;
    if (payload.date_to && toDate(m.created_at) > toDate(payload.date_to)) return false;
    return true;
  }, true).sort(function (a, b) { return toDate(b.created_at) - toDate(a.created_at); });
  var page = numFrom(payload.page, 1), pageSize = numFrom(payload.page_size, 50);
  var start = (page - 1) * pageSize;
  return ok({ total: rows.length, page: page, page_size: pageSize, items: rows.slice(start, start + pageSize) });
}
