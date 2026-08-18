/**
 * views/stock.js — ยอดคงเหลือ, รับเข้า/ปรับปรุง/ตัดของเสีย, ประวัติการเคลื่อนไหว, นำเข้า CSV
 */
Views.stock = function (container) {
  var tab = 'list';
  var lastList = [], lastMovements = [];

  container.innerHTML =
    '<div class="tabs-row no-print"><button class="tab-btn active" data-tab="list">ยอดคงเหลือ</button><button class="tab-btn" data-tab="movements">ประวัติการเคลื่อนไหว</button></div>' +
    '<div class="card"><div class="card-head"><h3 id="tabTitle">ยอดคงเหลือ</h3>' +
      '<div class="no-print"><button id="btnPrint" class="btn btn-outline">🖨️ พิมพ์</button> ' +
      '<button id="btnExport" class="btn btn-outline">Export CSV</button> ' +
      '<button id="btnCsvTemplate" class="btn btn-outline" title="ดาวน์โหลดไฟล์ตัวอย่างสำหรับนำเข้า CSV">📄 ไฟล์ตัวอย่าง CSV</button> ' +
      '<label class="btn btn-outline btn-sm" style="cursor:pointer">นำเข้า CSV<input type="file" id="csvInput" accept=".csv" style="display:none"></label></div></div>' +
      '<div class="no-print" style="font-size:12px;color:var(--text-muted);padding:0 16px 12px">รูปแบบไฟล์ CSV: คอลัมน์ <b>sku</b> (รหัสสินค้า, บังคับ), <b>qty</b> (จำนวนที่รับเข้า, บังคับ), ' +
      '<b>cost_price</b> (ต้นทุนต่อหน่วยถ้ามีการเปลี่ยนแปลง, ไม่บังคับ), <b>reason</b> (เหตุผล, ไม่บังคับ) — แถวแรกต้องเป็นชื่อคอลัมน์ตามนี้ กด "ไฟล์ตัวอย่าง CSV" เพื่อดาวน์โหลดไฟล์ต้นแบบ</div>' +
    '<div id="area">' + UI.loading() + '</div></div>';

  document.getElementById('btnPrint').onclick = function () { UI.printWithHeader(tab === 'list' ? 'รายงานยอดคงเหลือสต็อก' : 'ประวัติการเคลื่อนไหวสต็อก', document.getElementById('area')); };
  document.getElementById('btnExport').onclick = function () {
    if (tab === 'list') {
      UI.exportCsv('stock-list.csv', lastList.map(function (r) { return { sku: r.sku, name: r.name, stock_qty: r.stock_qty, unit: r.unit, reorder_point: r.reorder_point, stock_value: r.stock_value, level: r.level }; }));
    } else {
      UI.exportCsv('stock-movements.csv', lastMovements.map(function (m) { return { created_at: m.created_at, product_id: m.product_id, type: m.type, qty_change: m.qty_change, qty_before: m.qty_before, qty_after: m.qty_after, ref_type: m.ref_type, ref_id: m.ref_id, reason: m.reason }; }));
    }
  };
  document.getElementById('btnCsvTemplate').onclick = function () {
    var csv = 'sku,qty,cost_price,reason\nSKU-EXAMPLE-01,10,25.5,รับสินค้าเข้าประจำสัปดาห์\n';
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'stock-import-template.csv';
    link.click();
  };

  container.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.onclick = function () {
      container.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active'); tab = btn.dataset.tab;
      document.getElementById('tabTitle').textContent = tab === 'list' ? 'ยอดคงเหลือ' : 'ประวัติการเคลื่อนไหว';
      tab === 'list' ? loadList() : loadMovements();
    };
  });

  document.getElementById('csvInput').onchange = function (e) {
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var lines = reader.result.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      var header = lines[0].split(',').map(function (h) { return h.trim().toLowerCase(); });
      var rows = lines.slice(1).map(function (line) {
        var cols = line.split(',');
        var row = {}; header.forEach(function (h, i) { row[h] = (cols[i] || '').trim(); });
        return { sku: row.sku, qty: Number(row.qty || 0), cost_price: row.cost_price ? Number(row.cost_price) : undefined, reason: row.reason || 'นำเข้าจาก CSV' };
      });
      Api.call('admin.stock.importCsv', { rows: rows }).then(function (results) {
        var ok = results.filter(function (r) { return r.ok; }).length;
        UI.toast('นำเข้าสำเร็จ ' + ok + '/' + results.length, ok === results.length ? 'success' : 'error');
        loadList();
      }).catch(function (err) { UI.toast(err.message, 'error'); });
    };
    reader.readAsText(file);
  };

  function loadList() {
    document.getElementById('area').innerHTML = UI.loading();
    Api.call('admin.stock.list').then(renderList).catch(function (err) { UI.toast(err.message, 'error'); });
  }

  function renderList(rows) {
    lastList = rows;
    var el = document.getElementById('area');
    if (!el) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อนตอบกลับ
    el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>SKU</th><th>ชื่อ</th><th>คงเหลือ</th><th>จุดสั่งซื้อ</th><th>มูลค่าคงคลัง</th><th>สถานะ</th><th class="no-print">จัดการ</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td>' + r.sku + '</td><td>' + UI.escapeHtml(r.name) + '</td><td>' + r.stock_qty + ' ' + r.unit + '</td><td>' + r.reorder_point + '</td><td>' + UI.money(r.stock_value) + '</td>' +
          '<td><span class="chip ' + r.level + '">' + { ok: 'ปกติ', low: 'ใกล้หมด', out: 'หมด' }[r.level] + '</span></td>' +
          '<td class="no-print"><button class="btn btn-sm btn-outline" data-action="in" data-id="' + r.product_id + '" data-name="' + UI.escapeHtml(r.name) + '">รับเข้า</button> ' +
          '<button class="btn btn-sm btn-outline" data-action="adjust" data-id="' + r.product_id + '" data-name="' + UI.escapeHtml(r.name) + '">ปรับยอด</button> ' +
          '<button class="btn btn-sm btn-danger" data-action="waste" data-id="' + r.product_id + '" data-name="' + UI.escapeHtml(r.name) + '">ตัดของเสีย</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    el.querySelectorAll('[data-action]').forEach(function (btn) { btn.onclick = function () { openAdjustModal(btn.dataset.action, btn.dataset.id, btn.dataset.name); }; });
    UI.makeTableSortable(el.querySelector('table'));
  }

  function openAdjustModal(type, productId, name) {
    var titleMap = { in: 'รับสินค้าเข้า', adjust: 'ปรับปรุงยอด (นับจริง)', waste: 'ตัดของเสีย' };
    var m = UI.modal(
      '<button class="modal-close" onclick="this.closest(\'.modal-backdrop\').remove()">✕</button><h3>' + titleMap[type] + ': ' + UI.escapeHtml(name) + '</h3>' +
      '<div class="form-group"><label>' + (type === 'adjust' ? 'ยอดนับจริง' : 'จำนวน') + '</label><input id="mQty" type="number" class="form-control"></div>' +
      (type === 'in' ? '<div class="form-row"><div class="form-group"><label>ต้นทุนต่อหน่วย (ถ้ามีการเปลี่ยนแปลง)</label><input id="mCost" type="number" class="form-control"></div>' +
        '<div class="form-group"><label>ซัพพลายเออร์</label><input id="mSupplier" class="form-control"></div></div>' : '') +
      (type !== 'in' ? '<div class="form-group"><label>เหตุผล (บังคับกรอก)</label><input id="mReason" class="form-control"></div>' : '') +
      '<button id="mSubmit" class="btn btn-primary" style="width:100%">บันทึก</button>'
    );
    document.getElementById('mSubmit').onclick = function () {
      var payload = { product_id: productId, type: type, qty: Number(document.getElementById('mQty').value || 0) };
      if (type === 'in') {
        var cost = document.getElementById('mCost').value;
        if (cost) payload.cost_price = Number(cost);
        payload.supplier = document.getElementById('mSupplier').value;
        payload.reason = 'รับสินค้าเข้า';
      } else {
        payload.reason = document.getElementById('mReason').value.trim();
        if (!payload.reason) { UI.toast('กรุณากรอกเหตุผล', 'error'); return; }
      }
      Api.call('admin.stock.adjust', payload).then(function () { UI.toast('บันทึกแล้ว', 'success'); m.remove(); loadList(); }).catch(function (err) { UI.toast(err.message, 'error'); });
    };
  }

  function loadMovements() {
    document.getElementById('area').innerHTML = UI.loading();
    Api.call('admin.stock.movements', { page_size: 100 }).then(function (data) {
      lastMovements = data.items;
      var el = document.getElementById('area');
      if (!el) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อนตอบกลับ
      if (!data.items.length) { el.innerHTML = '<div class="empty-state">ยังไม่มีประวัติ</div>'; return; }
      el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>วันที่</th><th>สินค้า</th><th>ประเภท</th><th>เปลี่ยนแปลง</th><th>ก่อน→หลัง</th><th>อ้างอิง</th><th>หมายเหตุ</th></tr></thead><tbody>' +
        data.items.map(function (m) { return '<tr><td>' + UI.fmtTime(m.created_at) + '</td><td>' + m.product_id + '</td><td>' + m.type + '</td><td>' + m.qty_change + '</td><td>' + m.qty_before + ' → ' + m.qty_after + '</td><td>' + (m.ref_type || '') + ' ' + (m.ref_id || '') + '</td><td>' + UI.escapeHtml(m.reason || '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
      UI.makeTableSortable(el.querySelector('table'));
    }).catch(function (err) { UI.toast(err.message, 'error'); });
  }

  loadList();
};
