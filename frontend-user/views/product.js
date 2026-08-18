/**
 * views/product.js — รายละเอียดสินค้าแบบ Bottom Sheet (#/product/:id)
 */
Views.product = function (container, params) {
  var productId = params[0];
  var qty = 1, selected = {}; // group_name -> [option_id]

  container.innerHTML = UI.loading();

  Api.call('catalog.getProductDetail', { product_id: productId }).then(function (p) {
    render(p);
  }).catch(function (err) {
    UI.toast(err.message, 'error');
    location.hash = '#/home';
  });

  function render(p) {
    p.option_groups.forEach(function (g) { selected[g.group_name] = []; });

    container.innerHTML =
      '<div class="sheet-backdrop" id="backdrop"></div>' +
      '<div class="sheet" style="position:fixed;bottom:0">' +
        '<div class="sheet-handle"></div>' +
        '<div style="aspect-ratio:16/9;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:60px">' +
          (p.image_url ? '<img src="' + p.image_url + '" style="width:100%;height:100%;object-fit:cover">' : '🍱') +
        '</div>' +
        '<div class="container">' +
          '<h2 style="margin:0 0 4px;display:flex;align-items:center;gap:8px">' + UI.escapeHtml(p.name) +
            (p.is_frozen ? '<span style="color:#2563eb" title="อาหารแช่แข็ง">' + Icon('snowflake', 18) + '</span>' : '') + '</h2>' +
          '<div style="color:var(--primary);font-weight:800;font-size:18px;margin-bottom:8px">' + UI.money(p.price) + ' / ' + UI.escapeHtml(p.unit) + '</div>' +
          (!p.in_stock ? '<div class="empty-state" style="padding:14px;color:#dc2626;font-weight:700">สินค้าหมด</div>' : '') +
          '<p style="color:var(--text-muted);font-size:14px">' + UI.escapeHtml(p.description || '') + '</p>' +
          '<div id="optionGroups" style="' + (!p.in_stock ? 'opacity:.5;pointer-events:none' : '') + '"></div>' +
          '<div class="form-group" style="' + (!p.in_stock ? 'opacity:.5;pointer-events:none' : '') + '"><label>หมายเหตุ</label><textarea id="noteInput" class="form-control" rows="2" placeholder=""></textarea></div>' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin:16px 0;' + (!p.in_stock ? 'opacity:.5;pointer-events:none' : '') + '">' +
            '<span style="font-weight:600">จำนวน</span>' +
            '<div class="qty-control"><button id="qtyMinus">−</button><span id="qtyVal">1</span><button id="qtyPlus">+</button></div>' +
          '</div>' +
          (p.in_stock
            ? '<button id="addBtn" class="btn btn-primary btn-block">เพิ่มลงตะกร้า ' + UI.money(p.price) + '</button>'
            : '<button id="addBtn" class="btn btn-primary btn-block" disabled style="opacity:.5;cursor:not-allowed">สินค้าหมด</button>') +
        '</div>' +
      '</div>';

    document.getElementById('backdrop').onclick = function () { location.hash = '#/home'; };

    if (!p.in_stock) return; // แสดงหน้าแบบ dim ไว้ ไม่เตะผู้ใช้กลับหน้าแรกทันที

    var maxQty = p.track_stock ? Math.min(p.stock_qty, p.max_per_order || 999) : (p.max_per_order || 999);

    var groupsEl = document.getElementById('optionGroups');
    groupsEl.innerHTML = p.option_groups.map(function (g) {
      return '<div class="option-group" data-group="' + UI.escapeHtml(g.group_name) + '">' +
        '<div class="label"><span>' + UI.escapeHtml(g.group_name) + (g.is_required ? ' *' : '') + '</span><span style="color:var(--text-muted);font-weight:400">เลือกได้ ' + g.max_select + '</span></div>' +
        g.options.map(function (o) {
          return '<div class="option-row opt-item" data-group="' + UI.escapeHtml(g.group_name) + '" data-id="' + o.option_id + '" data-max="' + g.max_select + '">' +
            '<span>' + UI.escapeHtml(o.option_name) + '</span><span>' + (o.price_delta ? (o.price_delta > 0 ? '+' : '') + UI.money(o.price_delta) : '') + '</span></div>';
        }).join('') + '</div>';
    }).join('');

    groupsEl.querySelectorAll('.opt-item').forEach(function (row) {
      row.style.cursor = 'pointer';
      row.onclick = function () {
        var group = row.dataset.group, id = row.dataset.id, max = Number(row.dataset.max);
        var arr = selected[group];
        var idx = arr.indexOf(id);
        if (idx > -1) { arr.splice(idx, 1); row.style.background = ''; }
        else {
          if (max === 1) {
            groupsEl.querySelectorAll('.opt-item[data-group="' + CSS.escape(group) + '"]').forEach(function (r) { r.style.background = ''; });
            selected[group] = [id];
          } else {
            if (arr.length >= max) { UI.toast('เลือกได้สูงสุด ' + max + ' รายการ', 'error'); return; }
            arr.push(id);
          }
          row.style.background = 'rgba(22,163,74,.12)';
        }
        updatePrice(p);
      };
    });

    document.getElementById('qtyMinus').onclick = function () { if (qty > 1) { qty--; syncQty(p); } };
    document.getElementById('qtyPlus').onclick = function () { if (qty < maxQty) { qty++; syncQty(p); } else UI.toast('สั่งได้สูงสุด ' + maxQty + ' ชิ้น', 'error'); };
    syncQty(p);

    document.getElementById('addBtn').onclick = function () {
      for (var g = 0; g < p.option_groups.length; g++) {
        var grp = p.option_groups[g];
        if (grp.is_required && selected[grp.group_name].length === 0) { UI.toast('กรุณาเลือก "' + grp.group_name + '"', 'error'); return; }
      }
      var allOptionIds = [];
      var optionNames = [];
      Object.keys(selected).forEach(function (g) {
        selected[g].forEach(function (id) {
          allOptionIds.push(id);
          var opt = flatOptions(p).find(function (o) { return o.option_id === id; });
          if (opt) optionNames.push(opt.option_name);
        });
      });
      var unitPrice = computeUnitPrice(p);
      State.addToCart({
        product_id: p.product_id, product_name: p.name, image_url: p.image_url, unit_price: unitPrice,
        qty: qty, options: allOptionIds, option_names: optionNames, note: document.getElementById('noteInput').value.trim(),
        is_frozen: !!p.is_frozen
      });
      UI.toast('เพิ่มลงตะกร้าแล้ว', 'success');
      location.hash = '#/home';
    };
  }

  function flatOptions(p) { var all = []; p.option_groups.forEach(function (g) { all = all.concat(g.options); }); return all; }
  function computeUnitPrice(p) {
    var delta = 0;
    Object.keys(selected).forEach(function (g) { selected[g].forEach(function (id) {
      var opt = flatOptions(p).find(function (o) { return o.option_id === id; });
      if (opt) delta += opt.price_delta;
    }); });
    return p.price + delta;
  }
  function updatePrice(p) {
    var total = computeUnitPrice(p) * qty;
    document.getElementById('addBtn').textContent = 'เพิ่มลงตะกร้า ' + UI.money(total);
  }
  function syncQty(p) { document.getElementById('qtyVal').textContent = qty; updatePrice(p); }
};
