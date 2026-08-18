/**
 * views/tracking.js — ติดตามสถานะออเดอร์ (#/tracking/:order_id) — polling ทุก 10 วิ
 */
var ORDER_STEPS = [
  { key: 'pending', label: 'รอดำเนินการ', icon: '📝' },
  { key: 'in_progress', label: 'กำลังดำเนินการ', icon: '👨‍🍳' },
  { key: 'completed', label: 'สำเร็จ', icon: '🎉' }
];
var STATUS_ORDER_ = ORDER_STEPS.map(function (s) { return s.key; });

Views.tracking = function (container, params) {
  var orderId = params[0];
  var pollTimer = null;

  function load() {
    Api.call('order.track', { order_id: orderId }).then(render).catch(function (err) {
      UI.toast(err.message, 'error');
      if (err.code === 'E_UNAUTHORIZED' || err.code === 'E_FORBIDDEN') location.hash = '#/history';
    });
  }

  function render(order) {
    if (order.status === 'cancelled') {
      container.innerHTML = renderHeader(order) +
        '<div class="empty-state"><div class="emoji">❌</div>ออเดอร์นี้ถูกยกเลิกแล้ว' +
        (order.cancel_reason ? '<br><span style="font-size:12px">เหตุผล: ' + UI.escapeHtml(order.cancel_reason) + '</span>' : '') + '</div>';
      return;
    }
    var currentIdx = STATUS_ORDER_.indexOf(order.status);
    var timelineHtml = ORDER_STEPS.map(function (step, idx) {
      var cls = idx < currentIdx ? 'done' : (idx === currentIdx ? 'current' : '');
      var ts = { in_progress: order.confirmed_at, completed: order.completed_at, pending: order.placed_at }[step.key];
      return '<div class="timeline-step ' + cls + '"><div class="dot">' + (idx <= currentIdx ? '✓' : '') + '</div>' +
        '<div><div class="label">' + step.icon + ' ' + step.label + '</div>' + (ts ? '<div class="time">' + UI.fmtTime(ts) + '</div>' : '') + '</div></div>';
    }).join('');

    var canCancel = order.status === 'pending';
    var paymentChip = { unpaid: '⏳ รอชำระเงิน', pending_verify: '🔍 รอตรวจสอบสลิป', paid: '✅ ชำระเงินแล้ว', refunded: '↩️ คืนเงินแล้ว' }[order.payment_status] || order.payment_status;
    var needsSlip = (order.payment_method === 'transfer' || order.payment_method === 'promptpay') && !order.slip_url;

    container.innerHTML = renderHeader(order) +
      '<div class="order-code-box"><div style="font-size:12px;color:var(--text-muted)">เลขที่ออเดอร์</div><div class="num">#' + order.order_no + '</div></div>' +
      '<div class="container">' +
        '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">' +
          '<span>สถานะการชำระเงิน</span><b>' + paymentChip + '</b></div>' +
        (needsSlip ? '<a href="#/payment/' + orderId + '" class="btn btn-outline btn-block" style="margin-bottom:16px">' + Icon('camera', 16) + ' ไปหน้าชำระเงิน / แนบหลักฐานการโอน</a>' : '') +
        '<div class="timeline">' + timelineHtml + '</div>' +
        '<div class="section-title">รายการสินค้า</div>' +
        order.items.map(function (i) { return '<div class="cart-item"><div class="thumb">🍱</div><div class="info"><div class="name">' + UI.escapeHtml(i.product_name) + ' x' + i.qty + '</div></div><div class="price">' + UI.money(i.line_total) + '</div></div>'; }).join('') +
        '<div class="summary-row total" style="margin-top:10px"><span>ยอดสุทธิ</span><span>' + UI.money(order.grand_total) + '</span></div>' +
        (canCancel ? '<button id="cancelBtn" class="btn btn-danger btn-block" style="margin-top:20px">ยกเลิกออเดอร์</button>' : '') +
      '</div>';

    if (canCancel) {
      document.getElementById('cancelBtn').onclick = function () {
        if (!confirm('ยืนยันยกเลิกออเดอร์นี้?')) return;
        Api.call('order.cancel', { order_id: orderId }).then(function () { UI.toast('ยกเลิกออเดอร์แล้ว', 'success'); load(); }).catch(function (err) { UI.toast(err.message, 'error'); });
      };
    }
  }

  function renderHeader(order) {
    return '<div class="container" style="padding-bottom:0"><a href="#/history" style="font-size:13px;color:var(--text-muted)">← กลับไปหน้าประวัติ</a></div>';
  }

  container.innerHTML = UI.loading();
  load();
  pollTimer = setInterval(load, 10000);
  return function cleanup() { clearInterval(pollTimer); };
};
