/**
 * app.js — router (hash-based), shell (header/bottom nav), helper UI กลาง (toast/skeleton/format)
 */
var UI = (function () {
  function toast(msg, type) {
    var wrap = document.getElementById('toastWrap');
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () { el.remove(); }, 3000);
  }
  function money(n) { return '฿' + Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function skeletonGrid(n) {
    var html = '<div class="product-grid">';
    for (var i = 0; i < n; i++) html += '<div class="skeleton" style="height:170px"></div>';
    return html + '</div>';
  }
  function loading() { return '<div class="loading-center">กำลังโหลด...</div>'; }
  /**
   * ตั้ง innerHTML แบบปลอดภัยจาก callback แบบ async (.then/.catch/setInterval) — ถ้า element นั้นถูกลบไปแล้ว
   * เพราะผู้ใช้เปลี่ยนหน้าไปแล้วก่อน callback จะทำงาน จะไม่ throw "Cannot set properties of null" อีกต่อไป
   */
  function setHtml(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
    return el;
  }
  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('th-TH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function fmtTimeShort(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function modal(html) {
    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = '<div class="modal">' + html + '</div>';
    document.body.appendChild(backdrop);
    backdrop.onclick = function (e) { if (e.target === backdrop) backdrop.remove(); };
    return backdrop;
  }
  return { toast: toast, money: money, skeletonGrid: skeletonGrid, loading: loading, fmtTime: fmtTime, fmtTimeShort: fmtTimeShort, escapeHtml: escapeHtml, modal: modal, setHtml: setHtml };
})();

var Views = {};

var Router = (function () {
  var container, cleanupFn = null;
  var NAV_ITEMS = [
    { hash: '#/home', icon: 'home', label: 'หน้าแรก' },
    { hash: '#/history', icon: 'history', label: 'ประวัติ' },
    { hash: '#/cart', icon: 'cart', label: 'ตะกร้า' },
    { hash: '#/profile', icon: 'user', label: 'โปรไฟล์' }
  ];
  var NO_CHROME_ROUTES = ['#/login'];

  function parseHash() {
    var hash = location.hash || '#/home';
    var parts = hash.split('/').filter(Boolean); // ["#","home"] or ["#","product","PRD-1"]
    return { name: parts[1] || 'home', params: parts.slice(2), raw: hash };
  }

  function renderChrome(routeName) {
    var showChrome = NO_CHROME_ROUTES.indexOf('#/' + routeName) === -1;
    document.getElementById('header').style.display = showChrome ? 'flex' : 'none';
    document.getElementById('bottomNav').style.display = showChrome ? 'flex' : 'none';
    if (!showChrome) return;
    var user = State.user;
    document.getElementById('pointsChip').textContent = user ? (user.points + ' แต้ม') : 'เข้าสู่ระบบ';
    document.getElementById('cartBadge').textContent = State.cartCount();
    document.getElementById('cartBadge').style.display = State.cartCount() > 0 ? 'flex' : 'none';
    document.getElementById('bellIcon').innerHTML = Icon('bell', 18);
    document.getElementById('adminIcon').innerHTML = Icon('settings', 18);
    document.getElementById('cartIcon').innerHTML = Icon('cart', 18);
    if (State.isLoggedIn()) {
      Api.call('notify.list', { limit: 1 }).then(function (data) {
        var badge = document.getElementById('bellBadge');
        if (!badge) return;
        badge.textContent = data.unread_count;
        badge.style.display = data.unread_count > 0 ? 'flex' : 'none';
      }).catch(function () {});
    }

    var nav = document.getElementById('bottomNav');
    nav.innerHTML = NAV_ITEMS.map(function (item) {
      var active = location.hash.indexOf(item.hash) === 0 || (item.hash === '#/home' && location.hash === '');
      return '<a href="' + item.hash + '" class="' + (active ? 'active' : '') + '">' +
        '<span class="nav-icon">' + Icon(item.icon, 20) + '</span>' + item.label + '</a>';
    }).join('');
  }

  function render() {
    if (cleanupFn) { try { cleanupFn(); } catch (e) {} cleanupFn = null; }
    var route = parseHash();
    renderChrome(route.name);

    var authRequired = ['cart', 'history', 'profile', 'tracking', 'notifications', 'payment'];
    if (authRequired.indexOf(route.name) > -1 && !State.isLoggedIn()) {
      location.hash = '#/login';
      return;
    }

    var viewFn = Views[route.name] || Views.notFound;
    container.innerHTML = '';
    var result = viewFn(container, route.params);
    if (typeof result === 'function') cleanupFn = result;
  }

  function start() {
    container = document.getElementById('app');
    window.addEventListener('hashchange', render);
    if (!location.hash) { location.hash = '#/home'; return; } // hashchange จะยิง render() เอง กันเรนเดอร์ซ้ำสองครั้ง
    render();
  }

  return { start: start, render: render };
})();

Views.notFound = function (container) {
  container.innerHTML = '<div class="empty-state"><div class="emoji">🔍</div>ไม่พบหน้านี้</div>';
};

document.addEventListener('DOMContentLoaded', function () {
  Router.start();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
});
