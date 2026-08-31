/**
 * views/home.js — แบนเนอร์รอบ, หมวดหมู่, ค้นหา, กริดสินค้า
 */
Views.home = function (container) {
  var categories = [], products = [], rounds = [], activeCategory = '', searchQuery = '', countdownTimer = null;
  var bannerTimer = null, bannerIndex = 0;

  container.innerHTML = '<div id="bannerSlider"></div><div id="roundBanner"></div><div id="announceArea"></div><div class="search-box"><span style="color:var(--text-muted)">' + Icon('search', 18) + '</span><input id="searchInput" placeholder="ค้นหาสินค้า..."></div>' +
    '<div id="catScroll" class="cat-scroll"></div>' + '<div id="productArea">' + UI.skeletonGrid(6) + '</div>';

  document.getElementById('searchInput').addEventListener('input', debounce(function (e) {
    searchQuery = e.target.value; loadProducts();
  }, 300));

  function debounce(fn, ms) { var t; return function () { clearTimeout(t); var a = arguments; t = setTimeout(function () { fn.apply(null, a); }, ms); }; }

  // ยิง loadProducts() ขนานไปเลยโดยไม่รอ categories/rounds ก่อน (ไม่ได้ผูกกัน) ลดเวลาที่ผู้ใช้เห็นสินค้าครั้งแรก
  loadProducts();

  // แยกเรียก categories/rounds เป็นคนละ request กัน (เดิมรวมกันใน Promise.all เดียว) กันปัญหาฝั่งใดฝั่งหนึ่ง
  // ดึงข้อมูลไม่สำเร็จชั่วคราวแล้วทำให้อีกฝั่งที่ควรจะแสดงได้ปกติพลอยไม่แสดงไปด้วย
  Api.call('catalog.getCategories').then(function (cats) {
    categories = cats; renderCategories();
  }).catch(function (err) { UI.toast(err.message, 'error'); });

  Api.call('catalog.getActiveRounds').then(function (r) {
    rounds = r;
    var open = rounds.find(function (x) { return x.is_open_for_order; });
    var currentIsOpenRound = open && State.roundId === open.round_id;
    // เลือกรอบที่เปิดรับอยู่เป็นค่าเริ่มต้นเสมอเมื่อเข้าหน้าแรก (ไม่ค้างอยู่ที่รอบเก่าที่ปิดรับไปแล้ว)
    if (!currentIsOpenRound) {
      if (open) State.roundId = open.round_id;
      else if (!State.roundId || !rounds.some(function (x) { return x.round_id === State.roundId; })) {
        State.roundId = rounds[0] ? rounds[0].round_id : null;
      }
    }
    renderRoundBanner();
    startCountdown();
  }).catch(function (err) { UI.toast(err.message, 'error'); });

  Api.call('catalog.getActiveAnnouncements').then(renderAnnouncements).catch(function () {});
  Api.call('catalog.getActiveBanners').then(renderBannerSlider).catch(function () {});

  var BANNER_INTERVAL_MS_ = 4000;
  function renderBannerSlider(list) {
    var el = document.getElementById('bannerSlider');
    if (!el) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อนตอบกลับ
    clearInterval(bannerTimer);
    if (!list || !list.length) { el.innerHTML = ''; return; }
    bannerIndex = 0;
    el.innerHTML = '<div class="banner-slider">' +
      '<div class="banner-track" id="bannerTrack">' + list.map(function (b) {
        var clickable = !!b.link_url;
        return '<div class="banner-slide' + (clickable ? ' clickable' : '') + '" ' + (clickable ? 'data-link="' + UI.escapeHtml(b.link_url) + '"' : '') + '>' +
          '<img src="' + b.image_url + '" alt="" loading="lazy"></div>';
      }).join('') + '</div>' +
      (list.length > 1 ? '<div class="banner-dots">' + list.map(function (_, i) { return '<span class="banner-dot' + (i === 0 ? ' active' : '') + '" data-i="' + i + '"></span>'; }).join('') + '</div>' : '') +
    '</div>';
    var track = document.getElementById('bannerTrack');
    function goTo(i) {
      bannerIndex = ((i % list.length) + list.length) % list.length;
      track.style.transform = 'translateX(-' + (bannerIndex * 100) + '%)';
      el.querySelectorAll('.banner-dot').forEach(function (d, di) { d.classList.toggle('active', di === bannerIndex); });
    }
    function startAuto() {
      clearInterval(bannerTimer);
      if (list.length > 1) bannerTimer = setInterval(function () { goTo(bannerIndex + 1); }, BANNER_INTERVAL_MS_);
    }
    el.querySelectorAll('.banner-dot').forEach(function (dot) { dot.onclick = function () { goTo(Number(dot.dataset.i)); startAuto(); }; });
    el.querySelectorAll('.banner-slide.clickable').forEach(function (slide) {
      slide.onclick = function () { window.open(slide.dataset.link, '_blank', 'noopener'); };
    });
    // ปัดซ้าย/ขวาเปลี่ยนสไลด์ได้บนมือถือ นอกเหนือจากรอสไลด์อัตโนมัติ
    var touchStartX = null;
    track.addEventListener('touchstart', function (e) { touchStartX = e.touches[0].clientX; }, { passive: true });
    track.addEventListener('touchend', function (e) {
      if (touchStartX === null) return;
      var dx = e.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(dx) < 40) return;
      goTo(bannerIndex + (dx < 0 ? 1 : -1)); startAuto();
    }, { passive: true });
    startAuto();
  }

  var ANNOUNCE_SIZE_HEIGHT_ = { small: 70, medium: 120, large: 170 };
  function renderAnnouncements(list) {
    var el = document.getElementById('announceArea');
    if (!el) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อนตอบกลับ
    if (!list || !list.length) { el.innerHTML = ''; return; }
    el.innerHTML = list.map(function (a) {
      var h = ANNOUNCE_SIZE_HEIGHT_[a.size] || ANNOUNCE_SIZE_HEIGHT_.medium;
      var clickable = !!a.link_url;
      return '<div class="announce-card' + (clickable ? ' clickable' : '') + '" ' + (clickable ? 'data-link="' + UI.escapeHtml(a.link_url) + '"' : '') + '>' +
        (a.image_url ? '<img src="' + a.image_url + '" class="announce-img" style="height:' + h + 'px">' : '') +
        (a.text ? '<div class="announce-text">' + UI.escapeHtml(a.text).replace(/\n/g, '<br>') + '</div>' : '') +
        (clickable ? '<div class="announce-link-hint">' + Icon('link', 11) + ' ดูเพิ่มเติม</div>' : '') +
      '</div>';
    }).join('');
    el.querySelectorAll('.announce-card.clickable').forEach(function (card) {
      card.onclick = function () { window.open(card.dataset.link, '_blank', 'noopener'); };
    });
  }

  function renderRoundBanner() {
    var el = document.getElementById('roundBanner');
    if (!el) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อน callback (Promise.all/countdown) จะทำงาน
    var round = rounds.find(function (r) { return r.round_id === State.roundId; });
    if (!round) { el.innerHTML = '<div class="round-banner closed"><div class="title">ยังไม่มีรอบเปิดรับออเดอร์ในขณะนี้</div></div>'; return; }
    var closeTime = new Date(round.close_at);
    var now = new Date();
    var isOpen = round.is_open_for_order && closeTime > now;
    el.innerHTML = '<div class="round-banner ' + (isOpen ? '' : 'closed') + '">' +
      '<div class="rb-glow"></div>' +
      (rounds.length > 1 ? '<button class="rb-switch" id="switchRoundBtn">' + Icon('history', 12) + ' เปลี่ยนรอบ (' + rounds.length + ')</button>' : '') +
      '<div class="rb-top">' +
        '<div class="title">' + UI.escapeHtml(round.round_name) + (isOpen ? '' : ' — ปิดรับแล้ว') + '</div>' +
      '</div>' +
      (isOpen ? '<div class="countdown" id="countdownText">--:--:--</div>' : '<div class="note">โปรดรอรอบถัดไป</div>') +
      '<div class="note">เปิดรับ ' + UI.fmtTime(round.open_at) + ' — ปิดรับ ' + UI.fmtTime(round.close_at) + '</div>' +
      (round.delivery_location ? '<div class="delivery-location-box">' + Icon('pin', 15) + '<span>จัดส่งที่: ' + UI.escapeHtml(round.delivery_location) + '</span></div>' : '') +
      (round.note ? '<div class="note">' + UI.escapeHtml(round.note) + '</div>' : '') +
      '</div>';
    var switchBtn = document.getElementById('switchRoundBtn');
    if (switchBtn) switchBtn.onclick = showRoundPicker;
  }

  function showRoundPicker() {
    var html = rounds.map(function (r) {
      return '<div class="radio-card ' + (r.round_id === State.roundId ? 'selected' : '') + '" data-id="' + r.round_id + '">' +
        '<div><b>' + UI.escapeHtml(r.round_name) + '</b><div style="font-size:12px;color:var(--text-muted)">ปิดรับ ' + UI.fmtTime(r.close_at) + '</div></div></div>';
    }).join('');
    var backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    backdrop.innerHTML = '<div class="sheet"><div class="sheet-handle"></div><div class="container"><h3>เลือกรอบ</h3>' + html + '</div></div>';
    document.body.appendChild(backdrop);
    backdrop.onclick = function (e) { if (e.target === backdrop) backdrop.remove(); };
    backdrop.querySelectorAll('.radio-card').forEach(function (card) {
      card.onclick = function () { State.roundId = card.dataset.id; backdrop.remove(); renderRoundBanner(); startCountdown(); };
    });
  }

  function startCountdown() {
    clearInterval(countdownTimer);
    countdownTimer = setInterval(function () {
      var round = rounds.find(function (r) { return r.round_id === State.roundId; });
      var el = document.getElementById('countdownText');
      if (!round || !el) return;
      var diff = new Date(round.close_at) - new Date();
      if (diff <= 0) { el.textContent = 'ปิดรับแล้ว'; clearInterval(countdownTimer); renderRoundBanner(); return; }
      var h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
      el.textContent = 'ปิดรับใน ' + pad(h) + ':' + pad(m) + ':' + pad(s);
    }, 1000);
  }
  function pad(n) { return n < 10 ? '0' + n : n; }

  /** สีของหมวดหมู่ตาม category_id — ใช้แยกแท็บ/การ์ดสินค้าด้วยสีที่แอดมินตั้งไว้ (ค่าเริ่มต้นถ้าไม่ได้ตั้งสี) */
  function categoryColor_(categoryId) {
    var c = categories.filter(function (x) { return x.category_id === categoryId; })[0];
    return (c && c.color) || '';
  }

  function renderCategories() {
    var el = document.getElementById('catScroll');
    if (!el) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อน callback จะทำงาน
    el.innerHTML = '<div class="cat-chip ' + (activeCategory === '' ? 'active' : '') + '" data-id="">ทั้งหมด</div>' +
      categories.map(function (c) {
        var active = activeCategory === c.category_id;
        var style = c.color ? (active ? 'background:' + c.color + ';border-color:' + c.color + ';color:#fff' : 'background:' + c.color + '1f;border-color:' + c.color + '55;color:' + c.color) : '';
        var dot = c.color && !active ? '<span class="cat-dot" style="background:' + c.color + '"></span>' : '';
        return '<div class="cat-chip ' + (active ? 'active' : '') + '" style="' + style + '" data-id="' + c.category_id + '">' + dot + '<span style="display:inline-flex;vertical-align:middle;margin-right:4px">' + CategoryIconHtml(c.icon, 14) + '</span>' + UI.escapeHtml(c.name) + '</div>';
      }).join('');
    el.querySelectorAll('.cat-chip').forEach(function (chip) {
      chip.onclick = function () { activeCategory = chip.dataset.id; renderCategories(); loadProducts(); };
    });
  }

  function loadProducts() {
    if (!UI.setHtml('productArea', UI.skeletonGrid(6))) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อน debounce/callback จะทำงาน
    Api.call('catalog.getProducts', { category: activeCategory, search: searchQuery }).then(function (data) {
      products = data; renderProducts();
    }).catch(function (err) { UI.toast(err.message, 'error'); });
  }

  /** จำนวนสูงสุดที่เพิ่มได้จากการ์ดนี้ — ห้ามให้จำนวนที่จองในตะกร้าเกินสต็อกที่เหลือจริง (กันจองเกิน stock) */
  function maxQtyFor_(p) {
    var byStock = p.track_stock ? Number(p.stock_qty) : Infinity;
    var byOrder = p.max_per_order > 0 ? Number(p.max_per_order) : Infinity;
    return Math.min(byStock, byOrder);
  }

  /** จำนวนในตะกร้าของสินค้าที่ไม่มีตัวเลือก/หมายเหตุ (คีย์เดียวกับ State.addToCart) — ใช้แสดงในสเต็ปเปอร์บนการ์ด */
  function cartQtyFor(productId) {
    var item = State.cart.filter(function (i) { return i.product_id === productId && (!i.options || !i.options.length) && !i.note; })[0];
    return item ? item.qty : 0;
  }

  function cardControlHtml(p) {
    var color = categoryColor_(p.category_id);
    var btnStyle = color ? ' style="background:' + color + '"' : '';
    if (!p.in_stock) {
      return '<button class="card-add-btn" disabled>สินค้าหมด</button>';
    }
    if (p.has_options) {
      return '<button class="card-add-btn addOptBtn" data-id="' + p.product_id + '"' + btnStyle + ' title="เลือกตัวเลือกสินค้า">' + Icon('cart', 14) + ' เพิ่ม</button>';
    }
    var qty = cartQtyFor(p.product_id);
    var maxQty = maxQtyFor_(p);
    if (!qty) {
      return '<button class="card-add-btn qsPlus" data-id="' + p.product_id + '"' + btnStyle + '>+ เพิ่ม</button>';
    }
    var atMax = qty >= maxQty;
    return '<div class="qty-stepper" data-id="' + p.product_id + '">' +
      '<button class="qsMinus" data-id="' + p.product_id + '"' + btnStyle + '>−</button>' +
      '<span class="qsCount">' + qty + '</span>' +
      '<button class="qsPlus" data-id="' + p.product_id + '"' + btnStyle + (atMax ? ' disabled title="มีสินค้าไม่พอ"' : '') + '>+</button></div>';
  }

  function renderProducts() {
    var el = document.getElementById('productArea');
    if (!el) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อน catalog.getProducts จะตอบกลับ
    if (!products.length) { el.innerHTML = '<div class="empty-state"><div class="emoji">🍽️</div>ไม่พบสินค้า</div>'; return; }
    el.innerHTML = '<div class="product-grid">' + products.map(function (p) {
      var disabled = !p.in_stock;
      var color = categoryColor_(p.category_id);
      var cardStyle = color ? 'border-top:3px solid ' + color + ';background:linear-gradient(' + color + '10,' + color + '10),var(--surface)' : '';
      return '<div class="product-card ' + (disabled ? 'out-of-stock' : '') + '" style="' + cardStyle + '" data-id="' + p.product_id + '">' +
        '<div class="thumb">' + (p.image_url ? '<img src="' + p.image_url + '" loading="lazy">' : '🍱') +
        (p.is_frozen ? '<span class="frozen-badge" title="อาหารแช่แข็ง (Freezing)">' + Icon('snowflake', 14) + '</span>' : '') +
        (p.track_stock ? '<span class="stock-badge">' + (disabled ? 'สินค้าหมด' : 'เหลือ ' + p.stock_qty + ' ' + p.unit) + '</span>' : '') +
        '</div><div class="body"><div class="name">' + UI.escapeHtml(p.name) + '</div><div class="price">' + UI.money(p.price) + (p.unit ? '<span class="price-unit">/' + UI.escapeHtml(p.unit) + '</span>' : '') + '</div>' +
        '<div class="card-controls">' + cardControlHtml(p) + '</div>' +
        '</div></div>';
    }).join('') + '</div>';

    el.querySelectorAll('.product-card:not(.out-of-stock) .thumb, .product-card:not(.out-of-stock) .name').forEach(function (part) {
      part.onclick = function () { location.hash = '#/product/' + part.closest('.product-card').dataset.id; };
    });
    el.querySelectorAll('.card-controls').forEach(bindCardControl);
  }

  /** ผูก event ให้สเต็ปเปอร์/ปุ่มเพิ่มภายใน .card-controls หนึ่งอัน (เรียกซ้ำได้หลัง re-render) */
  function bindCardControl(controls) {
    var addBtn = controls.querySelector('.addOptBtn');
    if (addBtn) addBtn.onclick = function (e) { e.stopPropagation(); location.hash = '#/product/' + addBtn.dataset.id; };
    var plusBtn = controls.querySelector('.qsPlus:not([disabled])');
    if (plusBtn) plusBtn.onclick = function (e) {
      e.stopPropagation();
      var p = products.filter(function (x) { return x.product_id === plusBtn.dataset.id; })[0];
      if (!p) return;
      if (cartQtyFor(p.product_id) >= maxQtyFor_(p)) { UI.toast('มีสินค้าไม่พอ (เหลือ ' + p.stock_qty + ' ' + p.unit + ')', 'error'); return; }
      State.addToCart({ product_id: p.product_id, product_name: p.name, image_url: p.image_url, unit_price: p.price, qty: 1, options: [], option_names: [], note: '', is_frozen: p.is_frozen });
      refreshCardControl(p, controls);
    };
    var minusBtn = controls.querySelector('.qsMinus');
    if (minusBtn) minusBtn.onclick = function (e) {
      e.stopPropagation();
      var key = minusBtn.dataset.id;
      var idx = State.cart.findIndex(function (i) { return i.product_id === key && (!i.options || !i.options.length) && !i.note; });
      if (idx === -1) return;
      State.updateCartQty(idx, State.cart[idx].qty - 1);
      var p = products.filter(function (x) { return x.product_id === key; })[0];
      if (p) refreshCardControl(p, controls);
    };
  }

  function refreshCardControl(p, controls) {
    controls.innerHTML = cardControlHtml(p);
    bindCardControl(controls);
    refreshCartBadge();
  }

  function refreshCartBadge() {
    var badge = document.getElementById('cartBadge');
    if (!badge) return;
    badge.textContent = State.cartCount();
    badge.style.display = State.cartCount() > 0 ? 'flex' : 'none';
  }

  return function cleanup() { clearInterval(countdownTimer); clearInterval(bannerTimer); };
};
