/**
 * views/dashboard.js — KPI สรุป + กราฟยอดขาย (วัน/เดือน/ปี) + กราฟรายสินค้า + ยอดขายรายรอบ + ออเดอร์ที่ต้องจัดการ
 * รีเฟรชข้อมูลอัตโนมัติทุก 30 วินาที (ไม่รื้อ DOM ทั้งหน้า กันตัวกรองที่เลือกไว้รีเซ็ต) ให้ความรู้สึกเป็น live dashboard
 */
var DASHBOARD_REFRESH_MS_ = 30000;

function dashboardQuickActions_() {
  var buttons = [];
  if (State.can('orders:view')) buttons.push('<a href="#/orders" class="btn btn-primary">🧾 จัดการออเดอร์</a>');
  if (State.can('stock:manage')) buttons.push('<a href="#/stock" class="btn btn-outline">📥 จัดการสต็อก</a>');
  if (State.can('kanban:view')) buttons.push('<a href="#/kanban" class="btn btn-outline">📋 Kanban</a>');
  if (!buttons.length) return '';
  return '<div class="card no-print" style="display:flex;gap:10px;flex-wrap:wrap">' + buttons.join('') + '</div>';
}

function renderOrdersTable_(items) {
  var html = '<div class="table-wrap"><table><thead><tr><th>เลขที่</th><th>ลูกค้า</th><th>ยอด</th><th>สถานะ</th><th>เวลา</th><th class="no-print"></th></tr></thead><tbody>' +
    items.map(function (o) {
      return '<tr><td>#' + o.order_no + '</td><td>' + UI.escapeHtml(o.customer_name) + '</td><td>' + UI.money(o.grand_total) + '</td><td><span class="chip ' + o.status + '">' + UI.statusLabel(o.status) + '</span></td><td>' + UI.fmtTime(o.placed_at) + '</td>' +
        '<td class="no-print"><button class="btn btn-outline btn-sm" data-order-id="' + o.order_id + '">จัดการ</button></td></tr>';
    }).join('') +
    '</tbody></table></div>';
  return html;
}

/** ผูกปุ่ม "จัดการ" ในตารางออเดอร์ของ dashboard ให้เปิด modal รายละเอียด/แก้ไขสถานะได้ (เดิมกดไม่ได้อะไรเลย) */
function bindOrdersTableActions_(container, onChange) {
  container.querySelectorAll('[data-order-id]').forEach(function (btn) {
    btn.onclick = function () { openOrderDetailModal(btn.getAttribute('data-order-id'), onChange); };
  });
}

Views.dashboard = function (container) {
  container.innerHTML = UI.loading();
  var canView = State.can('dashboard:view');
  var groupBy = 'day';
  var selectedYear = new Date().getFullYear();
  var YEAR_OPTIONS_ = [0, 1, 2, 3, 4].map(function (i) { return selectedYear - i; });
  var refreshTimer = null;

  if (!canView) {
    Api.call('admin.orders.list', { status: 'pending', page_size: 10 }).then(function (data) {
      container.innerHTML = dashboardQuickActions_() +
        '<div class="card"><div class="card-head"><h3>ออเดอร์รอดำเนินการ (' + data.total + ')</h3><button class="btn btn-outline btn-sm no-print" id="btnPrintPending">🖨️ พิมพ์</button></div>' + renderOrdersTable_(data.items) + '</div>';
      var btn = document.getElementById('btnPrintPending');
      if (btn) btn.onclick = function () { UI.printWithHeader('ออเดอร์รอดำเนินการ', btn.closest('.card')); };
      bindOrdersTableActions_(container, function () { Views.dashboard(container); });
    }).catch(function (err) { container.innerHTML = '<div class="empty-state">' + UI.escapeHtml(err.message) + '</div>'; });
    return;
  }

  function kpi(label, value, sub) {
    return '<div class="kpi-card"><div class="label">' + label + '</div><div class="value">' + value + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
  }

  function kpiGridHtml_(d) {
    return kpi('ยอดขายวันนี้', UI.money(d.sales_today), '') +
      kpi('จำนวนออเดอร์วันนี้', d.orders_today, '') +
      kpi('ยอดเฉลี่ยต่อบิล (AOV)', UI.money(d.aov_today), '') +
      kpi('ลูกค้าใหม่วันนี้', d.new_customers_today, '') +
      kpi('กำไรขั้นต้นวันนี้', UI.money(d.gross_profit_today), '') +
      kpi('ต้องดำเนินการ', d.orders_need_action, d.pending_slips + ' สลิปรอตรวจ');
  }

  function touchLiveDot_() {
    var dot = document.getElementById('liveDot');
    if (!dot) return;
    dot.style.opacity = '1';
    setTimeout(function () { if (dot) dot.style.opacity = '.35'; }, 600);
    var t = document.getElementById('liveUpdatedAt');
    if (t) t.textContent = 'อัปเดตล่าสุด ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  Api.call('admin.dashboard').then(function (d) {
    container.innerHTML =
      dashboardQuickActions_() +
      '<div class="card no-print" style="display:flex;align-items:center;gap:8px;padding:10px 16px;font-size:12px;color:var(--text-muted)">' +
        '<span id="liveDot" style="width:8px;height:8px;border-radius:50%;background:#16a34a;opacity:.35;transition:opacity .3s;flex:none"></span>' +
        '<span>สด (real-time) — รีเฟรชอัตโนมัติทุก 30 วินาที</span>' +
        '<span id="liveUpdatedAt" style="margin-left:auto"></span>' +
      '</div>' +
      '<div class="kpi-grid" id="kpiGrid">' + kpiGridHtml_(d) + '</div>' +
      '<div class="card"><div class="card-head"><h3>ยอดขายรวม</h3>' +
        '<div class="no-print"><select id="groupBySelect" class="form-control" style="width:auto;display:inline-block">' +
          '<option value="day">รายวัน (30 วันล่าสุด)</option><option value="week">รายสัปดาห์</option><option value="month">รายเดือน (Jan-Dec)</option><option value="year">รายปี</option>' +
        '</select> ' +
        '<select id="yearSelect" class="form-control" style="width:auto;display:inline-block">' +
          YEAR_OPTIONS_.map(function (y) { return '<option value="' + y + '"' + (y === selectedYear ? ' selected' : '') + '>ปี ' + y + '</option>'; }).join('') +
        '</select> <button id="btnPrintSales" class="btn btn-outline btn-sm">🖨️ พิมพ์</button></div></div>' +
        '<canvas id="salesChart" height="90"></canvas></div>' +
      '<div class="card"><h3 id="itemChartTitle">ยอดขายแยกรายสินค้า (Top 10) — ปี ' + selectedYear + '</h3><div id="itemChartArea"><canvas id="itemChart" height="100"></canvas></div></div>' +
      '<div class="card"><h3>ยอดขายแยกรายรอบ</h3><div id="roundSalesArea">' + UI.loading() + '</div></div>' +
      '<div class="card"><div class="card-head"><h3>ออเดอร์ที่ต้องดำเนินการ</h3><button class="btn btn-outline btn-sm no-print" id="btnPrintAction">🖨️ พิมพ์</button></div><div id="actionOrders">' + UI.loading() + '</div></div>';

    document.getElementById('btnPrintSales').onclick = function (e) { UI.printWithHeader('สรุปยอดขาย Dashboard', e.currentTarget.closest('.card')); };
    document.getElementById('btnPrintAction').onclick = function (e) { UI.printWithHeader('ออเดอร์ที่ต้องดำเนินการ', e.currentTarget.closest('.card')); };
    document.getElementById('groupBySelect').onchange = function (e) { groupBy = e.target.value; loadSalesChart(); };
    document.getElementById('yearSelect').onchange = function (e) { selectedYear = Number(e.target.value); loadSalesChart(); loadTopProducts(); };

    loadAll_();
    touchLiveDot_();
    refreshTimer = setInterval(function () { loadAll_(); touchLiveDot_(); }, DASHBOARD_REFRESH_MS_);

    function loadAll_() {
      Api.call('admin.dashboard').then(function (data) {
        var grid = document.getElementById('kpiGrid');
        if (grid) grid.innerHTML = kpiGridHtml_(data);
      }).catch(function () {});
      loadSalesChart();
      loadTopProducts();
      loadRoundSales();
      loadActionOrders();
    }

    function loadTopProducts() {
      var titleEl = document.getElementById('itemChartTitle');
      if (titleEl) titleEl.textContent = 'ยอดขายแยกรายสินค้า (Top 10) — ปี ' + selectedYear;
      Api.call('admin.reports.topProducts', { limit: 10, date_from: selectedYear + '-01-01', date_to: selectedYear + '-12-31' }).then(function (r) {
        var itemArea = document.getElementById('itemChartArea');
        if (!itemArea) return;
        if (!r.by_qty.length) { itemArea.innerHTML = '<div class="empty-state">ยังไม่มียอดขายในปี ' + selectedYear + '</div>'; return; }
        if (!document.getElementById('itemChart')) itemArea.innerHTML = '<canvas id="itemChart" height="100"></canvas>';
        Charts.bar('itemChart', r.by_qty.map(function (p) { return p.product_name; }), [{ label: 'จำนวนที่ขาย', data: r.by_qty.map(function (p) { return p.qty; }) }], true);
      }).catch(function (err) {
        var itemArea = document.getElementById('itemChartArea');
        if (itemArea) itemArea.innerHTML = '<div class="empty-state">โหลดกราฟไม่สำเร็จ: ' + UI.escapeHtml(err.message) + '</div>';
      });
    }

    function loadRoundSales() {
      Api.call('admin.reports.salesByRound', {}).then(function (rows) {
        var area = document.getElementById('roundSalesArea');
        if (!area) return;
        if (!rows.length) { area.innerHTML = '<div class="empty-state">ยังไม่มีข้อมูล</div>'; return; }
        area.innerHTML = '<div class="table-wrap"><table><thead><tr><th>รอบ</th><th>สถานะ</th><th>ออเดอร์</th><th>ยอดขาย</th></tr></thead><tbody>' +
          rows.map(function (r) { return '<tr><td>' + UI.escapeHtml(r.round_name) + '</td><td><span class="chip ' + r.status + '">' + r.status + '</span></td><td>' + r.orders + '</td><td>' + UI.money(r.sales) + '</td></tr>'; }).join('') +
          '</tbody></table></div>';
      }).catch(function () {});
    }

    function loadActionOrders() {
      Api.call('admin.orders.list', { page_size: 10 }).then(function (data) {
        var pending = data.items.filter(function (o) { return ['pending', 'in_progress'].indexOf(o.status) > -1; });
        var area = document.getElementById('actionOrders');
        if (!area) return;
        area.innerHTML = pending.length ? renderOrdersTable_(pending) : '<div class="empty-state">ไม่มีออเดอร์ที่ต้องดำเนินการ 🎉</div>';
        bindOrdersTableActions_(area, function () { Views.dashboard(container); });
      }).catch(function () {});
    }
  }).catch(function (err) { container.innerHTML = '<div class="empty-state">' + UI.escapeHtml(err.message) + '</div>'; });

  var MONTH_ABBR_ = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  function loadSalesChart() {
    var payload = { group_by: groupBy };
    if (groupBy === 'month') { payload.date_from = selectedYear + '-01-01'; payload.date_to = selectedYear + '-12-31'; }
    if (groupBy === 'week') payload.date_from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    if (groupBy === 'year') payload.date_from = new Date(new Date().getFullYear() - 4, 0, 1).toISOString().slice(0, 10);
    Api.call('admin.reports.salesByTime', payload).then(function (r) {
      if (!document.getElementById('salesChart')) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อน refresh รอบถัดไปจะทำงาน
      var labels = r.series.map(function (s) {
        if (groupBy === 'month') { var m = Number(s.period.slice(5, 7)); return MONTH_ABBR_[m - 1] || s.period; }
        return s.period;
      });
      var series = r.series.map(function (s) { return s.sales; });
      // รายเดือน/รายปี = หมวดหมู่ไม่ต่อเนื่อง เทียบกันชัดเจนกว่าด้วยกราฟแท่ง — รายวัน/รายสัปดาห์ยังคงเป็นกราฟเส้นแสดงแนวโน้ม
      if (groupBy === 'month' || groupBy === 'year') {
        Charts.bar('salesChart', labels, [{ label: 'ยอดขาย', data: series }]);
      } else {
        Charts.line('salesChart', labels, [{ label: 'ยอดขาย', data: series }]);
      }
    }).catch(function (err) { UI.toast('โหลดกราฟยอดขายไม่สำเร็จ: ' + err.message, 'error'); });
  }

  return function cleanup() { if (refreshTimer) clearInterval(refreshTimer); };
};
