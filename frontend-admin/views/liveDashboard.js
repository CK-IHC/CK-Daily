/**
 * views/liveDashboard.js — แดชบอร์ดยอดขาย real-time สำหรับผู้บริหาร สรุปจาก Orders/OrderItems/StockMovements
 * รีเฟรชอัตโนมัติทุก 30 วินาที (เหมือน Dashboard หลัก) ไม่รื้อ DOM ทั้งหน้ากันจอกระพริบ
 */
var LIVE_DASHBOARD_REFRESH_MS_ = 30000;

Views.liveDashboard = function (container) {
  container.innerHTML = UI.loading();
  var refreshTimer = null;

  function kpi(label, value, sub, color) {
    return '<div class="kpi-card"><div class="label">' + label + '</div><div class="value"' + (color ? ' style="color:' + color + '"' : '') + '>' + value + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
  }

  function kpiGridHtml_(d) {
    return kpi('ยอดขายวันนี้', UI.money(d.sales_today), d.completed_today + '/' + d.orders_today + ' ออเดอร์สำเร็จแล้ว') +
      kpi('กำไรขั้นต้นวันนี้', UI.money(d.gross_profit_today), '') +
      kpi('ยอดเฉลี่ยต่อบิล', UI.money(d.aov_today), '') +
      kpi('สลิปรอตรวจสอบ', d.pending_slips_count, UI.money(d.pending_slips_amount), d.pending_slips_count > 0 ? 'var(--warning)' : '') +
      kpi('ยังไม่ชำระเงิน', d.unpaid_count, UI.money(d.unpaid_amount), d.unpaid_count > 0 ? 'var(--danger)' : '') +
      kpi('สินค้าใกล้หมด/หมด', d.low_stock_alerts.length, '', d.low_stock_alerts.length > 0 ? 'var(--danger)' : '');
  }

  function touchLiveDot_() {
    var dot = document.getElementById('liveDot2');
    if (!dot) return;
    dot.style.opacity = '1';
    setTimeout(function () { if (dot) dot.style.opacity = '.35'; }, 600);
    var t = document.getElementById('liveUpdatedAt2');
    if (t) t.textContent = 'อัปเดตล่าสุด ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function renderLowStock_(items) {
    if (!items.length) return '<div class="empty-state">สต็อกสินค้าปกติดีทุกรายการ 🎉</div>';
    return '<div class="table-wrap"><table><thead><tr><th>SKU</th><th>สินค้า</th><th>คงเหลือ</th><th>จุดสั่งซื้อซ้ำ</th></tr></thead><tbody>' +
      items.map(function (p) {
        return '<tr><td>' + UI.escapeHtml(p.sku || '-') + '</td><td>' + UI.escapeHtml(p.name) + '</td>' +
          '<td style="font-weight:700;color:' + (p.stock_qty <= 0 ? 'var(--danger)' : 'var(--warning)') + '">' + p.stock_qty + '</td><td>' + p.reorder_point + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderRecentOrders_(items) {
    if (!items.length) return '<div class="empty-state">ยังไม่มีออเดอร์</div>';
    return '<div class="table-wrap"><table><thead><tr><th>เลขที่</th><th>ลูกค้า</th><th>ยอด</th><th>ชำระเงิน</th><th>สถานะ</th><th>เวลา</th></tr></thead><tbody>' +
      items.map(function (o) {
        return '<tr><td>#' + UI.escapeHtml(o.order_no) + '</td><td>' + UI.escapeHtml(o.customer_name) + '</td><td>' + UI.money(o.grand_total) + '</td>' +
          '<td><span class="chip ' + o.payment_status + '">' + o.payment_status + '</span></td><td><span class="chip ' + o.status + '">' + UI.statusLabel(o.status) + '</span></td><td>' + UI.fmtTime(o.placed_at) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderRecentMovements_(items) {
    if (!items.length) return '<div class="empty-state">ยังไม่มีการเคลื่อนไหวสต็อก</div>';
    var typeLabel = { out: 'ตัดสต็อก', 'return': 'คืนสต็อก', 'in': 'รับเข้า', adjust: 'ปรับยอด', waste: 'ของเสีย' };
    return '<div class="table-wrap"><table><thead><tr><th>SKU</th><th>ประเภท</th><th>จำนวนเปลี่ยน</th><th>เวลา</th></tr></thead><tbody>' +
      items.map(function (m) {
        return '<tr><td>' + UI.escapeHtml(m.sku || m.product_id) + '</td><td>' + (typeLabel[m.type] || m.type) + '</td>' +
          '<td style="color:' + (m.qty_change < 0 ? 'var(--danger)' : 'var(--success,#16a34a)') + '">' + (m.qty_change > 0 ? '+' : '') + m.qty_change + '</td><td>' + UI.fmtTime(m.created_at) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function load() {
    Api.call('admin.liveDashboard').then(function (d) {
      var isFirstRender = !document.getElementById('liveKpiGrid');
      if (isFirstRender) {
        container.innerHTML =
          '<div class="card no-print" style="display:flex;align-items:center;gap:8px;padding:10px 16px;font-size:12px;color:var(--text-muted)">' +
            '<span id="liveDot2" style="width:8px;height:8px;border-radius:50%;background:#16a34a;opacity:.35;transition:opacity .3s;flex:none"></span>' +
            '<span>สด (real-time) — สรุปจาก Orders / OrderItems / StockMovements โดยตรง รีเฟรชอัตโนมัติทุก 30 วินาที</span>' +
            '<span id="liveUpdatedAt2" style="margin-left:auto"></span>' +
          '</div>' +
          '<div class="kpi-grid" id="liveKpiGrid"></div>' +
          '<div class="card"><div class="card-head"><h3>แนวโน้มยอดขาย 14 วันล่าสุด</h3><button class="btn btn-outline btn-sm no-print" id="btnPrintTrend">🖨️ พิมพ์</button></div><canvas id="liveTrendChart" height="90"></canvas></div>' +
          '<div class="card"><div class="card-head"><h3>สินค้าขายดีวันนี้</h3></div><div id="liveTopProducts"><canvas id="liveTopChart" height="100"></canvas></div></div>' +
          '<div class="card"><div class="card-head"><h3>⚠️ แจ้งเตือนสต็อกใกล้หมด/หมด</h3><button class="btn btn-outline btn-sm no-print" id="btnPrintStock">🖨️ พิมพ์</button></div><div id="liveLowStock">' + UI.loading() + '</div></div>' +
          '<div class="card"><div class="card-head"><h3>ออเดอร์ล่าสุด</h3><button class="btn btn-outline btn-sm no-print" id="btnPrintOrders">🖨️ พิมพ์</button></div><div id="liveRecentOrders">' + UI.loading() + '</div></div>' +
          '<div class="card"><div class="card-head"><h3>การเคลื่อนไหวสต็อกล่าสุด</h3><button class="btn btn-outline btn-sm no-print" id="btnPrintMovements">🖨️ พิมพ์</button></div><div id="liveRecentMovements">' + UI.loading() + '</div></div>';
        document.getElementById('btnPrintTrend').onclick = function (e) { UI.printWithHeader('แนวโน้มยอดขาย 14 วันล่าสุด', e.currentTarget.closest('.card')); };
        document.getElementById('btnPrintStock').onclick = function (e) { UI.printWithHeader('แจ้งเตือนสต็อกใกล้หมด/หมด', e.currentTarget.closest('.card')); };
        document.getElementById('btnPrintOrders').onclick = function (e) { UI.printWithHeader('ออเดอร์ล่าสุด', e.currentTarget.closest('.card')); };
        document.getElementById('btnPrintMovements').onclick = function (e) { UI.printWithHeader('การเคลื่อนไหวสต็อกล่าสุด', e.currentTarget.closest('.card')); };
      }

      var grid = document.getElementById('liveKpiGrid');
      if (grid) grid.innerHTML = kpiGridHtml_(d);

      if (document.getElementById('liveTrendChart')) {
        Charts.line('liveTrendChart', d.sales_trend_14d.map(function (t) { return t.date.slice(5); }), [{ label: 'ยอดขาย', data: d.sales_trend_14d.map(function (t) { return t.sales; }) }]);
      }
      var topArea = document.getElementById('liveTopProducts');
      if (topArea) {
        if (!d.top_products_today.length) { topArea.innerHTML = '<div class="empty-state">ยังไม่มียอดขายวันนี้</div>'; }
        else {
          if (!document.getElementById('liveTopChart')) topArea.innerHTML = '<canvas id="liveTopChart" height="100"></canvas>';
          Charts.bar('liveTopChart', d.top_products_today.map(function (p) { return p.product_name; }), [{ label: 'ยอดขาย (บาท)', data: d.top_products_today.map(function (p) { return p.revenue; }) }], true);
        }
      }
      var lowStockArea = document.getElementById('liveLowStock');
      if (lowStockArea) lowStockArea.innerHTML = renderLowStock_(d.low_stock_alerts);
      var ordersArea = document.getElementById('liveRecentOrders');
      if (ordersArea) ordersArea.innerHTML = renderRecentOrders_(d.recent_orders);
      var movArea = document.getElementById('liveRecentMovements');
      if (movArea) movArea.innerHTML = renderRecentMovements_(d.recent_stock_movements);

      touchLiveDot_();
    }).catch(function (err) {
      if (!document.getElementById('liveKpiGrid')) container.innerHTML = '<div class="empty-state">' + UI.escapeHtml(err.message) + '</div>';
      else UI.toast('รีเฟรชข้อมูลไม่สำเร็จ: ' + err.message, 'error');
    });
  }

  load();
  refreshTimer = setInterval(load, LIVE_DASHBOARD_REFRESH_MS_);

  return function cleanup() { if (refreshTimer) clearInterval(refreshTimer); };
};
