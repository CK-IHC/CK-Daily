/**
 * views/reports.js — รายงานทั้งหมด (§8): ตัวกรองช่วงวันที่ร่วม + Export CSV + พิมพ์ + กราฟ
 */
var REPORT_TABS_ = [
  { key: 'sales', label: 'ยอดขายตามช่วงเวลา' }, { key: 'top', label: 'จัดอันดับสินค้าขายดี/ขายไม่ออก' },
  { key: 'rounds', label: 'ยอดขายตามรอบ' }, { key: 'profit', label: 'กำไร-ขาดทุน' },
  { key: 'stock', label: 'รายงานสต็อก' }, { key: 'customers', label: 'รายงานลูกค้า' },
  { key: 'payments', label: 'รายงานการชำระเงิน' }, { key: 'cancellations', label: 'รายงานยกเลิก' }
];

Views.reports = function (container) {
  var tab = 'sales';
  var today = new Date().toISOString().slice(0, 10);
  var monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  container.innerHTML =
    '<div class="card no-print"><div class="filters-row">' +
      '<label style="font-size:12px;color:var(--text-muted)">จาก <input id="dateFrom" type="date" class="form-control" value="' + monthAgo + '"></label>' +
      '<label style="font-size:12px;color:var(--text-muted)">ถึง <input id="dateTo" type="date" class="form-control" value="' + today + '"></label>' +
      '<button id="btnApply" class="btn btn-outline">ใช้ตัวกรอง</button>' +
      '<button id="btnPrint" class="btn btn-outline">🖨️ พิมพ์</button>' +
      '<button id="btnGenSheets" class="btn btn-outline" title="สร้าง/รีเฟรชชีต Report_Orders, Report_OrderItems, Report_StockMovements ใน Google Sheets ให้ข้อมูลล่าสุด เปิดดูตรงใน Sheets ได้เลย">📄 สร้าง Report Sheets</button>' +
    '</div>' +
    '<div class="tabs-row">' + REPORT_TABS_.map(function (t) { return '<button class="tab-btn ' + (t.key === tab ? 'active' : '') + '" data-tab="' + t.key + '">' + t.label + '</button>'; }).join('') + '</div></div>' +
    '<div id="reportArea">' + UI.loading() + '</div>';

  document.getElementById('btnApply').onclick = renderTab;
  document.getElementById('btnPrint').onclick = function () {
    var current = REPORT_TABS_.filter(function (t) { return t.key === tab; })[0];
    UI.printWithHeader(current ? current.label : 'รายงาน', document.getElementById('reportArea'));
  };
  document.getElementById('btnGenSheets').onclick = function () {
    var btn = document.getElementById('btnGenSheets');
    btn.disabled = true; btn.textContent = 'กำลังสร้าง...';
    Api.call('admin.reports.generateSheets').then(function (r) {
      btn.disabled = false; btn.textContent = '📄 สร้าง Report Sheets';
      UI.toast('สร้าง Report Sheets แล้ว: ออเดอร์ ' + r.orders + ', รายการสินค้า ' + r.order_items + ', การเคลื่อนไหวสต็อก ' + r.stock_movements + ' แถว', 'success');
    }).catch(function (err) {
      btn.disabled = false; btn.textContent = '📄 สร้าง Report Sheets';
      UI.toast(err.message, 'error');
    });
  };
  container.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.onclick = function () {
      container.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active'); tab = btn.dataset.tab; renderTab();
    };
  });

  function range() { return { date_from: document.getElementById('dateFrom').value, date_to: document.getElementById('dateTo').value }; }

  function renderTab() {
    var area = document.getElementById('reportArea');
    area.innerHTML = UI.loading();
    var r = range();
    if (tab === 'sales') return loadSales(r, area);
    if (tab === 'top') return loadTopBottom(r, area);
    if (tab === 'rounds') return loadRounds(r, area);
    if (tab === 'profit') return loadProfit(r, area);
    if (tab === 'stock') return loadStock(area);
    if (tab === 'customers') return loadCustomers(r, area);
    if (tab === 'payments') return loadPayments(r, area);
    if (tab === 'cancellations') return loadCancellations(r, area);
  }

  function loadSales(r, area) {
    Api.call('admin.reports.salesByTime', r).then(function (d) {
      area.innerHTML = '<div class="card"><div class="card-head"><h3>ยอดขายตามช่วงเวลา</h3><button class="btn btn-sm btn-outline no-print" id="exp">Export CSV</button></div>' +
        '<div class="kpi-grid"><div class="kpi-card"><div class="label">ยอดขายรวม</div><div class="value">' + UI.money(d.total_sales) + '</div></div>' +
        '<div class="kpi-card"><div class="label">จำนวนออเดอร์</div><div class="value">' + d.total_orders + '</div></div>' +
        '<div class="kpi-card"><div class="label">เทียบช่วงก่อนหน้า</div><div class="value">' + (d.change_pct === null ? '-' : (d.change_pct > 0 ? '+' : '') + d.change_pct + '%') + '</div></div></div>' +
        '<canvas id="salesLineChart" height="90"></canvas></div>';
      Charts.line('salesLineChart', d.series.map(function (s) { return s.period; }), [{ label: 'ยอดขาย', data: d.series.map(function (s) { return s.sales; }) }]);
      document.getElementById('exp').onclick = function () { UI.exportCsv('sales-by-time.csv', d.series); };
    });
  }

  var RANK_MEDAL_ = { 1: '🥇', 2: '🥈', 3: '🥉' };
  function rankTable_(rows, valueKey, valueLabel) {
    if (!rows || !rows.length) return '<div class="empty-state">ไม่มีข้อมูล</div>';
    return '<div class="table-wrap"><table><thead><tr><th>อันดับ</th><th>สินค้า</th><th style="text-align:right">' + valueLabel + '</th></tr></thead><tbody>' +
      rows.map(function (p, i) {
        var rank = i + 1;
        return '<tr' + (rank <= 3 ? ' style="font-weight:700;background:#fff7ed"' : '') + '><td>' + (RANK_MEDAL_[rank] || ('#' + rank)) + '</td>' +
          '<td>' + UI.escapeHtml(p.product_name) + '</td><td style="text-align:right">' + (valueKey === 'revenue' ? UI.money(p[valueKey]) : p[valueKey]) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function loadTopBottom(r, area) {
    Promise.all([Api.call('admin.reports.topProducts', r), Api.call('admin.reports.bottomProducts', r)]).then(function (res) {
      var top = res[0], bottom = res[1];
      area.innerHTML =
        '<div class="card"><div class="card-head"><h3>🏆 จัดอันดับสินค้าขายดี (ตามจำนวนที่ขาย)</h3><button class="btn btn-sm btn-outline no-print" id="expTopQty">Export CSV</button></div>' +
          '<canvas id="topQtyChart" height="100"></canvas>' + rankTable_(top.by_qty, 'qty', 'จำนวนที่ขาย') + '</div>' +
        '<div class="card"><div class="card-head"><h3>🏆 จัดอันดับสินค้าขายดี (ตามรายได้)</h3><button class="btn btn-sm btn-outline no-print" id="expTopRev">Export CSV</button></div>' +
          '<canvas id="topRevChart" height="100"></canvas>' + rankTable_(top.by_revenue, 'revenue', 'รายได้') + '</div>' +
        '<div class="card"><h3>สินค้าขายไม่ออก (ต่ำสุดในช่วงที่เลือก)</h3>' + table(bottom.bottom_selling, ['product_name', 'qty', 'revenue']) + '</div>' +
        '<div class="card"><h3>ไม่มียอดขายเลยในช่วงที่เลือก</h3>' + table(bottom.no_sales_in_range, ['product_name']) + '</div>';
      Charts.bar('topQtyChart', top.by_qty.map(function (p) { return p.product_name; }), [{ label: 'จำนวน', data: top.by_qty.map(function (p) { return p.qty; }) }], true);
      Charts.bar('topRevChart', top.by_revenue.map(function (p) { return p.product_name; }), [{ label: 'รายได้', data: top.by_revenue.map(function (p) { return p.revenue; }) }], true);
      document.getElementById('expTopQty').onclick = function () { UI.exportCsv('top-products-by-qty.csv', top.by_qty.map(function (p, i) { return { rank: i + 1, product_name: p.product_name, qty: p.qty }; })); };
      document.getElementById('expTopRev').onclick = function () { UI.exportCsv('top-products-by-revenue.csv', top.by_revenue.map(function (p, i) { return { rank: i + 1, product_name: p.product_name, revenue: p.revenue }; })); };
    });
  }

  function loadRounds(r, area) {
    Api.call('admin.reports.salesByRound', r).then(function (rows) {
      area.innerHTML = '<div class="card"><div class="card-head"><h3>ยอดขายตามรอบ</h3><button class="btn btn-sm btn-outline no-print" id="exp">Export CSV</button></div>' +
        '<canvas id="roundChart" height="90"></canvas>' + table(rows, ['round_name', 'status', 'orders', 'sales']) + '</div>';
      Charts.bar('roundChart', rows.map(function (x) { return x.round_name; }), [{ label: 'ยอดขาย', data: rows.map(function (x) { return x.sales; }) }]);
      document.getElementById('exp').onclick = function () { UI.exportCsv('sales-by-round.csv', rows); };
    });
  }

  function loadProfit(r, area) {
    Api.call('admin.reports.profitLoss', r).then(function (d) {
      area.innerHTML = '<div class="card"><div class="card-head"><h3>กำไร-ขาดทุน</h3><button class="btn btn-sm btn-outline no-print" id="exp">Export CSV</button></div>' +
        '<div class="kpi-grid"><div class="kpi-card"><div class="label">รายได้</div><div class="value">' + UI.money(d.revenue) + '</div></div>' +
        '<div class="kpi-card"><div class="label">ต้นทุนขาย (COGS)</div><div class="value">' + UI.money(d.cogs) + '</div></div>' +
        '<div class="kpi-card"><div class="label">กำไรขั้นต้น</div><div class="value">' + UI.money(d.gross_profit) + '</div></div></div>' +
        table(d.by_product, ['product_name', 'revenue', 'cogs', 'gross_profit', 'margin_pct']) + '</div>';
      document.getElementById('exp').onclick = function () { UI.exportCsv('profit-loss.csv', d.by_product); };
    });
  }

  function loadStock(area) {
    Api.call('admin.reports.stock').then(function (d) {
      area.innerHTML = '<div class="card"><div class="card-head"><h3>รายงานสต็อก</h3><button class="btn btn-sm btn-outline no-print" id="exp">Export CSV</button></div>' +
        '<div class="kpi-grid"><div class="kpi-card"><div class="label">มูลค่าคงคลังรวม</div><div class="value">' + UI.money(d.total_stock_value) + '</div></div>' +
        '<div class="kpi-card"><div class="label">สินค้าใกล้หมด/หมด</div><div class="value">' + d.low_stock_items.length + '</div></div></div>' +
        table(d.items, ['name', 'stock_qty', 'reorder_point', 'stock_value', 'level', 'sold_last_30d', 'turnover_rate']) + '</div>';
      document.getElementById('exp').onclick = function () { UI.exportCsv('stock-report.csv', d.items); };
    });
  }

  function loadCustomers(r, area) {
    Api.call('admin.reports.customers', r).then(function (d) {
      area.innerHTML = '<div class="card"><div class="kpi-grid"><div class="kpi-card"><div class="label">ลูกค้าใหม่</div><div class="value">' + d.new_customers + '</div></div>' +
        '<div class="kpi-card"><div class="label">ลูกค้าเก่า</div><div class="value">' + d.returning_customers + '</div></div>' +
        '<div class="kpi-card"><div class="label">ความถี่การซื้อเฉลี่ย</div><div class="value">' + d.avg_order_frequency + '</div></div></div></div>' +
        '<div class="card"><h3>Top 10 ลูกค้าตามยอดซื้อ</h3>' + table(d.top_customers, ['name', 'phone', 'total_spend', 'order_count']) + '</div>' +
        '<div class="card"><h3>ลูกค้าที่หายไป (&gt;60 วัน)</h3>' + table(d.churned_customers_60d, ['name', 'phone', 'last_order']) + '</div>';
    });
  }

  function loadPayments(r, area) {
    Api.call('admin.reports.payments', r).then(function (d) {
      area.innerHTML = '<div class="card"><h3>รายงานการชำระเงิน</h3><canvas id="payChart" height="90"></canvas>' +
        table(d.by_method, ['method', 'count', 'total']) +
        '<div class="kpi-grid" style="margin-top:14px"><div class="kpi-card"><div class="label">สลิปรอตรวจสอบ</div><div class="value">' + d.pending_slips_count + '</div><div class="sub">' + UI.money(d.pending_slips_amount) + '</div></div>' +
        '<div class="kpi-card"><div class="label">ยอดค้างชำระ</div><div class="value">' + UI.money(d.unpaid_amount) + '</div></div></div></div>';
      Charts.doughnut('payChart', d.by_method.map(function (m) { return m.method; }), d.by_method.map(function (m) { return m.total; }));
    });
  }

  function loadCancellations(r, area) {
    Api.call('admin.reports.cancellations', r).then(function (d) {
      area.innerHTML = '<div class="card"><div class="kpi-grid"><div class="kpi-card"><div class="label">อัตราการยกเลิก</div><div class="value">' + d.cancellation_rate_pct + '%</div><div class="sub">' + d.cancelled_orders + '/' + d.total_orders + ' ออเดอร์</div></div></div>' +
        '<h3>เหตุผลยอดนิยม</h3>' + table(d.top_reasons, ['reason', 'count']) + '</div>';
    });
  }

  function table(rows, cols) {
    if (!rows || !rows.length) return '<div class="empty-state">ไม่มีข้อมูล</div>';
    return '<div class="table-wrap"><table><thead><tr>' + cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (row) { return '<tr>' + cols.map(function (c) { return '<td>' + UI.escapeHtml(row[c]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }

  renderTab();
};
