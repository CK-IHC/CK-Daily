/**
 * ReportService.gs — admin.dashboard + admin.reports.* (manager/admin เท่านั้น)
 */

function dateRangeFromPayload_(payload) {
  payload = payload || {};
  var to = payload.date_to ? toDate(payload.date_to) : new Date();
  var from = payload.date_from ? toDate(payload.date_from) : addDays(to, -6);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { from: from, to: to };
}

function ordersInRange_(from, to, onlyCompleted, roundId) {
  return findAll('Orders', function (o) {
    var d = toDate(o.placed_at);
    if (!d || d < from || d > to) return false;
    if (roundId && o.round_id !== roundId) return false;
    if (onlyCompleted) return o.status === 'completed';
    return true;
  });
}

function cogsForOrder_(orderId, productCostMap) {
  var items = findAll('OrderItems', function (i) { return i.order_id === orderId; });
  return items.reduce(function (sum, i) {
    var cost = productCostMap[i.product_id] || 0;
    return sum + cost * numFrom(i.qty);
  }, 0);
}

function buildProductCostMap_() {
  var map = {};
  findAll('Products', null, true).forEach(function (p) { map[p.product_id] = numFrom(p.cost_price); });
  return map;
}

/** ===================== admin.dashboard ===================== */
function adminDashboard(payload, token) {
  requireRole(token, ['manager', 'admin']);
  var todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  var todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  var todayOrders = ordersInRange_(todayStart, todayEnd, false);
  var todayCompleted = todayOrders.filter(function (o) { return o.status === 'completed'; });
  var salesToday = round2(todayCompleted.reduce(function (s, o) { return s + numFrom(o.grand_total); }, 0));
  var orderCountToday = todayOrders.filter(function (o) { return o.status !== 'cancelled'; }).length;
  var aov = orderCountToday > 0 ? round2(salesToday / Math.max(1, todayCompleted.length)) : 0;

  var costMap = buildProductCostMap_();
  var cogsToday = todayCompleted.reduce(function (s, o) { return s + cogsForOrder_(o.order_id, costMap); }, 0);
  var grossProfitToday = round2(salesToday - cogsToday);

  var usersCreatedToday = countRows('Users', function (u) {
    var d = toDate(u.created_at); return d && d >= todayStart && d <= todayEnd;
  });

  var actionNeeded = findAll('Orders', function (o) { return ['pending', 'in_progress'].indexOf(o.status) > -1; }).length;
  var pendingSlips = findAll('Orders', function (o) { return o.payment_status === 'pending_verify'; }).length;

  var chart = [];
  for (var i = 29; i >= 0; i--) {
    var day = addDays(new Date(), -i);
    var from = new Date(day); from.setHours(0, 0, 0, 0);
    var to = new Date(day); to.setHours(23, 59, 59, 999);
    var completed = ordersInRange_(from, to, true);
    chart.push({
      date: Utilities.formatDate(day, TIMEZONE, 'yyyy-MM-dd'),
      sales: round2(completed.reduce(function (s, o) { return s + numFrom(o.grand_total); }, 0)),
      orders: completed.length
    });
  }

  return ok({
    sales_today: salesToday, orders_today: orderCountToday, aov_today: aov,
    new_customers_today: usersCreatedToday, gross_profit_today: grossProfitToday,
    orders_need_action: actionNeeded, pending_slips: pendingSlips,
    chart_30d: chart, chart_7d: chart.slice(23)
  });
}

/**
 * ===================== admin.liveDashboard =====================
 * แดชบอร์ดสรุปยอดขาย real-time สำหรับผู้บริหาร (หน้า "Live Dashboard" ในแอดมิน)
 * ดึงจาก Orders/OrderItems/StockMovements ตรงๆ ทุกครั้งที่เรียก (ไม่ cache) เพื่อให้เห็นข้อมูลล่าสุดเสมอ
 * หน้าเว็บฝั่ง frontend เรียกซ้ำทุก 30 วินาทีเพื่อจำลอง real-time (ดู views/liveDashboard.js)
 */
function adminLiveDashboard(payload, token) {
  requireRole(token, ['manager', 'admin']);
  var todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  var todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  var todayOrders = ordersInRange_(todayStart, todayEnd, false).filter(function (o) { return o.status !== 'cancelled'; });
  var todayCompleted = todayOrders.filter(function (o) { return o.status === 'completed'; });
  var salesToday = round2(todayOrders.reduce(function (s, o) { return s + numFrom(o.grand_total); }, 0));
  var costMap = buildProductCostMap_();
  var cogsToday = todayOrders.reduce(function (s, o) { return s + cogsForOrder_(o.order_id, costMap); }, 0);

  var todayAgg = productSalesAgg_({ from: todayStart, to: todayEnd });
  var topToday = Object.keys(todayAgg).map(function (k) { todayAgg[k].revenue = round2(todayAgg[k].revenue); return todayAgg[k]; })
    .sort(function (a, b) { return b.revenue - a.revenue; }).slice(0, 8);

  var lowStock = findAll('Products', function (p) { return boolFrom(p.track_stock) && numFrom(p.stock_qty) <= numFrom(p.reorder_point); })
    .map(function (p) { return { product_id: p.product_id, sku: p.sku, name: p.name, stock_qty: numFrom(p.stock_qty), reorder_point: numFrom(p.reorder_point) }; })
    .sort(function (a, b) { return a.stock_qty - b.stock_qty; }).slice(0, 10);

  var recentOrders = findAll('Orders', null).sort(function (a, b) { return toDate(b.placed_at) - toDate(a.placed_at); }).slice(0, 15)
    .map(function (o) {
      return { order_id: o.order_id, order_no: o.order_no, customer_name: o.customer_name, grand_total: numFrom(o.grand_total), status: normalizeOrderStatus_(o.status), payment_status: o.payment_status, placed_at: o.placed_at };
    });

  var pendingSlips = findAll('Orders', function (o) { return o.payment_status === 'pending_verify'; });
  var unpaidOrders = findAll('Orders', function (o) { return o.payment_status === 'unpaid' && o.status !== 'cancelled'; });

  var recentMovements = findAll('StockMovements', null, true).sort(function (a, b) { return toDate(b.created_at) - toDate(a.created_at); }).slice(0, 10)
    .map(function (m) { return { sku: m.sku, product_id: m.product_id, type: m.type, qty_change: numFrom(m.qty_change), reason: m.reason, created_at: m.created_at }; });

  return ok({
    generated_at: fmtDateTime(new Date()),
    sales_today: salesToday, orders_today: todayOrders.length, completed_today: todayCompleted.length,
    gross_profit_today: round2(salesToday - cogsToday),
    aov_today: todayOrders.length ? round2(salesToday / todayOrders.length) : 0,
    pending_slips_count: pendingSlips.length,
    pending_slips_amount: round2(pendingSlips.reduce(function (s, o) { return s + numFrom(o.grand_total); }, 0)),
    unpaid_count: unpaidOrders.length,
    unpaid_amount: round2(unpaidOrders.reduce(function (s, o) { return s + numFrom(o.grand_total); }, 0)),
    top_products_today: topToday,
    low_stock_alerts: lowStock,
    recent_orders: recentOrders,
    recent_stock_movements: recentMovements
  });
}

/** ===================== ยอดขายตามช่วงเวลา ===================== */
function adminReportsSalesByTime(payload, token) {
  requireRole(token, ['manager', 'admin']);
  var range = dateRangeFromPayload_(payload);
  var roundId = (payload && payload.round_id) || '';
  var orders = ordersInRange_(range.from, range.to, true, roundId);
  var groupBy = (payload && payload.group_by) || 'day';
  var buckets = {};
  orders.forEach(function (o) {
    var d = toDate(o.placed_at);
    var key = groupBy === 'year' ? Utilities.formatDate(d, TIMEZONE, 'yyyy')
      : groupBy === 'month' ? Utilities.formatDate(d, TIMEZONE, 'yyyy-MM')
      : groupBy === 'week' ? Utilities.formatDate(d, TIMEZONE, "yyyy-'W'ww")
      : Utilities.formatDate(d, TIMEZONE, 'yyyy-MM-dd');
    if (!buckets[key]) buckets[key] = { period: key, sales: 0, orders: 0 };
    buckets[key].sales += numFrom(o.grand_total);
    buckets[key].orders += 1;
  });
  var series = Object.keys(buckets).sort().map(function (k) { buckets[k].sales = round2(buckets[k].sales); return buckets[k]; });

  var prevSpanMs = range.to - range.from;
  var prevFrom = new Date(range.from.getTime() - prevSpanMs - 1);
  var prevTo = new Date(range.from.getTime() - 1);
  var prevOrders = ordersInRange_(prevFrom, prevTo, true, roundId);
  var currentTotal = round2(orders.reduce(function (s, o) { return s + numFrom(o.grand_total); }, 0));
  var prevTotal = round2(prevOrders.reduce(function (s, o) { return s + numFrom(o.grand_total); }, 0));
  var changePct = prevTotal > 0 ? round2(((currentTotal - prevTotal) / prevTotal) * 100) : null;

  return ok({ series: series, total_sales: currentTotal, total_orders: orders.length, prev_period_sales: prevTotal, change_pct: changePct });
}

/** ===================== สินค้าขายดี / ขายไม่ออก ===================== */
function productSalesAgg_(range) {
  var orders = ordersInRange_(range.from, range.to, true);
  var orderIds = {}; orders.forEach(function (o) { orderIds[o.order_id] = true; });
  var items = findAll('OrderItems', function (i) { return orderIds[i.order_id]; });
  var agg = {};
  items.forEach(function (i) {
    if (!agg[i.product_id]) agg[i.product_id] = { product_id: i.product_id, product_name: i.product_name, qty: 0, revenue: 0 };
    agg[i.product_id].qty += numFrom(i.qty);
    agg[i.product_id].revenue += numFrom(i.line_total);
  });
  return agg;
}

function adminReportsTopProducts(payload, token) {
  requireRole(token, ['manager', 'admin']);
  var range = dateRangeFromPayload_(payload);
  var agg = productSalesAgg_(range);
  var list = Object.keys(agg).map(function (k) { agg[k].revenue = round2(agg[k].revenue); return agg[k]; });
  var limit = numFrom(payload && payload.limit, 10);
  return ok({
    by_qty: list.slice().sort(function (a, b) { return b.qty - a.qty; }).slice(0, limit),
    by_revenue: list.slice().sort(function (a, b) { return b.revenue - a.revenue; }).slice(0, limit)
  });
}

function adminReportsBottomProducts(payload, token) {
  requireRole(token, ['manager', 'admin']);
  var range = dateRangeFromPayload_(payload);
  var agg = productSalesAgg_(range);
  var soldIds = {}; Object.keys(agg).forEach(function (k) { soldIds[k] = true; });
  var allProducts = findAll('Products', function (p) { return boolFrom(p.is_active); });
  var noSales = allProducts.filter(function (p) { return !soldIds[p.product_id]; })
    .map(function (p) { return { product_id: p.product_id, product_name: p.name, qty: 0, revenue: 0 }; });
  var list = Object.keys(agg).map(function (k) { agg[k].revenue = round2(agg[k].revenue); return agg[k]; })
    .sort(function (a, b) { return a.qty - b.qty; });
  var limit = numFrom(payload && payload.limit, 10);
  return ok({ bottom_selling: list.slice(0, limit), no_sales_in_range: noSales });
}

/** ===================== ยอดขายตามรอบ ===================== */
function adminReportsSalesByRound(payload, token) {
  requireRole(token, ['manager', 'admin']);
  var range = dateRangeFromPayload_(payload);
  var rounds = findAll('Rounds', function (r) { return toDate(r.open_at) >= range.from && toDate(r.open_at) <= range.to; });
  var result = rounds.map(function (r) {
    var orders = findAll('Orders', function (o) { return o.round_id === r.round_id && o.status !== 'cancelled'; });
    return {
      round_id: r.round_id, round_name: r.round_name, status: r.status,
      orders: orders.length, sales: round2(orders.reduce(function (s, o) { return s + numFrom(o.grand_total); }, 0))
    };
  }).sort(function (a, b) { return b.sales - a.sales; });
  return ok(result);
}

/** ===================== กำไร-ขาดทุน ===================== */
function adminReportsProfitLoss(payload, token) {
  requireRole(token, ['manager', 'admin']);
  var range = dateRangeFromPayload_(payload);
  var orders = ordersInRange_(range.from, range.to, true);
  var costMap = buildProductCostMap_();
  var orderIds = {}; orders.forEach(function (o) { orderIds[o.order_id] = true; });
  var items = findAll('OrderItems', function (i) { return orderIds[i.order_id]; });

  var byProduct = {};
  items.forEach(function (i) {
    if (!byProduct[i.product_id]) byProduct[i.product_id] = { product_id: i.product_id, product_name: i.product_name, revenue: 0, cogs: 0 };
    byProduct[i.product_id].revenue += numFrom(i.line_total);
    byProduct[i.product_id].cogs += (costMap[i.product_id] || 0) * numFrom(i.qty);
  });
  var breakdown = Object.keys(byProduct).map(function (k) {
    var r = byProduct[k];
    r.revenue = round2(r.revenue); r.cogs = round2(r.cogs); r.gross_profit = round2(r.revenue - r.cogs);
    r.margin_pct = r.revenue > 0 ? round2((r.gross_profit / r.revenue) * 100) : 0;
    return r;
  }).sort(function (a, b) { return b.gross_profit - a.gross_profit; });

  var revenue = round2(orders.reduce(function (s, o) { return s + numFrom(o.grand_total); }, 0));
  var cogs = round2(breakdown.reduce(function (s, r) { return s + r.cogs; }, 0));
  return ok({ revenue: revenue, cogs: cogs, gross_profit: round2(revenue - cogs), by_product: breakdown });
}

/** ===================== รายงานสต็อก ===================== */
function adminReportsStock(payload, token) {
  requireRole(token, ['manager', 'admin']);
  var products = findAll('Products', function (p) { return boolFrom(p.track_stock); });
  var totalValue = 0;
  var lowStock = [];
  var rows = products.map(function (p) {
    var qty = numFrom(p.stock_qty), reorder = numFrom(p.reorder_point), value = round2(qty * numFrom(p.cost_price));
    totalValue += value;
    var level = qty <= 0 ? 'out' : (qty <= reorder ? 'low' : 'ok');
    if (level !== 'ok') lowStock.push({ product_id: p.product_id, name: p.name, stock_qty: qty, reorder_point: reorder });
    var last30 = addDays(new Date(), -30);
    var soldQty = findAll('OrderItems', function (i) {
      if (i.product_id !== p.product_id) return false;
      var ord = findOne('Orders', function (o) { return o.order_id === i.order_id; });
      return ord && ord.status === 'completed' && toDate(ord.placed_at) >= last30;
    }).reduce(function (s, i) { return s + numFrom(i.qty); }, 0);
    var turnoverRate = qty > 0 ? round2(soldQty / qty) : (soldQty > 0 ? soldQty : 0);
    return { product_id: p.product_id, name: p.name, stock_qty: qty, reorder_point: reorder, stock_value: value, level: level, sold_last_30d: soldQty, turnover_rate: turnoverRate };
  });
  return ok({ total_stock_value: round2(totalValue), low_stock_items: lowStock, items: rows });
}

/** ===================== รายงานลูกค้า ===================== */
function adminReportsCustomers(payload, token) {
  requireRole(token, ['manager', 'admin']);
  var range = dateRangeFromPayload_(payload);
  var users = findAll('Users', function (u) { return u.role === 'customer'; });
  var newCustomers = users.filter(function (u) { var d = toDate(u.created_at); return d && d >= range.from && d <= range.to; }).length;

  var completedOrders = findAll('Orders', function (o) { return o.status === 'completed'; });
  var spendByUser = {};
  completedOrders.forEach(function (o) {
    if (!spendByUser[o.user_id]) spendByUser[o.user_id] = { user_id: o.user_id, phone: normalizePhone_(o.phone), name: o.customer_name, total_spend: 0, order_count: 0, last_order: o.placed_at };
    spendByUser[o.user_id].total_spend += numFrom(o.grand_total);
    spendByUser[o.user_id].order_count += 1;
    if (toDate(o.placed_at) > toDate(spendByUser[o.user_id].last_order)) spendByUser[o.user_id].last_order = o.placed_at;
  });
  var list = Object.keys(spendByUser).map(function (k) { spendByUser[k].total_spend = round2(spendByUser[k].total_spend); return spendByUser[k]; });
  var top10 = list.slice().sort(function (a, b) { return b.total_spend - a.total_spend; }).slice(0, 10);

  var cutoff = addDays(new Date(), -60);
  var churned = list.filter(function (c) { return toDate(c.last_order) < cutoff; });

  return ok({
    new_customers: newCustomers, returning_customers: users.length - newCustomers,
    top_customers: top10, churned_customers_60d: churned,
    avg_order_frequency: list.length ? round2(completedOrders.length / list.length) : 0
  });
}

/** ===================== รายงานการชำระเงิน ===================== */
function adminReportsPayments(payload, token) {
  requireRole(token, ['manager', 'admin']);
  var range = dateRangeFromPayload_(payload);
  var orders = ordersInRange_(range.from, range.to, false).filter(function (o) { return o.status !== 'cancelled'; });
  var byMethod = {};
  orders.forEach(function (o) {
    if (!byMethod[o.payment_method]) byMethod[o.payment_method] = { method: o.payment_method, count: 0, total: 0 };
    byMethod[o.payment_method].count += 1;
    byMethod[o.payment_method].total += numFrom(o.grand_total);
  });
  Object.keys(byMethod).forEach(function (k) { byMethod[k].total = round2(byMethod[k].total); });
  var pendingSlips = orders.filter(function (o) { return o.payment_status === 'pending_verify'; });
  var unpaid = orders.filter(function (o) { return o.payment_status === 'unpaid'; });
  return ok({
    by_method: Object.keys(byMethod).map(function (k) { return byMethod[k]; }),
    pending_slips_count: pendingSlips.length,
    pending_slips_amount: round2(pendingSlips.reduce(function (s, o) { return s + numFrom(o.grand_total); }, 0)),
    unpaid_amount: round2(unpaid.reduce(function (s, o) { return s + numFrom(o.grand_total); }, 0))
  });
}

/** ===================== รายงานยกเลิก ===================== */
function adminReportsCancellations(payload, token) {
  requireRole(token, ['manager', 'admin']);
  var range = dateRangeFromPayload_(payload);
  var allOrders = ordersInRange_(range.from, range.to, false);
  var cancelled = allOrders.filter(function (o) { return o.status === 'cancelled'; });
  var reasonCounts = {};
  cancelled.forEach(function (o) {
    var r = o.cancel_reason || 'ไม่ระบุเหตุผล';
    reasonCounts[r] = (reasonCounts[r] || 0) + 1;
  });
  var topReasons = Object.keys(reasonCounts).map(function (r) { return { reason: r, count: reasonCounts[r] }; })
    .sort(function (a, b) { return b.count - a.count; });
  return ok({
    total_orders: allOrders.length, cancelled_orders: cancelled.length,
    cancellation_rate_pct: allOrders.length ? round2((cancelled.length / allOrders.length) * 100) : 0,
    top_reasons: topReasons
  });
}
