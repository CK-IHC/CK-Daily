/**
 * views/products.js — CRUD สินค้า + หมวดหมู่ + ตัวเลือกสินค้า
 */
var CATEGORY_ICON_OPTIONS_ = [
  { key: 'catRice', label: 'ข้าว' }, { key: 'catNoodle', label: 'เส้น/ก๋วยเตี๋ยว' }, { key: 'catChicken', label: 'ไก่' },
  { key: 'catMeat', label: 'เนื้อสัตว์' }, { key: 'catFish', label: 'ปลา/แซลมอน' }, { key: 'catSalad', label: 'สลัด/เพื่อสุขภาพ' },
  { key: 'catCake', label: 'เค้ก' }, { key: 'catDessert', label: 'ของหวาน' }, { key: 'catBread', label: 'เบเกอรี่/ขนมปัง' },
  { key: 'catHotDrink', label: 'เครื่องดื่มร้อน' }, { key: 'catColdDrink', label: 'เครื่องดื่มเย็น' }, { key: 'catLunchbox', label: 'ข้าวกล่อง' },
  { key: 'catSoup', label: 'ซุป/แกง' }, { key: 'snowflake', label: 'แช่แข็ง' }, { key: 'catBox', label: 'อื่นๆ' }
];
var CATEGORY_COLOR_OPTIONS_ = ['#f97316', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#eab308', '#14b8a6', '#ec4899', '#64748b'];

Views.products = function (container) {
  var tab = 'products', categories = [], products = [];

  container.innerHTML =
    '<div class="tabs-row no-print"><button class="tab-btn active" data-tab="products">สินค้า</button><button class="tab-btn" data-tab="categories">หมวดหมู่</button></div>' +
    '<div class="card"><div class="card-head"><h3 id="tabTitle">รายการสินค้า</h3><div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">' +
      '<button id="btnPrint" class="btn btn-outline">🖨️ พิมพ์</button> ' +
      '<button id="btnExport" class="btn btn-outline">Export CSV</button> ' +
      '<span id="csvControls"><button id="btnCsvTemplate" class="btn btn-outline" title="ดาวน์โหลดไฟล์ตัวอย่างสำหรับนำเข้า CSV">📄 ไฟล์ตัวอย่าง CSV</button> ' +
      '<label class="btn btn-outline" style="cursor:pointer">นำเข้า CSV<input type="file" id="csvInput" accept=".csv" style="display:none"></label></span> ' +
      '<button id="btnAdd" class="btn btn-primary">+ เพิ่มสินค้า</button></div></div>' +
    '<div id="csvHelp" class="no-print" style="font-size:12px;color:var(--text-muted);padding:0 16px 12px">รูปแบบไฟล์ CSV: <b>sku</b> (บังคับ, ใช้จับคู่สินค้าเดิม), <b>name</b>, <b>category_name</b> (ต้องตรงกับชื่อหมวดหมู่ที่มีอยู่), ' +
      '<b>price</b>, <b>cost_price</b>, <b>unit</b>, <b>is_frozen</b> (true/false), <b>track_stock</b> (true/false), <b>stock_qty</b>, <b>reorder_point</b>, <b>max_per_order</b>, <b>is_active</b> (true/false) — ' +
      'ถ้า sku มีอยู่แล้วจะอัปเดตเฉพาะคอลัมน์ที่กรอก ถ้าไม่มีจะสร้างใหม่ (ต้องมี name/price/category_name ครบ)</div>' +
    '<div id="area">' + UI.loading() + '</div></div>';

  container.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.onclick = function () {
      container.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active'); tab = btn.dataset.tab;
      document.getElementById('tabTitle').textContent = tab === 'products' ? 'รายการสินค้า' : 'หมวดหมู่สินค้า';
      document.getElementById('btnAdd').textContent = tab === 'products' ? '+ เพิ่มสินค้า' : '+ เพิ่มหมวดหมู่';
      document.getElementById('csvControls').style.display = tab === 'products' ? '' : 'none';
      document.getElementById('csvHelp').style.display = tab === 'products' ? '' : 'none';
      renderCurrentTab();
    };
  });
  document.getElementById('btnAdd').onclick = function () { tab === 'products' ? openProductModal() : openCategoryModal(); };
  document.getElementById('btnPrint').onclick = function () { UI.printWithHeader(tab === 'products' ? 'รายการสินค้า' : 'หมวดหมู่สินค้า', document.getElementById('area')); };
  document.getElementById('btnExport').onclick = function () {
    if (tab === 'products') {
      UI.exportCsv('products.csv', lastFilteredProducts.map(function (p) { return { sku: p.sku, name: p.name, category: catName(p.category_id), price: p.price, cost_price: p.cost_price, is_frozen: p.is_frozen, track_stock: p.track_stock, stock_qty: p.stock_qty, is_active: p.is_active }; }));
    } else {
      UI.exportCsv('categories.csv', categories.map(function (c) { return { name: c.name, icon: c.icon, color: c.color, sort_order: c.sort_order, is_active: c.is_active }; }));
    }
  };
  document.getElementById('btnCsvTemplate').onclick = function () {
    var csv = 'sku,name,category_name,price,cost_price,unit,is_frozen,track_stock,stock_qty,reorder_point,max_per_order,is_active\n' +
      'SKU-NEW-01,ข้าวผัดกุ้ง,อาหารจานหลัก,60,35,จาน,false,true,20,5,10,true\n';
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'products-import-template.csv';
    link.click();
  };
  document.getElementById('csvInput').onchange = function (e) {
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var lines = reader.result.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      var header = lines[0].split(',').map(function (h) { return h.trim().toLowerCase(); });
      var rows = lines.slice(1).map(function (line) {
        var cols = line.split(',');
        var row = {}; header.forEach(function (h, i) { row[h] = (cols[i] || '').trim(); });
        return row;
      });
      Api.call('admin.products.importCsv', { rows: rows }).then(function (results) {
        var ok = results.filter(function (r) { return r.ok; }).length;
        UI.toast('นำเข้าสำเร็จ ' + ok + '/' + results.length, ok === results.length ? 'success' : 'error');
        loadAll();
      }).catch(function (err) { UI.toast(err.message, 'error'); });
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  function loadAll() {
    Promise.all([Api.call('admin.categories.list'), Api.call('admin.products.list')]).then(function (res) {
      categories = res[0]; products = res[1]; renderCurrentTab();
    }).catch(function (err) { UI.toast(err.message, 'error'); });
  }
  function renderCurrentTab() { tab === 'products' ? renderProducts() : renderCategories(); }

  function catName(id) { var c = categories.filter(function (x) { return x.category_id === id; })[0]; return c ? c.name : '-'; }

  var lastFilteredProducts = [];

  /**
   * แสดงตัวกรอง (ค้นหา SKU/ชื่อ แบบพิมพ์แล้วกรองทันที + หมวดหมู่ + สถานะขาย) แยกส่วนกับตารางเสมอ (ไม่
   * rebuild ช่องค้นหาทุกครั้งที่กรอง) กันปัญหา cursor/focus หลุดจากช่องพิมพ์ตอนกรองแบบ live ทุกตัวอักษร
   */
  function renderProducts() {
    var el = document.getElementById('area');
    if (!el) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อนตอบกลับ
    if (!products.length) { el.innerHTML = '<div class="empty-state">ยังไม่มีสินค้า</div>'; return; }
    el.innerHTML =
      '<div class="filters-row no-print" style="margin-bottom:10px">' +
        '<input id="productSearchInput" class="form-control" placeholder="ค้นหา SKU หรือชื่อสินค้า" style="min-width:220px">' +
        '<select id="productCategorySelect" class="form-control" style="width:auto"><option value="">ทุกหมวดหมู่</option>' +
          categories.map(function (c) { return '<option value="' + c.category_id + '">' + UI.escapeHtml(c.name) + '</option>'; }).join('') +
        '</select>' +
        '<select id="productActiveSelect" class="form-control" style="width:auto"><option value="">ทุกสถานะ</option><option value="1">เปิดขาย</option><option value="0">ปิดขาย</option></select>' +
      '</div>' +
      '<div id="productsTableWrap"></div>';
    document.getElementById('productSearchInput').oninput = applyProductFilters_;
    document.getElementById('productCategorySelect').onchange = applyProductFilters_;
    document.getElementById('productActiveSelect').onchange = applyProductFilters_;
    applyProductFilters_();
  }

  function applyProductFilters_() {
    var wrap = document.getElementById('productsTableWrap');
    if (!wrap) return;
    var q = (document.getElementById('productSearchInput').value || '').trim().toLowerCase();
    var categoryId = document.getElementById('productCategorySelect').value;
    var activeFilter = document.getElementById('productActiveSelect').value;
    lastFilteredProducts = products.filter(function (p) {
      if (categoryId && p.category_id !== categoryId) return false;
      if (activeFilter !== '' && !!p.is_active !== (activeFilter === '1')) return false;
      if (q && (p.sku || '').toLowerCase().indexOf(q) === -1 && (p.name || '').toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    renderProductsTable_(wrap, lastFilteredProducts);
  }

  function renderProductsTable_(wrap, rows) {
    if (!rows.length) { wrap.innerHTML = '<div class="empty-state">ไม่พบสินค้าตามเงื่อนไข</div>'; return; }
    wrap.innerHTML = '<div class="table-wrap"><table id="productsPrintTable"><thead><tr><th>SKU</th><th>ชื่อ</th><th>หมวดหมู่</th><th>ราคา</th><th>ต้นทุน</th><th>สต็อก</th><th>สถานะ</th><th class="no-print">จัดการ</th></tr></thead><tbody>' +
      rows.map(function (p) {
        return '<tr><td>' + p.sku + '</td><td>' + (p.is_frozen ? '<b>[แช่แข็ง]</b> ' : '') + UI.escapeHtml(p.name) + '</td><td>' + UI.escapeHtml(catName(p.category_id)) + '</td><td>' + UI.money(p.price) + '</td><td>' + UI.money(p.cost_price) + '</td>' +
          '<td>' + (p.track_stock ? p.stock_qty : '-') + '</td><td><span class="chip ' + (p.is_active ? 'active' : 'cancelled') + '">' + (p.is_active ? 'เปิดขาย' : 'ปิดขาย') + '</span></td>' +
          '<td class="no-print"><button class="btn btn-sm btn-outline" data-edit="' + p.product_id + '">แก้ไข</button> <button class="btn btn-sm btn-outline" data-opts="' + p.product_id + '">ตัวเลือก</button> <button class="btn btn-sm btn-outline" data-toggle="' + p.product_id + '">' + (p.is_active ? 'ปิดขาย' : 'เปิดขาย') + '</button> <button class="btn btn-sm btn-danger" data-del="' + p.product_id + '">' + Icon('trash', 13) + '</button>' +
          (p.track_stock
            ? '<br><button class="btn btn-sm btn-outline" style="margin-top:4px" data-stock="in" data-id="' + p.product_id + '" data-name="' + UI.escapeHtml(p.name) + '">รับเข้า</button> ' +
              '<button class="btn btn-sm btn-outline" data-stock="adjust" data-id="' + p.product_id + '" data-name="' + UI.escapeHtml(p.name) + '">ปรับยอด</button> ' +
              '<button class="btn btn-sm btn-danger" data-stock="waste" data-id="' + p.product_id + '" data-name="' + UI.escapeHtml(p.name) + '">ตัดของเสีย</button>'
            : '') +
          '</td></tr>';
      }).join('') + '</tbody></table></div>';
    wrap.querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function () { openProductModal(products.filter(function (p) { return p.product_id === b.dataset.edit; })[0]); }; });
    wrap.querySelectorAll('[data-opts]').forEach(function (b) { b.onclick = function () { openProductOptionsModal(products.filter(function (p) { return p.product_id === b.dataset.opts; })[0]); }; });
    wrap.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { if (confirm('ลบสินค้านี้?')) Api.call('admin.products.delete', { product_id: b.dataset.del }).then(function () { UI.toast('ลบแล้ว', 'success'); loadAll(); }).catch(function (err) { UI.toast(err.message, 'error'); }); }; });
    wrap.querySelectorAll('[data-toggle]').forEach(function (b) { b.onclick = function () { Api.call('admin.products.toggleActive', { product_id: b.dataset.toggle }).then(function () { UI.toast('อัปเดตแล้ว', 'success'); loadAll(); }); }; });
    // ปรับสต็อก (รับเข้า/ปรับยอด/ตัดของเสีย) ได้ตรงจากหน้ารายการสินค้าเลย ไม่ต้องสลับไปหน้า "จัดการสต็อก"
    // ใช้ modal กลางร่วมกับหน้าจัดการสต็อก (ดู openStockAdjustModal_ ใน views/stock.js)
    wrap.querySelectorAll('[data-stock]').forEach(function (b) { b.onclick = function () { openStockAdjustModal_(b.dataset.stock, b.dataset.id, b.dataset.name, loadAll); }; });
    UI.makeTableSortable(wrap.querySelector('table'));
  }

  /**
   * จัดการตัวเลือกสินค้า (ไซส์/รสชาติ ฯลฯ) ของสินค้าหนึ่งชิ้น — จัดกลุ่มตาม group_name ฝั่ง UI เอง เพราะ backend
   * เก็บทีละ option เป็นแถว ไม่มี entity กลุ่มแยกต่างหาก ทุกตัวเลือกในกลุ่มเดียวกันต้องมี is_required/max_select ตรงกันเสมอ
   * (ฝั่งลูกค้าอ่านค่าจากตัวเลือกตัวแรกของกลุ่มเป็นตัวแทนทั้งกลุ่ม)
   */
  function openProductOptionsModal(product) {
    var options = [];
    var m = UI.modal('<button class="modal-close" onclick="this.closest(\'.modal-backdrop\').remove()">✕</button>' +
      '<h3>ตัวเลือกสินค้า — ' + UI.escapeHtml(product.name) + '</h3>' +
      '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">เช่น ไซส์ (S/M/L), ระดับความเผ็ด, ท็อปปิ้งเสริม ฯลฯ — ลูกค้าจะเห็นตัวเลือกเหล่านี้ในหน้ารายละเอียดสินค้า</div>' +
      '<div id="optGroupsArea">' + UI.loading() + '</div>' +
      '<button id="btnNewGroup" class="btn btn-outline btn-block" style="margin-top:10px">+ สร้างกลุ่มตัวเลือกใหม่</button>');
    document.getElementById('btnNewGroup').onclick = function () { openGroupSettingsModal(null); };
    load();

    function load() {
      Api.call('admin.productOptions.list', { product_id: product.product_id }).then(function (rows) { options = rows; render(); }).catch(function (err) { UI.toast(err.message, 'error'); });
    }

    function groups() {
      var g = {};
      options.forEach(function (o) {
        if (!g[o.group_name]) g[o.group_name] = { group_name: o.group_name, is_required: o.is_required, max_select: o.max_select, options: [] };
        g[o.group_name].options.push(o);
      });
      return Object.keys(g).map(function (k) { return g[k]; });
    }

    function render() {
      var area = document.getElementById('optGroupsArea');
      if (!area) return; // ปิด modal ไปแล้วก่อนตอบกลับ
      var gs = groups();
      if (!gs.length) { area.innerHTML = '<div class="empty-state">ยังไม่มีกลุ่มตัวเลือก</div>'; return; }
      area.innerHTML = gs.map(function (g) {
        return '<div class="card" style="margin:0 0 10px;box-shadow:none;border:1px solid var(--border)">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
            '<div><b>' + UI.escapeHtml(g.group_name) + '</b> ' +
              (boolFromJs_(g.is_required) ? '<span class="chip active" style="font-size:10px">บังคับเลือก</span>' : '') +
              ' <span style="font-size:11px;color:var(--text-muted)">เลือกได้สูงสุด ' + g.max_select + '</span></div>' +
            '<div><button class="btn btn-sm btn-outline" data-edit-group="' + UI.escapeHtml(g.group_name) + '">แก้ไขกลุ่ม</button> ' +
              '<button class="btn btn-sm btn-danger" data-del-group="' + UI.escapeHtml(g.group_name) + '">ลบทั้งกลุ่ม</button></div>' +
          '</div>' +
          '<div class="table-wrap"><table><thead><tr><th>ตัวเลือก</th><th>ราคาเพิ่ม/ลด</th><th></th></tr></thead><tbody>' +
          g.options.map(function (o) {
            return '<tr><td>' + UI.escapeHtml(o.option_name) + '</td><td>' + (numFromJs_(o.price_delta) > 0 ? '+' : '') + UI.money(o.price_delta) + '</td>' +
              '<td style="text-align:right"><button class="btn btn-sm btn-outline" data-edit-opt="' + o.option_id + '">แก้ไข</button> <button class="btn btn-sm btn-danger" data-del-opt="' + o.option_id + '">' + Icon('trash', 12) + '</button></td></tr>';
          }).join('') + '</tbody></table></div>' +
          '<button class="btn btn-sm btn-outline" data-add-opt="' + UI.escapeHtml(g.group_name) + '" style="margin-top:8px">+ เพิ่มตัวเลือกในกลุ่มนี้</button>' +
        '</div>';
      }).join('');

      area.querySelectorAll('[data-edit-group]').forEach(function (b) {
        b.onclick = function () { openGroupSettingsModal(gs.filter(function (g) { return g.group_name === b.dataset.editGroup; })[0]); };
      });
      area.querySelectorAll('[data-del-group]').forEach(function (b) {
        b.onclick = function () {
          if (!confirm('ลบตัวเลือกทั้งกลุ่ม "' + b.dataset.delGroup + '"?')) return;
          var g = gs.filter(function (x) { return x.group_name === b.dataset.delGroup; })[0];
          Promise.all(g.options.map(function (o) { return Api.call('admin.productOptions.delete', { option_id: o.option_id }); }))
            .then(function () { UI.toast('ลบกลุ่มแล้ว', 'success'); load(); }).catch(function (err) { UI.toast(err.message, 'error'); });
        };
      });
      area.querySelectorAll('[data-add-opt]').forEach(function (b) {
        b.onclick = function () { openOptionFormModal(null, gs.filter(function (g) { return g.group_name === b.dataset.addOpt; })[0]); };
      });
      area.querySelectorAll('[data-edit-opt]').forEach(function (b) {
        b.onclick = function () { openOptionFormModal(options.filter(function (o) { return o.option_id === b.dataset.editOpt; })[0], null); };
      });
      area.querySelectorAll('[data-del-opt]').forEach(function (b) {
        b.onclick = function () {
          if (!confirm('ลบตัวเลือกนี้?')) return;
          Api.call('admin.productOptions.delete', { option_id: b.dataset.delOpt }).then(function () { UI.toast('ลบแล้ว', 'success'); load(); }).catch(function (err) { UI.toast(err.message, 'error'); });
        };
      });
    }

    /** สร้างกลุ่มใหม่ (พร้อมตัวเลือกแรก) หรือแก้ไขการตั้งค่ากลุ่มเดิม (ชื่อกลุ่ม/บังคับเลือก/เลือกได้กี่อัน) — แก้กลุ่มแล้ว sync ทุกตัวเลือกในกลุ่มให้ตรงกัน */
    function openGroupSettingsModal(g) {
      var isNew = !g;
      var gm = UI.modal('<button class="modal-close" onclick="this.closest(\'.modal-backdrop\').remove()">✕</button>' +
        '<h3>' + (isNew ? 'สร้างกลุ่มตัวเลือกใหม่' : 'แก้ไขกลุ่ม "' + UI.escapeHtml(g.group_name) + '"') + '</h3>' +
        '<div class="form-group"><label>ชื่อกลุ่ม (เช่น ไซส์, ระดับความเผ็ด)</label><input id="gName" class="form-control" value="' + (g ? UI.escapeHtml(g.group_name) : '') + '"></div>' +
        '<div class="form-group"><label><input type="checkbox" id="gRequired" ' + (g && boolFromJs_(g.is_required) ? 'checked' : '') + '> บังคับให้ลูกค้าต้องเลือก</label></div>' +
        '<div class="form-group"><label>เลือกได้สูงสุดกี่ตัวเลือกในกลุ่มนี้</label><input id="gMax" type="number" min="1" class="form-control" value="' + (g ? g.max_select : 1) + '"></div>' +
        (isNew ? '<div class="form-group"><label>ตัวเลือกแรก</label><input id="gFirstOptName" class="form-control" placeholder="เช่น ไซส์ M"></div>' +
          '<div class="form-group"><label>ราคาเพิ่ม/ลด (บาท ใส่ติดลบได้)</label><input id="gFirstOptPrice" type="number" class="form-control" value="0"></div>' : '') +
        '<button id="gSubmit" class="btn btn-primary" style="width:100%">บันทึก</button>'
      );
      document.getElementById('gSubmit').onclick = function () {
        var name = document.getElementById('gName').value.trim();
        if (!name) { UI.toast('กรุณากรอกชื่อกลุ่ม', 'error'); return; }
        var required = document.getElementById('gRequired').checked;
        var max = Number(document.getElementById('gMax').value || 1);
        if (isNew) {
          var firstName = document.getElementById('gFirstOptName').value.trim();
          if (!firstName) { UI.toast('กรุณากรอกตัวเลือกแรกของกลุ่ม', 'error'); return; }
          Api.call('admin.productOptions.upsert', {
            product_id: product.product_id, group_name: name, option_name: firstName,
            price_delta: Number(document.getElementById('gFirstOptPrice').value || 0), is_required: required, max_select: max
          }).then(function () { UI.toast('สร้างกลุ่มแล้ว', 'success'); gm.remove(); load(); }).catch(function (err) { UI.toast(err.message, 'error'); });
        } else {
          // แก้ชื่อกลุ่ม/required/max_select แล้ว sync ให้ทุกตัวเลือกในกลุ่มเดิมตรงกันหมด (ทีละ request เพราะ backend อัปเดตได้ทีละแถว)
          Promise.all(g.options.map(function (o) {
            return Api.call('admin.productOptions.upsert', {
              option_id: o.option_id, product_id: product.product_id, group_name: name, option_name: o.option_name,
              price_delta: numFromJs_(o.price_delta), is_required: required, max_select: max
            });
          })).then(function () { UI.toast('บันทึกกลุ่มแล้ว', 'success'); gm.remove(); load(); }).catch(function (err) { UI.toast(err.message, 'error'); });
        }
      };
    }

    /** เพิ่ม/แก้ไขตัวเลือกหนึ่งรายการภายในกลุ่มที่มีอยู่แล้ว (ไม่แก้การตั้งค่ากลุ่ม ใช้ openGroupSettingsModal แทน) */
    function openOptionFormModal(existingOpt, group) {
      var g = group || { group_name: existingOpt.group_name, is_required: existingOpt.is_required, max_select: existingOpt.max_select };
      var om = UI.modal('<button class="modal-close" onclick="this.closest(\'.modal-backdrop\').remove()">✕</button>' +
        '<h3>' + (existingOpt ? 'แก้ไขตัวเลือก' : 'เพิ่มตัวเลือกในกลุ่ม "' + UI.escapeHtml(g.group_name) + '"') + '</h3>' +
        '<div class="form-group"><label>ชื่อตัวเลือก</label><input id="oName" class="form-control" value="' + (existingOpt ? UI.escapeHtml(existingOpt.option_name) : '') + '"></div>' +
        '<div class="form-group"><label>ราคาเพิ่ม/ลด (บาท ใส่ติดลบได้)</label><input id="oPrice" type="number" class="form-control" value="' + (existingOpt ? existingOpt.price_delta : 0) + '"></div>' +
        '<button id="oSubmit" class="btn btn-primary" style="width:100%">บันทึก</button>'
      );
      document.getElementById('oSubmit').onclick = function () {
        var name = document.getElementById('oName').value.trim();
        if (!name) { UI.toast('กรุณากรอกชื่อตัวเลือก', 'error'); return; }
        var payload = {
          product_id: product.product_id, group_name: g.group_name, option_name: name,
          price_delta: Number(document.getElementById('oPrice').value || 0), is_required: boolFromJs_(g.is_required), max_select: numFromJs_(g.max_select) || 1
        };
        if (existingOpt) payload.option_id = existingOpt.option_id;
        Api.call('admin.productOptions.upsert', payload).then(function () { UI.toast('บันทึกแล้ว', 'success'); om.remove(); load(); }).catch(function (err) { UI.toast(err.message, 'error'); });
      };
    }
  }

  function boolFromJs_(v) { return v === true || v === 'true' || v === 1 || v === '1'; }
  function numFromJs_(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

  function renderCategories() {
    var el = document.getElementById('area');
    if (!el) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อนตอบกลับ
    if (!categories.length) { el.innerHTML = '<div class="empty-state">ยังไม่มีหมวดหมู่</div>'; return; }
    el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>สี</th><th>ไอคอน</th><th>ชื่อ</th><th>ลำดับ</th><th>สถานะ</th><th class="no-print">จัดการ</th></tr></thead><tbody>' +
      categories.map(function (c) {
        return '<tr><td><span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:' + (c.color || '#f97316') + ';border:1px solid var(--border)"></span></td>' +
        '<td>' + CategoryIconHtml(c.icon, 20) + '</td><td>' + UI.escapeHtml(c.name) + '</td><td>' + c.sort_order + '</td><td><span class="chip ' + (c.is_active ? 'active' : 'cancelled') + '">' + (c.is_active ? 'เปิด' : 'ปิด') + '</span></td>' +
        '<td class="no-print"><button class="btn btn-sm btn-outline" data-edit-cat="' + c.category_id + '">แก้ไข</button> <button class="btn btn-sm btn-danger" data-del-cat="' + c.category_id + '">ลบ</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    el.querySelectorAll('[data-edit-cat]').forEach(function (b) { b.onclick = function () { openCategoryModal(categories.filter(function (c) { return c.category_id === b.dataset.editCat; })[0]); }; });
    el.querySelectorAll('[data-del-cat]').forEach(function (b) { b.onclick = function () { if (confirm('ลบหมวดหมู่นี้?')) Api.call('admin.categories.delete', { category_id: b.dataset.delCat }).then(function () { UI.toast('ลบแล้ว', 'success'); loadAll(); }); }; });
    UI.makeTableSortable(el.querySelector('table'));
  }

  function openCategoryModal(cat) {
    var selectedIcon = cat && cat.icon ? cat.icon : CATEGORY_ICON_OPTIONS_[0].key;
    var selectedColor = cat && cat.color ? cat.color : CATEGORY_COLOR_OPTIONS_[0];
    var m = UI.modal(
      '<button class="modal-close" onclick="this.closest(\'.modal-backdrop\').remove()">✕</button><h3>' + (cat ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่') + '</h3>' +
      '<div class="form-group"><label>ชื่อ</label><input id="mCatName" class="form-control" value="' + (cat ? UI.escapeHtml(cat.name) : '') + '"></div>' +
      '<div class="form-group"><label>ไอคอน</label><div id="mCatIconPicker" style="display:flex;gap:8px;flex-wrap:wrap">' +
        CATEGORY_ICON_OPTIONS_.map(function (opt) {
          return '<span class="icon-swatch' + (opt.key === selectedIcon ? ' selected' : '') + '" data-icon="' + opt.key + '" title="' + opt.label + '" ' +
            'style="width:38px;height:38px;border-radius:10px;border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer">' +
            CategoryIconHtml(opt.key, 18) + '</span>';
        }).join('') + '</div><input type="hidden" id="mCatIcon" value="' + selectedIcon + '"></div>' +
      '<div class="form-group"><label>ลำดับ</label><input id="mCatSort" type="number" class="form-control" value="' + (cat ? cat.sort_order : 0) + '"></div>' +
      '<div class="form-group"><label>สี (ใช้แยกหมวดหมู่ให้เห็นชัด)</label><div id="mCatColorPicker" style="display:flex;gap:8px;flex-wrap:wrap">' +
        CATEGORY_COLOR_OPTIONS_.map(function (col) {
          return '<span class="color-swatch' + (col === selectedColor ? ' selected' : '') + '" data-color="' + col + '" style="background:' + col + '"></span>';
        }).join('') + '</div><input type="hidden" id="mCatColor" value="' + selectedColor + '"></div>' +
      '<button id="mCatSubmit" class="btn btn-primary" style="width:100%">บันทึก</button>'
    );
    document.getElementById('mCatIconPicker').querySelectorAll('.icon-swatch').forEach(function (sw) {
      sw.onclick = function () {
        document.getElementById('mCatIconPicker').querySelectorAll('.icon-swatch').forEach(function (s) { s.classList.remove('selected'); s.style.borderColor = 'var(--border)'; s.style.background = ''; });
        sw.classList.add('selected'); sw.style.borderColor = 'var(--primary)'; sw.style.background = 'rgba(249,115,22,.1)';
        document.getElementById('mCatIcon').value = sw.dataset.icon;
      };
      if (sw.classList.contains('selected')) { sw.style.borderColor = 'var(--primary)'; sw.style.background = 'rgba(249,115,22,.1)'; }
    });
    document.getElementById('mCatColorPicker').querySelectorAll('.color-swatch').forEach(function (sw) {
      sw.onclick = function () {
        document.getElementById('mCatColorPicker').querySelectorAll('.color-swatch').forEach(function (s) { s.classList.remove('selected'); });
        sw.classList.add('selected');
        document.getElementById('mCatColor').value = sw.dataset.color;
      };
    });
    document.getElementById('mCatSubmit').onclick = function () {
      var payload = {
        name: document.getElementById('mCatName').value.trim(), icon: document.getElementById('mCatIcon').value,
        color: document.getElementById('mCatColor').value, sort_order: Number(document.getElementById('mCatSort').value || 0)
      };
      if (!payload.name) { UI.toast('กรุณากรอกชื่อ', 'error'); return; }
      var action = cat ? 'admin.categories.update' : 'admin.categories.create';
      if (cat) payload.category_id = cat.category_id;
      Api.call(action, payload).then(function () { UI.toast('บันทึกแล้ว', 'success'); m.remove(); loadAll(); }).catch(function (err) { UI.toast(err.message, 'error'); });
    };
  }

  function openProductModal(p) {
    var isEdit = !!p;
    var m = UI.modal(
      '<button class="modal-close" onclick="this.closest(\'.modal-backdrop\').remove()">✕</button><h3>' + (isEdit ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า') + '</h3>' +
      '<div class="form-row"><div class="form-group"><label>SKU</label><input id="mSku" class="form-control" ' + (isEdit ? 'disabled' : '') + ' value="' + (p ? p.sku : '') + '"></div>' +
      '<div class="form-group"><label>ชื่อสินค้า</label><input id="mName" class="form-control" value="' + (p ? UI.escapeHtml(p.name) : '') + '"></div></div>' +
      '<div class="form-group"><label>หมวดหมู่</label><select id="mCat" class="form-control">' + categories.map(function (c) { return '<option value="' + c.category_id + '" ' + (p && p.category_id === c.category_id ? 'selected' : '') + '>' + UI.escapeHtml(c.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-group"><label>รายละเอียด</label><textarea id="mDesc" class="form-control" rows="2">' + (p ? UI.escapeHtml(p.description || '') : '') + '</textarea></div>' +
      '<div class="form-row"><div class="form-group"><label>ราคาขาย</label><input id="mPrice" type="number" class="form-control" value="' + (p ? p.price : '') + '"></div>' +
      '<div class="form-group"><label>ต้นทุน</label><input id="mCost" type="number" class="form-control" value="' + (p ? p.cost_price : '') + '"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>หน่วย</label><input id="mUnit" class="form-control" value="' + (p ? p.unit : 'ชิ้น') + '"></div>' +
      '<div class="form-group"><label>จำกัดต่อออเดอร์</label><input id="mMax" type="number" class="form-control" value="' + (p ? p.max_per_order : 10) + '"></div></div>' +
      '<div class="form-row"><div class="form-group"><label><input type="checkbox" id="mTrackStock" ' + (p && p.track_stock ? 'checked' : (isEdit ? '' : 'checked')) + '> ตัดสต็อก</label></div>' +
      '<div class="form-group"><label><input type="checkbox" id="mFrozen" ' + (p && p.is_frozen ? 'checked' : '') + '> ❄️ สินค้าแช่แข็ง</label></div></div>' +
      '<div class="form-row"><div class="form-group"><label>สต็อกคงเหลือ' + (isEdit ? ' (แก้ไขที่หน้าสต็อก)' : '') + '</label><input id="mStock" type="number" class="form-control" ' + (isEdit ? 'disabled' : '') + ' value="' + (p ? p.stock_qty : 0) + '"></div>' +
      '<div class="form-group"><label>จุดสั่งซื้อซ้ำ</label><input id="mReorder" type="number" class="form-control" value="' + (p ? p.reorder_point : 5) + '"></div></div>' +
      '<div class="form-group"><label>รูปภาพ</label><input type="file" id="mImage" accept="image/*" class="form-control">' +
      '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">แนะนำรูปสี่เหลี่ยมจัตุรัส ~800×800px ไม่เกิน 3MB (ไฟล์ใหญ่จะโหลดช้าในแอปลูกค้า)</div>' +
      (p && p.image_url ? '<img src="' + p.image_url + '" style="width:60px;height:60px;object-fit:cover;border-radius:8px;margin-top:6px">' : '') + '</div>' +
      '<button id="mSubmit" class="btn btn-primary" style="width:100%">บันทึกสินค้า</button>'
    );

    document.getElementById('mSubmit').onclick = function () {
      var payload = {
        sku: document.getElementById('mSku').value.trim(), name: document.getElementById('mName').value.trim(),
        category_id: document.getElementById('mCat').value, description: document.getElementById('mDesc').value.trim(),
        price: Number(document.getElementById('mPrice').value || 0), cost_price: Number(document.getElementById('mCost').value || 0),
        unit: document.getElementById('mUnit').value.trim(), max_per_order: Number(document.getElementById('mMax').value || 0),
        track_stock: document.getElementById('mTrackStock').checked, is_frozen: document.getElementById('mFrozen').checked,
        reorder_point: Number(document.getElementById('mReorder').value || 0)
      };
      if (!isEdit) payload.stock_qty = Number(document.getElementById('mStock').value || 0);
      if (!payload.sku || !payload.name || !payload.category_id) { UI.toast('กรุณากรอกข้อมูลให้ครบ', 'error'); return; }
      if (isEdit) payload.product_id = p.product_id;

      var fileInput = document.getElementById('mImage');
      if (fileInput.files[0] && fileInput.files[0].size > 5 * 1024 * 1024) {
        UI.toast('ไฟล์รูปใหญ่เกิน 5MB กรุณาเลือกรูปที่เล็กกว่านี้', 'error'); return;
      }
      var proceed = function () {
        var action = isEdit ? 'admin.products.update' : 'admin.products.create';
        Api.call(action, payload).then(function () { UI.toast('บันทึกสินค้าแล้ว', 'success'); m.remove(); loadAll(); }).catch(function (err) { UI.toast(err.message, 'error'); });
      };
      if (fileInput.files[0]) {
        var reader = new FileReader();
        reader.onload = function () { payload.image_base64 = reader.result; payload.image_name = fileInput.files[0].name; proceed(); };
        reader.readAsDataURL(fileInput.files[0]);
      } else proceed();
    };
  }

  loadAll();
};
