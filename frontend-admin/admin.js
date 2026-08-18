/**
 * admin.js — router (hash-based) + shell (sidebar/topbar) + helper UI กลาง
 */
var UI = (function () {
  function toast(msg, type) {
    var wrap = document.getElementById('toastWrap');
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () { el.remove(); }, 3500);
  }
  function money(n) { return '฿' + Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function loading() { return '<div class="loading-center">กำลังโหลด...</div>'; }
  function fmtTime(iso) { if (!iso) return '-'; var d = new Date(iso); return isNaN(d) ? '-' : d.toLocaleString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function exportCsv(filename, rows) {
    if (!rows.length) { toast('ไม่มีข้อมูลให้ export', 'error'); return; }
    var headers = Object.keys(rows[0]);
    var csv = [headers.join(',')].concat(rows.map(function (r) {
      return headers.map(function (h) {
        var v = r[h] == null ? '' : String(r[h]).replace(/"/g, '""');
        // เบอร์โทรขึ้นต้นด้วย 0 — บังคับ Excel อ่านเป็นข้อความ ไม่งั้นจะตัดเลข 0 นำหน้าทิ้งตอนเปิดไฟล์
        if (/^0[0-9]{8,9}$/.test(v)) v = '="' + v + '"';
        return '"' + v + '"';
      }).join(',');
    })).join('\n');
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  }
  function modal(html) {
    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = '<div class="modal">' + html + '</div>';
    document.body.appendChild(backdrop);
    backdrop.onclick = function (e) { if (e.target === backdrop) backdrop.remove(); };
    return backdrop;
  }
  function statusLabel(s) {
    return { pending: 'รอดำเนินการ', in_progress: 'กำลังดำเนินการ', completed: 'สำเร็จ', cancelled: 'ยกเลิก' }[s] || s;
  }
  /** เรียงลำดับ rows ตาม key — ตัวเลข (รวมค่าที่เป็น string ตัวเลขล้วน) เทียบเชิงตัวเลข ที่เหลือเทียบแบบ string (locale ไทย) */
  function sortRows(rows, key, dir) {
    var copy = (rows || []).slice();
    copy.sort(function (a, b) {
      var av = a ? a[key] : '', bv = b ? b[key] : '';
      if (av == null) av = ''; if (bv == null) bv = '';
      var na = Number(av), nb = Number(bv);
      var bothNumeric = av !== '' && bv !== '' && !isNaN(na) && !isNaN(nb);
      var cmp = bothNumeric ? (na - nb) : String(av).localeCompare(String(bv), 'th');
      return dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }
  /**
   * ผูก event คลิกหัวตาราง (th[data-key]) ให้เรียงลำดับได้ — เรียกใหม่ทุกครั้งหลัง render ตาราง (thead เป็น
   * element ใหม่ทุกครั้งที่ render ใหม่ จึงไม่เก็บ state ทิศทางเรียงไว้ที่ DOM ตรงนี้ — ฝั่งที่เรียกใช้เก็บ
   * sortKey/sortDir ไว้เองใน closure แล้วสลับทิศทางก่อนเรียก UI.sortRows แล้ว render() ใหม่)
   * onClick(key) ถูกเรียกด้วย key ของคอลัมน์ที่คลิก
   */
  function wireSortHeaders(theadEl, onClick) {
    if (!theadEl) return;
    theadEl.querySelectorAll('th[data-key]').forEach(function (th) {
      th.classList.add('sortable-th');
      th.onclick = function () { onClick(th.dataset.key); };
    });
  }
  /**
   * ทำให้ตารางเรียงลำดับได้โดยตรงจาก DOM (ไม่ต้องมีสำเนา array ต้นทางแยกไว้ใน closure) — คลิกหัวตารางแล้ว
   * ย้าย <tr> ใน <tbody> ใหม่ตามข้อความในคอลัมน์นั้น (เทียบเป็นตัวเลขถ้าทั้งคู่เป็นตัวเลข/เงิน/% ล้วน ไม่งั้น
   * เทียบแบบข้อความ) ย้าย DOM node เดิม ไม่ได้สร้างใหม่ จึง event listener ที่ผูกไว้ก่อนหน้ายังทำงานปกติ
   * ใช้กับตารางที่ build จาก helper กลาง (เช่น reports.js table()/rankTable_()) ได้ทันทีโดยไม่ต้องแก้ data flow
   */
  function makeTableSortable(tableEl) {
    if (!tableEl) return;
    var thead = tableEl.querySelector('thead'), tbody = tableEl.querySelector('tbody');
    if (!thead || !tbody) return;
    var ths = thead.querySelectorAll('th');
    ths.forEach(function (th, colIdx) {
      th.classList.add('sortable-th');
      th.onclick = function () {
        var dir = th.dataset.dir === 'asc' ? 'desc' : 'asc';
        ths.forEach(function (t) { t.removeAttribute('data-dir'); });
        th.dataset.dir = dir;
        var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
        rows.sort(function (a, b) {
          var ca = a.children[colIdx], cb = b.children[colIdx];
          var av = ca ? ca.textContent.trim() : '', bv = cb ? cb.textContent.trim() : '';
          var numericLike = /^[฿\s0-9,.\-%]+$/;
          var bothNumeric = av !== '' && bv !== '' && numericLike.test(av) && numericLike.test(bv);
          var cmp = bothNumeric
            ? (Number(av.replace(/[^0-9.\-]/g, '')) - Number(bv.replace(/[^0-9.\-]/g, '')))
            : av.localeCompare(bv, 'th');
          return dir === 'asc' ? cmp : -cmp;
        });
        rows.forEach(function (r) { tbody.appendChild(r); });
      };
    });
  }
  function printedByLine_() {
    var admin = State.user ? (State.user.name || State.user.phone) : '-';
    var now = new Date().toLocaleString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    return { admin: admin, printedAt: now };
  }
  /**
   * สร้างส่วนหัวเอกสารมาตรฐานสำหรับพิมพ์ (โลโก้/ชื่อร้าน + หัวข้อรายงาน)
   * ใช้ได้ทั้งหน้าเดิม (opts.logoSrc ชี้ไฟล์ icon.svg ในแอป) และ popup window ใหม่ (opts.noLogo:true
   * เพราะ about:blank ของ popup ไม่มี base URL ให้ resolve รูปสัมพัทธ์ได้)
   */
  function printHeaderHtml(title, opts) {
    opts = opts || {};
    var brandBlock = opts.noLogo
      ? '<div class="print-doc-brand"><b>CK Daily</b><span>by IHC-Central Kitchen</span></div>'
      : '<div class="print-doc-head-row"><img src="' + opts.logoSrc + '" class="print-doc-logo" alt="logo">' +
        '<div class="print-doc-brand"><b>CK Daily</b><span>by IHC-Central Kitchen</span></div></div>';
    return '<div class="print-doc-header">' + brandBlock +
      '<h2 class="print-doc-title">' + escapeHtml(title) + '</h2>' +
      '<hr class="print-doc-rule">' +
    '</div>';
  }
  /** ผู้พิมพ์ + วันเวลา — วางมุมล่างซ้ายของหน้ากระดาษ (fixed ตอนพิมพ์) แทนที่จะอยู่ใต้หัวเรื่อง */
  function printFooterHtml() {
    var who = printedByLine_();
    return '<div class="print-doc-footer">พิมพ์โดย: <b>' + escapeHtml(who.admin) + '</b> &nbsp;|&nbsp; วันที่พิมพ์: <b>' + who.printedAt + '</b></div>';
  }
  /**
   * พิมพ์เฉพาะ "ส่วน" (scopeEl) ที่มีปุ่มพิมพ์นั้นๆ ไม่พิมพ์ทั้งหน้า — โคลนเนื้อหาของ scopeEl ไปใส่
   * container แยกท้าย body แล้วซ่อนทุกอย่างอื่นตอนพิมพ์ (ดู @media print ใน admin.css)
   * <canvas> (กราฟ Chart.js) ต้องแปลงเป็นรูปก่อนโคลน เพราะ cloneNode ไม่ก็อปปี้บิตแมพที่วาดไว้
   */
  function printWithHeader(title, scopeEl) {
    var old = document.getElementById('printScopeContainer');
    if (old) old.remove();
    if (!scopeEl) { toast('ไม่พบเนื้อหาที่จะพิมพ์', 'error'); return; }

    var clone = scopeEl.cloneNode(true);
    var origCanvases = scopeEl.querySelectorAll('canvas');
    var cloneCanvases = clone.querySelectorAll('canvas');
    origCanvases.forEach(function (c, i) {
      var target = cloneCanvases[i];
      if (!target || !target.parentNode) return;
      var img = document.createElement('img');
      try { img.src = c.toDataURL('image/png'); } catch (e) { return; }
      img.style.maxWidth = '100%';
      target.parentNode.replaceChild(img, target);
    });
    clone.querySelectorAll('.no-print').forEach(function (el) { el.remove(); });

    var container = document.createElement('div');
    container.id = 'printScopeContainer';
    container.innerHTML = printHeaderHtml(title, { logoSrc: '../icon.svg' });
    container.appendChild(clone);
    container.insertAdjacentHTML('beforeend', printFooterHtml());
    document.body.appendChild(container);

    var cleanup = function () {
      var el = document.getElementById('printScopeContainer'); if (el) el.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 5000); // เผื่อเบราว์เซอร์ไม่ยิง afterprint (บาง browser/บาง OS)
  }
  return { toast: toast, money: money, loading: loading, fmtTime: fmtTime, escapeHtml: escapeHtml, exportCsv: exportCsv, modal: modal, statusLabel: statusLabel, printHeaderHtml: printHeaderHtml, printFooterHtml: printFooterHtml, printWithHeader: printWithHeader, sortRows: sortRows, wireSortHeaders: wireSortHeaders, makeTableSortable: makeTableSortable };
})();

var Views = {};

var MENU = [
  { section: '' , items: [
    { hash: '#/dashboard', icon: 'dashboard', label: 'Dashboard', perm: 'dashboard:view_limited' },
    { hash: '#/liveDashboard', icon: 'dashboard', label: 'Live Dashboard', perm: 'dashboard:view' }
  ] },
  { section: 'ออเดอร์', items: [
    { hash: '#/orders', icon: 'orders', label: 'ออเดอร์ทั้งหมด', perm: 'orders:view' },
    { hash: '#/kanban', icon: 'kanban', label: 'Kanban Board', perm: 'kanban:view' }
  ] },
  { section: 'รอบการขาย', items: [{ hash: '#/rounds', icon: 'rounds', label: 'จัดการรอบ', perm: 'rounds:view' }] },
  { section: 'สินค้า', items: [{ hash: '#/products', icon: 'products', label: 'สินค้า/หมวดหมู่', perm: 'products:manage' }] },
  { section: 'สต็อก', items: [{ hash: '#/stock', icon: 'stock', label: 'จัดการสต็อก', perm: 'stock:manage' }] },
  { section: 'การเงิน', items: [
    { hash: '#/payments', icon: 'payments', label: 'ตรวจสอบสลิป', perm: 'payments:verify' },
    { hash: '#/coupons', icon: 'coupons', label: 'คูปอง/โปรโมชั่น', perm: 'coupons:manage' }
  ] },
  { section: 'การตลาด', items: [{ hash: '#/announcements', icon: 'announcements', label: 'ประกาศหน้าแรก', perm: 'announcements:manage' }] },
  { section: 'จัดการระบบ', items: [
    { hash: '#/users', icon: 'users', label: 'ผู้ใช้งาน', perm: 'users:manage' },
    { hash: '#/reports', icon: 'reports', label: 'รายงาน', perm: 'reports:view' },
    { hash: '#/settings', icon: 'settings', label: 'ตั้งค่าร้าน', perm: 'settings:manage' }
  ] }
];
var PAGE_TITLES = { dashboard: 'Dashboard', liveDashboard: 'Live Dashboard', orders: 'ออเดอร์ทั้งหมด', kanban: 'Kanban Board', rounds: 'จัดการรอบ', products: 'สินค้า/หมวดหมู่', stock: 'จัดการสต็อก', payments: 'ตรวจสอบสลิป', coupons: 'คูปอง/โปรโมชั่น', announcements: 'ประกาศหน้าแรก', users: 'ผู้ใช้งาน', reports: 'รายงาน', settings: 'ตั้งค่าร้าน' };
var PERM_FOR_ROUTE = { dashboard: 'dashboard:view_limited', liveDashboard: 'dashboard:view', orders: 'orders:view', kanban: 'kanban:view', rounds: 'rounds:view', products: 'products:manage', stock: 'stock:manage', payments: 'payments:verify', coupons: 'coupons:manage', announcements: 'announcements:manage', users: 'users:manage', reports: 'reports:view', settings: 'settings:manage' };

var Router = (function () {
  var container, cleanupFn = null;

  function parseHash() {
    var hash = location.hash || '#/orders';
    var parts = hash.split('/').filter(Boolean);
    return { name: parts[1] || 'orders', params: parts.slice(2) };
  }

  function renderSidebar(routeName) {
    var html = '<div class="brand" style="display:flex;align-items:center;gap:10px">' +
      '<img src="../icon.svg" alt="CK Daily" style="width:36px;height:36px;border-radius:10px;flex:none">' +
      '<div><b>' + UI.escapeHtml(window.CK_CONFIG.APP_NAME) + '</b><span style="display:block">' + UI.escapeHtml(window.CK_CONFIG.APP_TAGLINE) + '</span></div></div>';
    MENU.forEach(function (group) {
      var visibleItems = group.items.filter(function (item) { return State.can(item.perm); });
      if (!visibleItems.length) return;
      if (group.section) html += '<div class="nav-section">' + group.section + '</div>';
      visibleItems.forEach(function (item) {
        var active = '#/' + routeName === item.hash;
        html += '<a class="nav-item ' + (active ? 'active' : '') + '" href="' + item.hash + '"><span style="color:var(--primary);display:flex">' + Icon(item.icon, 19) + '</span>' + item.label + '</a>';
      });
    });
    html += '<div class="nav-section">บัญชี</div>' +
      '<div class="nav-item" id="logoutItem"><span style="color:var(--primary);display:flex">' + Icon('logout', 19) + '</span>ออกจากระบบ (' + UI.escapeHtml(State.user ? State.user.name || State.user.phone : '') + ')</div>';
    document.getElementById('sidebar').innerHTML = html;
    var logoutItem = document.getElementById('logoutItem');
    if (logoutItem) logoutItem.onclick = function () {
      if (!confirm('ออกจากระบบ?')) return;
      Api.call('auth.logout').finally(function () { State.logout(); location.hash = '#/login'; });
    };
  }

  function render() {
    if (cleanupFn) { try { cleanupFn(); } catch (e) {} cleanupFn = null; }
    var route = parseHash();

    if (route.name !== 'login' && !State.isLoggedIn()) { location.hash = '#/login'; return; }
    if (route.name === 'login' && State.isLoggedIn()) { location.hash = '#/orders'; return; }

    var showChrome = route.name !== 'login';
    document.getElementById('sidebarWrap').style.display = showChrome ? '' : 'none';
    document.getElementById('topbar').style.display = showChrome ? 'flex' : 'none';

    if (showChrome) {
      var requiredPerm = PERM_FOR_ROUTE[route.name];
      if (requiredPerm && !State.can(requiredPerm)) {
        container.innerHTML = '<div class="empty-state">🚫 คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (role: ' + State.user.role + ')</div>';
        renderSidebar(route.name);
        return;
      }
      renderSidebar(route.name);
      document.getElementById('pageTitle').textContent = PAGE_TITLES[route.name] || '';
      document.getElementById('storefrontLink').innerHTML = Icon('storefront', 19);
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebarBackdrop').classList.remove('show');
    }

    var viewFn = Views[route.name] || Views.notFound;
    container.innerHTML = '';
    var result = viewFn(container, route.params);
    if (typeof result === 'function') cleanupFn = result;
  }

  function start() {
    container = document.getElementById('content');
    window.addEventListener('hashchange', render);
    document.getElementById('hamburger').onclick = function () {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('sidebarBackdrop').classList.toggle('show');
    };
    document.getElementById('sidebarBackdrop').onclick = function () {
      document.getElementById('sidebar').classList.remove('open');
      this.classList.remove('show');
    };
    if (!location.hash) { location.hash = '#/orders'; return; } // hashchange จะยิง render() เอง กันเรนเดอร์ซ้ำสองครั้ง
    render();
  }

  return { start: start, render: render };
})();

Views.notFound = function (container) { container.innerHTML = '<div class="empty-state">ไม่พบหน้านี้</div>'; };

document.addEventListener('DOMContentLoaded', function () { Router.start(); });
