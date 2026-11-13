/**
 * views/dashboard.js — KPI สรุป + กราฟยอดขาย (ตามรอบการขาย/เดือน/ปี แยก 3 การ์ด) + กราฟรายสินค้า + ยอดขายรายรอบ + ออเดอร์ที่ต้องจัดการ
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
      '<h3 style="margin:4px 0 12px">ยอดขายรวม</h3>' +
      '<div class="chart-grid">' +
        '<div class="card"><div class="card-head"><h3>ตามรอบการขาย (90 วันล่าสุด)</h3>' +
          '<button class="btn btn-outline btn-sm no-print" id="btnPrintRoundSales">🖨️</button></div>' +
          // canvas ต้องอยู่ใน wrapper ของตัวเอง แยกจาก .card-head เพราะ Charts.* บังคับความสูงคงที่ที่
          // "parentElement" ของ canvas เสมอ — ถ้า parent คือ .card ทั้งก้อน หัวการ์ดด้านบนจะถูกบีบ/ตัดไปด้วย
          '<div id="roundSalesChartArea"><canvas id="roundSalesChart"></canvas></div></div>' +
        '<div class="card"><div class="card-head"><h3>รายเดือน (Jan-Dec)</h3>' +
          '<div class="no-print" style="display:flex;gap:6px;align-items:center">' +
          '<select id="yearSelect" class="form-control" style="width:auto;display:inline-block">' +
            YEAR_OPTIONS_.map(function (y) { return '<option value="' + y + '"' + (y === selectedYear ? ' selected' : '') + '>ปี ' + y + '</option>'; }).join('') +
          '</select>' +
          '<button class="btn btn-outline btn-sm" id="btnPrintMonthly">🖨️</button></div></div>' +
          '<div id="monthlyChartArea"><canvas id="monthlySalesChart"></canvas></div></div>' +
        '<div class="card"><div class="card-head"><h3>รายปี (5 ปีล่าสุด)</h3>' +
          '<button class="btn btn-outline btn-sm no-print" id="btnPrintYearly">🖨️</button></div>' +
          '<div id="yearlyChartArea"><canvas id="yearlySalesChart"></canvas></div></div>' +
      '</div>' +
      '<div class="card"><h3 id="itemChartTitle">ยอดขายแยกรายสินค้า (Top 10) — ปี ' + selectedYear + '</h3><div id="itemChartArea"><canvas id="itemChart"></canvas></div></div>' +
      '<div class="card"><h3>ยอดขายแยกรายรอบ</h3><div id="roundSalesArea">' + UI.loading() + '</div></div>' +
      '<div class="card"><div class="card-head"><h3>ออเดอร์ที่ต้องดำเนินการ</h3><button class="btn btn-outline btn-sm no-print" id="btnPrintAction">🖨️ พิมพ์</button></div><div id="actionOrders">' + UI.loading() + '</div></div>';

    document.getElementById('btnPrintRoundSales').onclick = function (e) { UI.printWithHeader('ยอดขายตามรอบการขาย', e.currentTarget.closest('.card')); };
    document.getElementById('btnPrintMonthly').onclick = function (e) { UI.printWithHeader('ยอดขายรายเดือน', e.currentTarget.closest('.card')); };
    document.getElementById('btnPrintYearly').onclick = function (e) { UI.printWithHeader('ยอดขายรายปี', e.currentTarget.closest('.card')); };
    document.getElementById('btnPrintAction').onclick = function (e) { UI.printWithHeader('ออเดอร์ที่ต้องดำเนินการ', e.currentTarget.closest('.card')); };
    document.getElementById('yearSelect').onchange = function (e) { selectedYear = Number(e.target.value); loadMonthlySalesChart(); loadTopProducts(); };

    loadAll_();
    touchLiveDot_();
    refreshTimer = setInterval(function () { loadAll_(); touchLiveDot_(); }, DASHBOARD_REFRESH_MS_);

    function loadAll_() {
      Api.call('admin.dashboard').then(function (data) {
        var grid = document.getElementById('kpiGrid');
        if (grid) grid.innerHTML = kpiGridHtml_(data);
      }).catch(function () {});
      loadRoundSalesChart();
      loadMonthlySalesChart();
      loadYearlySalesChart();
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
        if (!document.getElementById('itemChart')) itemArea.innerHTML = '<canvas id="itemChart"></canvas>';
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

  var MONTH_ABBR_ = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // "ยอดขายรวม" แยกเป็น 3 กราฟแยกการ์ดกัน แสดงพร้อมกันตลอด แทนการ์ดเดียวที่ต้องสลับดูทีละช่วงเวลาแบบเดิม
  // ตามรอบการขาย/รายเดือน/รายปี = หมวดหมู่ไม่ต่อเนื่อง เทียบกันชัดเจนกว่าด้วยกราฟแท่งทั้งหมด
  function loadRoundSalesChart() {
    var payload = { date_from: new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10) };
    Api.call('admin.reports.salesByRound', payload).then(function (rows) {
      var area = document.getElementById('roundSalesChartArea');
      if (!area) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อน refresh รอบถัดไปจะทำงาน
      if (!rows.length) { area.innerHTML = '<div class="empty-state">ยังไม่มีรอบการขายใน 90 วันล่าสุด</div>'; return; }
      // เรียงตามเวลาเปิดรอบจริง (backend คืนมาเรียงตามยอดขายมาก-น้อย) แล้วนับ "รอบที่ N" แยกตามเดือนที่เปิดรอบ
      // เช่น เดือนนี้เปิด 3 รอบ ก็จะได้ป้าย "OCT 2026 / รอบที่ 1, 2, 3" ไล่ตามลำดับเวลาในเดือนนั้น
      // กรองแถวที่ไม่มี open_at (หรือ parse เป็นวันที่ไม่ได้) ทิ้งก่อน — เกิดได้ถ้า backend ที่ deploy อยู่
      // ยังเป็นเวอร์ชันเก่าก่อนเพิ่มฟิลด์นี้ กันหน้าแอดมินพังทั้งกราฟเพราะข้อมูลแค่บางแถวไม่ครบ
      var sorted = rows.slice()
        .filter(function (r) { return r.open_at && !isNaN(new Date(r.open_at).getTime()); })
        .sort(function (a, b) { return new Date(a.open_at) - new Date(b.open_at); });
      if (!sorted.length) {
        area.innerHTML = '<div class="empty-state">ไม่มีข้อมูลวันที่เปิดรอบ — ตรวจสอบว่าอัปโหลด backend/ReportService.gs เวอร์ชันล่าสุดและ Deploy ใหม่แล้วหรือยัง</div>';
        return;
      }
      var countInMonth = {};
      var labels = sorted.map(function (r) {
        var d = new Date(r.open_at);
        var monthKey = d.getFullYear() + '-' + d.getMonth();
        var n = (countInMonth[monthKey] = (countInMonth[monthKey] || 0) + 1);
        return [MONTH_ABBR_[d.getMonth()].toUpperCase() + ' ' + d.getFullYear(), 'รอบที่ ' + n];
      });
      if (!document.getElementById('roundSalesChart')) area.innerHTML = '<canvas id="roundSalesChart"></canvas>';
      Charts.bar('roundSalesChart', labels, [{ label: 'ยอดขาย', data: sorted.map(function (r) { return r.sales; }) }]);
    }).catch(function (err) { UI.toast('โหลดกราฟยอดขายตามรอบไม่สำเร็จ: ' + err.message, 'error'); });
  }

  function loadMonthlySalesChart() {
    var payload = { group_by: 'month', date_from: selectedYear + '-01-01', date_to: selectedYear + '-12-31' };
    Api.call('admin.reports.salesByTime', payload).then(function (r) {
      if (!document.getElementById('monthlySalesChart')) return;
      var labels = r.series.map(function (s) { var m = Number(s.period.slice(5, 7)); return MONTH_ABBR_[m - 1] || s.period; });
      Charts.bar('monthlySalesChart', labels, [{ label: 'ยอดขาย', data: r.series.map(function (s) { return s.sales; }) }]);
    }).catch(function (err) { UI.toast('โหลดกราฟยอดขายรายเดือนไม่สำเร็จ: ' + err.message, 'error'); });
  }

  function loadYearlySalesChart() {
    var payload = { group_by: 'year', date_from: new Date(new Date().getFullYear() - 4, 0, 1).toISOString().slice(0, 10) };
    Api.call('admin.reports.salesByTime', payload).then(function (r) {
      if (!document.getElementById('yearlySalesChart')) return;
      Charts.bar('yearlySalesChart', r.series.map(function (s) { return s.period; }), [{ label: 'ยอดขาย', data: r.series.map(function (s) { return s.sales; }) }]);
    }).catch(function (err) { UI.toast('โหลดกราฟยอดขายรายปีไม่สำเร็จ: ' + err.message, 'error'); });
  }

  return function cleanup() { if (refreshTimer) clearInterval(refreshTimer); };
};
