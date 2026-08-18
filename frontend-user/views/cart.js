/**
 * views/cart.js — ตะกร้า + Checkout (คูปอง) → order.create
 * รอบ/ประเภทรับสินค้าถูกตัดออกจากหน้านี้ตามคำขอเดิม:
 * - รอบ: ใช้รอบที่เลือกไว้จากหน้า Home อัตโนมัติ (auto-pick รอบแรกที่เปิดอยู่ถ้ายังไม่เคยเลือก)
 * - ประเภทรับสินค้า: fix เป็น "delivery" เสมอ (ส่งตามสถานที่จัดส่งของรอบ)
 * - วิธีชำระเงิน: fix เป็น "transfer" เสมอ — หลังสั่งซื้อจะพาไปหน้าชำระเงิน (#/payment) ให้สแกน QR/แนบหลักฐานการโอน
 */
var CART_ORDER_TYPE_ = 'delivery';
var CART_PAYMENT_METHOD_ = 'transfer';

Views.cart = function (container) {
  var validated = null, validating = false, submitting = false;

  render();
  ensureRound();

  function render() {
    var cart = State.cart;
    if (!cart.length) {
      container.innerHTML = '<div class="empty-state"><div class="emoji">🛒</div>ตะกร้าว่างเปล่า<br>' +
        '<button class="btn btn-primary" style="margin-top:16px;width:auto;padding-left:24px;padding-right:24px" onclick="location.hash=\'#/home\'">เลือกซื้อสินค้า</button></div>';
      return;
    }

    container.innerHTML =
      '<div class="container">' +
        '<h2 style="margin:8px 0 4px">ตะกร้าของฉัน</h2>' +
        '<div id="itemsList"></div>' +
        '<div class="section-title">คูปองส่วนลด</div>' +
        '<div style="display:flex;gap:8px"><input id="couponInput" class="form-control" placeholder="รหัสคูปอง"><button id="applyCouponBtn" class="btn btn-outline btn-sm">ใช้</button></div>' +
        '<div class="section-title">หมายเหตุถึงร้าน (ถ้ามี)</div>' +
        '<textarea id="orderNoteInput" class="form-control" rows="2" maxlength="300" placeholder="เช่น ฝากไว้ที่ป้อมยาม, โทรก่อนส่ง">' + UI.escapeHtml(State.deliveryNote || '') + '</textarea>' +
        '<div class="section-title">สรุปยอด</div>' +
        '<div id="summaryBox" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px"></div>' +
        '<div id="issuesBox"></div>' +
        '<button id="submitBtn" class="btn btn-primary btn-block" style="margin-top:16px">ยืนยันสั่งซื้อ</button>' +
      '</div>';

    renderItems();
    document.getElementById('applyCouponBtn').onclick = function () {
      State.couponCode = document.getElementById('couponInput').value.trim();
      scheduleValidate();
    };
    document.getElementById('couponInput').value = State.couponCode || '';
    document.getElementById('orderNoteInput').oninput = function (e) { State.deliveryNote = e.target.value; };
    document.getElementById('submitBtn').onclick = submitOrder;

    // ตรวจสต็อกทันทีตอนเปิดหน้า (ไม่หน่วง 400ms เหมือนตอนแก้ไขตะกร้า) กันช่วงเวลาสั้นๆ ที่ยังกด + ได้ก่อนรู้ว่าของหมด
    doValidate();
  }

  /** หา issue เรื่องสต็อกของสินค้านี้จากผล cart.validate ล่าสุด (ถ้ามี) — ใช้แสดง "สินค้าหมด" ที่รายการแทน banner แจ้งเตือนแยก */
  function stockIssueFor_(productId) {
    if (!validated || !validated.issues) return null;
    return validated.issues.filter(function (x) { return x.product_id === productId && (x.issue === 'out_of_stock' || x.issue === 'stock_clipped'); })[0] || null;
  }

  function renderItems() {
    var el = document.getElementById('itemsList');
    el.innerHTML = State.cart.map(function (item, idx) {
      var issue = stockIssueFor_(item.product_id);
      var soldOut = issue && issue.issue === 'out_of_stock';
      return '<div class="cart-item' + (soldOut ? ' out-of-stock' : '') + '">' +
        '<div class="thumb" style="position:relative">' + (item.image_url ? '<img src="' + item.image_url + '" style="width:100%;height:100%;object-fit:cover;border-radius:10px">' : '🍱') +
        (item.is_frozen ? '<span class="frozen-badge" style="width:18px;height:18px;top:-4px;right:-4px" title="อาหารแช่แข็ง">' + Icon('snowflake', 11) + '</span>' : '') + '</div>' +
        '<div class="info"><div class="name">' + UI.escapeHtml(item.product_name) + (item.is_frozen ? ' <span style="color:#2563eb;font-size:11px;font-weight:600">(Freezing)</span>' : '') + '</div>' +
        '<div class="opts">' + UI.escapeHtml((item.option_names || []).join(', ')) + (item.note ? ' | ' + UI.escapeHtml(item.note) : '') + '</div>' +
        (soldOut
          ? '<div class="price" style="color:#dc2626;font-weight:700">สินค้าหมด</div>'
          : '<div class="price">' + UI.money(item.unit_price) + ' x ' + item.qty + (issue ? ' <span style="color:#d97706;font-size:11px;font-weight:600">(เหลือ ' + issue.qty_available + ' ชิ้น)</span>' : '') + '</div>') +
        '</div>' +
        (soldOut
          ? '<div class="qty-control" style="opacity:.4;pointer-events:none"><button class="qMinus" disabled>−</button><span>' + item.qty + '</span><button class="qPlus" disabled>+</button></div>'
          : '<div class="qty-control"><button class="qMinus" data-i="' + idx + '">−</button><span>' + item.qty + '</span><button class="qPlus" data-i="' + idx + '"' + (issue ? ' disabled' : '') + '>+</button></div>') +
        '</div>';
    }).join('');
    el.querySelectorAll('.qMinus:not([disabled])').forEach(function (b) { b.onclick = function () { State.updateCartQty(Number(b.dataset.i), State.cart[b.dataset.i].qty - 1); refreshAfterCartChange(); }; });
    el.querySelectorAll('.qPlus:not([disabled])').forEach(function (b) { b.onclick = function () { State.updateCartQty(Number(b.dataset.i), State.cart[b.dataset.i].qty + 1); refreshAfterCartChange(); }; });
  }

  function refreshAfterCartChange() {
    if (!State.cart.length) { render(); return; }
    renderItems();
    scheduleValidate();
  }

  /** ถ้ายังไม่เคยเลือกรอบมาก่อน (เช่นเข้ามาตรงที่ #/cart) ให้เลือกรอบแรกที่เปิดอยู่ให้อัตโนมัติ */
  function ensureRound() {
    Api.call('catalog.getActiveRounds').then(function (rounds) {
      var stillValid = rounds.some(function (r) { return r.round_id === State.roundId; });
      if (!stillValid) {
        var open = rounds.find(function (r) { return r.is_open_for_order; });
        State.roundId = open ? open.round_id : (rounds[0] ? rounds[0].round_id : null);
        scheduleValidate();
      }
    }).catch(function () {});
  }

  var validateTimer = null;
  function scheduleValidate() {
    clearTimeout(validateTimer);
    validateTimer = setTimeout(doValidate, 400);
  }

  /** มีสินค้าในตะกร้าที่หมดสต็อกจริง (ไม่ใช่แค่ถูกจำกัดจำนวน) หรือไม่ — ใช้บล็อกปุ่มยืนยันสั่งซื้อ */
  function hasBlockingStockIssue_() {
    return !!(validated && validated.issues && validated.issues.some(function (i) { return i.issue === 'out_of_stock'; }));
  }

  function updateSubmitBtnState_() {
    var btn = document.getElementById('submitBtn');
    if (!btn || submitting) return;
    if (hasBlockingStockIssue_()) {
      btn.disabled = true;
      btn.textContent = 'มีสินค้าหมดในตะกร้า กรุณาลบออกก่อน';
    } else {
      btn.disabled = false;
      btn.textContent = 'ยืนยันสั่งซื้อ';
    }
  }

  function doValidate() {
    if (!State.cart.length || validating) return;
    // setTimeout จาก scheduleValidate() อาจทำงานหลังผู้ใช้เปลี่ยนหน้าไปแล้ว (element ถูกลบ) — เช็คก่อนเสมอ
    if (!UI.setHtml('summaryBox', UI.loading())) return;
    validating = true;
    Api.call('cart.validate', {
      items: State.cart.map(function (i) { return { product_id: i.product_id, qty: i.qty, options: i.options, note: i.note }; }),
      round_id: State.roundId, order_type: CART_ORDER_TYPE_, coupon_code: State.couponCode
    }).then(function (data) {
      validating = false;
      validated = data;
      renderSummary();
      renderIssues();
      renderItems(); // อัปเดตรายการให้แสดง "สินค้าหมด" แบบ dim ที่ตัวสินค้าโดยตรงแทน banner แจ้งเตือนเรื่องสต็อก
      updateSubmitBtnState_();
    }).catch(function (err) {
      validating = false;
      UI.setHtml('summaryBox', '<div style="color:var(--danger);font-size:13px">' + UI.escapeHtml(err.message) + '</div>');
    });
  }

  function renderSummary() {
    if (!validated) return;
    UI.setHtml('summaryBox',
      '<div class="summary-row"><span class="muted">ยอดรวมสินค้า</span><span>' + UI.money(validated.subtotal) + '</span></div>' +
      (validated.discount ? '<div class="summary-row"><span class="muted">ส่วนลด</span><span>-' + UI.money(validated.discount) + '</span></div>' : '') +
      '<div class="summary-row total"><span>ยอดสุทธิ</span><span>' + UI.money(validated.grand_total) + '</span></div>');
  }

  function renderIssues() {
    // ปัญหาเรื่องสต็อก (out_of_stock/stock_clipped) แสดงที่ตัวรายการสินค้าโดยตรงแล้ว (renderItems) ไม่ต้องซ้ำใน banner นี้
    var otherIssues = (validated && validated.issues || []).filter(function (i) { return i.issue !== 'out_of_stock' && i.issue !== 'stock_clipped'; });
    if (!otherIssues.length) { UI.setHtml('issuesBox', ''); return; }
    UI.setHtml('issuesBox', '<div style="background:#fef3c7;color:#92400e;border-radius:10px;padding:10px;font-size:13px;margin-top:10px">' +
      otherIssues.map(function (i) { return '⚠️ ' + UI.escapeHtml(i.message); }).join('<br>') + '</div>');
  }

  function submitOrder() {
    if (submitting) return;
    if (!State.roundId) { UI.toast('ยังไม่มีรอบเปิดรับออเดอร์ในขณะนี้', 'error'); return; }
    if (hasBlockingStockIssue_()) { UI.toast('มีสินค้าหมดในตะกร้า กรุณาลบออกก่อนสั่งซื้อ', 'error'); return; }
    submitting = true;
    var btn = document.getElementById('submitBtn');
    btn.disabled = true; btn.textContent = 'กำลังตรวจสอบ...';

    Api.call('cart.validate', {
      items: State.cart.map(function (i) { return { product_id: i.product_id, qty: i.qty, options: i.options, note: i.note }; }),
      round_id: State.roundId, order_type: CART_ORDER_TYPE_, coupon_code: State.couponCode
    }).then(function (data) {
      if (data.has_changes) {
        validated = data; renderSummary(); renderIssues(); renderItems();
        UI.toast('ตะกร้ามีการเปลี่ยนแปลง กรุณาตรวจสอบแล้วกดยืนยันอีกครั้ง', 'error');
        submitting = false; updateSubmitBtnState_();
        return null;
      }
      btn.textContent = 'กำลังสั่งซื้อ...';
      return Api.call('order.create', {
        items: State.cart.map(function (i) { return { product_id: i.product_id, qty: i.qty, options: i.options, note: i.note }; }),
        round_id: State.roundId, order_type: CART_ORDER_TYPE_,
        coupon_code: State.couponCode, payment_method: CART_PAYMENT_METHOD_, delivery_note: State.deliveryNote
      });
    }).then(function (order) {
      if (!order) return;
      State.clearCart();
      State.deliveryNote = '';
      UI.toast('สั่งซื้อสำเร็จ!', 'success');
      location.hash = '#/payment/' + order.order_id;
    }).catch(function (err) {
      UI.toast(err.message, 'error');
      submitting = false;
      updateSubmitBtnState_();
      doValidate(); // สินค้าที่คนอื่นซื้อตัดหน้าอาจทำให้สต็อกเปลี่ยนไปแล้ว รีเช็คให้ตรงความจริง
    });
  }
};
