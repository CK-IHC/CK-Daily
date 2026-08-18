/**
 * state.js — เก็บสถานะแอป (token, user, ตะกร้า) ใน localStorage กันหลุดเมื่อ refresh
 */
var State = (function () {
  var KEY = 'ckdaily_state_v1';

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return { token: null, user: null, cart: [], roundId: null, orderType: 'pickup', address: '', couponCode: '', paymentMethod: 'cash' };
  }

  var data = load();

  function save() {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  return {
    get token() { return data.token; },
    set token(v) { data.token = v; save(); },
    get user() { return data.user; },
    set user(v) { data.user = v; save(); },
    get cart() { return data.cart; },
    get roundId() { return data.roundId; },
    set roundId(v) { data.roundId = v; save(); },
    get orderType() { return data.orderType; },
    set orderType(v) { data.orderType = v; save(); },
    get address() { return data.address; },
    set address(v) { data.address = v; save(); },
    get couponCode() { return data.couponCode; },
    set couponCode(v) { data.couponCode = v; save(); },
    get paymentMethod() { return data.paymentMethod; },
    set paymentMethod(v) { data.paymentMethod = v; save(); },

    isLoggedIn: function () { return !!data.token && !!data.user; },
    isGuest: function () { return !data.token; },

    login: function (token, user) { data.token = token; data.user = user; save(); },
    logout: function () { data.token = null; data.user = null; save(); },
    updateUser: function (patch) { data.user = Object.assign({}, data.user, patch); save(); },

    cartCount: function () { return data.cart.reduce(function (s, i) { return s + i.qty; }, 0); },
    cartSubtotal: function () { return data.cart.reduce(function (s, i) { return s + i.unit_price * i.qty; }, 0); },
    addToCart: function (item) {
      // เรียง options ก่อนสร้าง key เสมอ (เฉพาะตอนเทียบ ไม่แตะ item.options จริงที่จะโชว์ผล) กันเลือกตัวเลือกชุดเดียวกัน
      // แต่คลิกคนละลำดับ (กลุ่มที่เลือกได้มากกว่า 1) แล้วกลายเป็นคนละรายการในตะกร้าทั้งที่ควรรวมจำนวนกัน
      var cartKeyOf_ = function (i) { return i.product_id + '|' + JSON.stringify((i.options || []).slice().sort()) + '|' + (i.note || ''); };
      var key = cartKeyOf_(item);
      var existing = data.cart.find(function (i) { return cartKeyOf_(i) === key; });
      if (existing) existing.qty += item.qty;
      else data.cart.push(item);
      save();
    },
    updateCartQty: function (index, qty) {
      if (qty <= 0) data.cart.splice(index, 1);
      else data.cart[index].qty = qty;
      save();
    },
    removeFromCart: function (index) { data.cart.splice(index, 1); save(); },
    clearCart: function () { data.cart = []; save(); },
    replaceCart: function (items) { data.cart = items; save(); }
  };
})();
