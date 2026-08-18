/**
 * views/payments.js — ตรวจสอบสลิปโอนเงิน: ดูรูปเทียบยอด → อนุมัติ/ปฏิเสธ + ดูประวัติที่อนุมัติ/ปฏิเสธไปแล้ว
 */
var PAYMENT_TABS_ = [
  { key: 'pending', label: 'รอตรวจสอบ' },
  { key: 'approved', label: 'อนุมัติแล้ว' },
  { key: 'rejected', label: 'ปฏิเสธแล้ว' }
];

Views.payments = function (container) {
  var tab = 'pending', lastRows = [];

  container.innerHTML =
    '<div class="card">' +
      '<div class="tabs-row no-print">' + PAYMENT_TABS_.map(function (t) { return '<button class="tab-btn ' + (t.key === tab ? 'active' : '') + '" data-tab="' + t.key + '">' + t.label + '</button>'; }).join('') + '</div>' +
      '<div class="card-head"><h3 id="payTitle">สลิปรอตรวจสอบ</h3><div class="no-print" style="display:flex;gap:8px">' +
        '<button id="btnPrint" class="btn btn-outline">🖨️ พิมพ์</button>' +
        '<button id="btnExport" class="btn btn-outline">Export CSV</button></div></div>' +
      '<div id="area">' + UI.loading() + '</div>' +
    '</div>';

  container.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.onclick = function () {
      container.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active'); tab = btn.dataset.tab;
      document.getElementById('payTitle').textContent = PAYMENT_TABS_.filter(function (t) { return t.key === tab; })[0].label;
      load();
    };
  });

  document.getElementById('btnExport').onclick = function () {
    UI.exportCsv('payments-' + tab + '.csv', lastRows.map(function (p) {
      return { order_no: p.order_no, customer: p.customer_name, phone: p.phone, amount: p.amount, method: p.method, status: p.status, verified_by: p.verified_by, verified_at: p.verified_at, created_at: p.created_at };
    }));
  };
  document.getElementById('btnPrint').onclick = function () {
    UI.printWithHeader(PAYMENT_TABS_.filter(function (t) { return t.key === tab; })[0].label, document.getElementById('area'));
  };

  load();

  function load() {
    document.getElementById('area').innerHTML = UI.loading();
    Api.call('admin.payments.list', { status: tab }).then(function (rows) { lastRows = rows; render(rows); }).catch(function (err) { UI.toast(err.message, 'error'); });
  }

  function render(rows) {
    var el = document.getElementById('area');
    if (!el) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อนตอบกลับ
    if (!rows.length) { el.innerHTML = '<div class="empty-state">' + (tab === 'pending' ? 'ไม่มีสลิปรอตรวจสอบ 🎉' : 'ยังไม่มีรายการ') + '</div>'; return; }
    var showActions = tab === 'pending';
    var showRefund = tab === 'approved' && ['manager', 'admin'].indexOf(State.user.role) > -1; // คืนเงินเป็นรายการเงินอ่อนไหว จำกัดเฉพาะ manager/admin เหมือน backend (staff ไม่มีสิทธิ์)
    el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>สลิป</th><th>เลขที่</th><th>ลูกค้า</th><th>เบอร์</th><th>รายการ</th><th>ยอด</th>' +
      (showActions ? '<th class="no-print">ตรวจสอบยอด (OCR)</th>' : '') + '<th>วิธีชำระ</th><th>เวลา</th>' +
      (showActions ? '<th class="no-print">จัดการ</th>' : '<th>ตรวจสอบโดย</th>') + '</tr></thead><tbody>' +
      rows.map(function (p) {
        var itemsSummary = (p.items || []).map(function (i) { return UI.escapeHtml(i.product_name) + ' x' + i.qty; }).join('<br>') || '-';
        var slipCount = (p.slip_urls || []).length;
        return '<tr><td>' + (p.slip_url ?
          '<button class="btn btn-sm btn-outline no-print" data-view-slip="' + p.order_id + '" style="font-size:11px;padding:4px 8px">🖼️ ดูสลิป' + (slipCount > 1 ? ' (' + slipCount + ')' : '') + '</button>'
          : '-') + '</td>' +
          '<td>#' + UI.escapeHtml(p.order_no) + '</td><td>' + UI.escapeHtml(p.customer_name) + '</td><td>' + UI.escapeHtml(p.phone) + '</td>' +
          '<td style="font-size:12px;color:var(--text-muted)">' + itemsSummary + '</td>' +
          '<td>' + UI.money(p.amount) + '</td>' +
          (showActions ? '<td class="no-print" id="ocr-' + p.order_id + '"><button class="btn btn-sm btn-outline" data-ocr="' + p.order_id + '" style="font-size:11px;padding:4px 8px">🔍 ตรวจสอบ</button></td>' : '') +
          '<td>' + p.method + '</td><td>' + UI.fmtTime(p.created_at) + '</td>' +
          (showActions
            ? '<td class="no-print"><button class="btn btn-sm btn-approve" data-approve="' + p.order_id + '">✅ อนุมัติ</button> <button class="btn btn-sm btn-reject" data-reject="' + p.order_id + '">❌ ปฏิเสธ</button></td>'
            : '<td>' + UI.fmtTime(p.verified_at) + (showRefund ? ' <button class="btn btn-sm btn-outline no-print" data-refund="' + p.order_id + '" style="margin-left:6px">↩️ คืนเงิน</button>' : '') + '</td>') +
          '</tr>';
      }).join('') + '</tbody></table></div>';

    el.querySelectorAll('[data-view-slip]').forEach(function (b) { b.onclick = function () { viewSlipInLightbox_(b.dataset.viewSlip, b); }; });
    el.querySelectorAll('[data-approve]').forEach(function (b) { b.onclick = function () { verify(b.dataset.approve, true); }; });
    el.querySelectorAll('[data-reject]').forEach(function (b) { b.onclick = function () { verify(b.dataset.reject, false); }; });
    el.querySelectorAll('[data-refund]').forEach(function (b) { b.onclick = function () { refund(b.dataset.refund); }; });
    el.querySelectorAll('[data-ocr]').forEach(function (b) { b.onclick = function () { analyzeSlip(b.dataset.ocr, b); }; });
  }

  function analyzeSlip(orderId, btn) {
    var cell = document.getElementById('ocr-' + orderId);
    btn.disabled = true; btn.textContent = 'กำลังอ่าน...';
    Api.call('admin.orders.analyzeSlip', { order_id: orderId }).then(function (r) {
      if (!cell) return; // โหลดหน้าใหม่ไปแล้วก่อนตอบกลับ
      if (!r.ocr_available) { cell.innerHTML = '<span style="font-size:11px;color:var(--text-muted)" title="' + UI.escapeHtml(r.message || '') + '">ยังไม่เปิดใช้ OCR</span>'; return; }
      if (r.extracted_amount === null) { cell.innerHTML = '<span style="font-size:11px;color:var(--text-muted)">อ่านยอดไม่ได้ — ดูรูปด้วยตาแทน</span>'; return; }
      var matchIcon = r.amount_match ? '✅' : '⚠️';
      var matchColor = r.amount_match ? 'var(--success,#16a34a)' : 'var(--danger)';
      cell.innerHTML = '<div style="font-size:12px"><span style="color:' + matchColor + ';font-weight:700">' + matchIcon + ' ' + UI.money(r.extracted_amount) + '</span>' +
        (r.amount_match ? '' : '<div style="color:var(--danger);font-size:11px">ยอดในสลิปไม่ตรงกับยอดที่ต้องชำระ (' + UI.money(r.order_amount) + ')</div>') +
        (r.extracted_date ? '<div style="color:var(--text-muted)">วันที่: ' + UI.escapeHtml(r.extracted_date) + '</div>' : '') + '</div>';
    }).catch(function (err) {
      if (cell) cell.innerHTML = '<span style="font-size:11px;color:var(--danger)">อ่านไม่สำเร็จ</span>';
      UI.toast(err.message, 'error');
    });
  }

  function verify(orderId, approve) {
    if (!approve && !confirm('ยืนยันปฏิเสธสลิปนี้?')) return;
    Api.call('admin.orders.verifyPayment', { order_id: orderId, approve: approve }).then(function () {
      UI.toast(approve ? 'อนุมัติแล้ว' : 'ปฏิเสธแล้ว', 'success'); load();
    }).catch(function (err) { UI.toast(err.message, 'error'); });
  }

  function refund(orderId) {
    var reason = prompt('เหตุผลการคืนเงิน (ถ้ามี):');
    if (reason === null) return; // กดยกเลิก
    if (!confirm('ยืนยันคืนเงินออเดอร์นี้? การกระทำนี้ย้อนกลับไม่ได้')) return;
    Api.call('admin.orders.refund', { order_id: orderId, reason: reason }).then(function () {
      UI.toast('คืนเงินแล้ว', 'success'); load();
    }).catch(function (err) { UI.toast(err.message, 'error'); });
  }
};
