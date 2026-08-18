/**
 * views/rounds.js — จัดการรอบ + ใบสรุปการผลิต + bulk update สถานะทั้งรอบ
 */
Views.rounds = function (container) {
  var rounds = [];

  container.innerHTML = '<div class="card"><div class="card-head"><h3>รอบการขายทั้งหมด</h3>' +
    '<div><button id="btnCreate" class="btn btn-primary">+ สร้างรอบใหม่</button></div></div>' +
    '<div id="tableArea">' + UI.loading() + '</div></div>';

  document.getElementById('btnCreate').onclick = function () { openRoundModal(null); };

  function load() {
    Api.call('admin.rounds.list').then(function (data) { rounds = data; renderTable(); }).catch(function (err) { UI.toast(err.message, 'error'); });
  }

  function renderTable() {
    var el = document.getElementById('tableArea');
    if (!el) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อน admin.rounds.list จะตอบกลับ
    if (!rounds.length) { el.innerHTML = '<div class="empty-state">ยังไม่มีรอบ</div>'; return; }
    el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>ชื่อรอบ</th><th>เปิด</th><th>ปิดรับ</th><th>ส่งของ</th><th>สถานที่จัดส่ง</th><th>สถานะ</th><th>ออเดอร์</th><th>ยอดขาย</th><th>จัดการ</th></tr></thead><tbody>' +
      rounds.map(function (r) {
        return '<tr><td>' + UI.escapeHtml(r.round_name) + '</td><td>' + UI.fmtTime(r.open_at) + '</td><td>' + UI.fmtTime(r.close_at) + '</td><td>' + UI.fmtTime(r.delivery_at) + '</td>' +
          '<td>' + UI.escapeHtml(r.delivery_location || '-') + '</td>' +
          '<td><span class="chip ' + r.status + '">' + r.status + '</span></td><td>' + r.current_orders + (r.capacity ? '/' + r.capacity : '') + '</td><td>' + UI.money(r.sales_total) + '</td>' +
          '<td>' + roundActions(r) + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    el.querySelectorAll('[data-action]').forEach(function (btn) {
      btn.onclick = function () {
        var action = btn.dataset.action, id = btn.dataset.id;
        if (action === 'detail') { openDetailModal(id); return; }
        if (action === 'edit') { openRoundModal(rounds.filter(function (r) { return r.round_id === id; })[0]); return; }
        if (action === 'open') doTransition(id, 'open');
        if (action === 'close') doTransition(id, 'close');
        if (action === 'preparing') doSetStatus(id, 'preparing');
        if (action === 'delivering') doSetStatus(id, 'delivering');
        if (action === 'completed') doSetStatus(id, 'completed');
        if (action === 'delete') doDelete(id);
      };
    });
  }

  function roundActions(r) {
    var buttons = '<button class="btn btn-sm btn-outline" data-action="detail" data-id="' + r.round_id + '">รายละเอียด</button> ' +
      '<button class="btn btn-sm btn-outline" data-action="edit" data-id="' + r.round_id + '">แก้ไข</button> ';
    if (r.status === 'draft') buttons += '<button class="btn btn-sm btn-primary" data-action="open" data-id="' + r.round_id + '">เปิดรอบ</button> ';
    if (r.status === 'open') buttons += '<button class="btn btn-sm btn-danger" data-action="close" data-id="' + r.round_id + '">ปิดรับ</button> ';
    if (r.status === 'closed') buttons += '<button class="btn btn-sm btn-primary" data-action="preparing" data-id="' + r.round_id + '">เริ่มเตรียม</button> ';
    if (r.status === 'preparing') buttons += '<button class="btn btn-sm btn-primary" data-action="delivering" data-id="' + r.round_id + '">เริ่มจัดส่ง/รับ</button> ';
    if (r.status === 'delivering') buttons += '<button class="btn btn-sm btn-primary" data-action="completed" data-id="' + r.round_id + '">ปิดรอบ (สำเร็จ)</button> ';
    if (r.status === 'draft') buttons += '<button class="btn btn-sm btn-danger" data-action="delete" data-id="' + r.round_id + '">ลบ</button>';
    return buttons;
  }

  function doDelete(id) {
    if (!confirm('ยืนยันลบรอบนี้? (ลบได้เฉพาะรอบที่ยังไม่เปิด)')) return;
    Api.call('admin.rounds.delete', { round_id: id }).then(function () { UI.toast('ลบรอบแล้ว', 'success'); load(); }).catch(function (err) { UI.toast(err.message, 'error'); });
  }

  function doTransition(id, kind) {
    var action = kind === 'open' ? 'admin.rounds.open' : 'admin.rounds.close';
    Api.call(action, { round_id: id }).then(function () { UI.toast('อัปเดตแล้ว', 'success'); load(); }).catch(function (err) { UI.toast(err.message, 'error'); });
  }
  function doSetStatus(id, status) {
    Api.call('admin.rounds.setStatus', { round_id: id, status: status }).then(function () { UI.toast('อัปเดตแล้ว', 'success'); load(); }).catch(function (err) { UI.toast(err.message, 'error'); });
  }

  function toLocalInput_(iso) { return iso ? String(iso).slice(0, 16) : ''; }

  function openRoundModal(round) {
    var isEdit = !!round;
    var m = UI.modal(
      '<button class="modal-close" onclick="this.closest(\'.modal-backdrop\').remove()">✕</button>' +
      '<h3>' + (isEdit ? 'แก้ไขรอบ' : 'สร้างรอบใหม่') + '</h3>' +
      '<div class="form-group"><label>ชื่อรอบ</label><input id="mName" class="form-control" value="' + (round ? UI.escapeHtml(round.round_name) : '') + '"></div>' +
      '<div class="form-row"><div class="form-group"><label>เปิดรับ</label><input id="mOpen" type="datetime-local" class="form-control" value="' + toLocalInput_(round && round.open_at) + '"></div>' +
      '<div class="form-group"><label>ปิดรับ</label><input id="mClose" type="datetime-local" class="form-control" value="' + toLocalInput_(round && round.close_at) + '"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>เวลาส่ง/รับ</label><input id="mDeliver" type="datetime-local" class="form-control" value="' + toLocalInput_(round && round.delivery_at) + '"></div>' +
      '<div class="form-group"><label>ความจุ (0=ไม่จำกัด)</label><input id="mCap" type="number" class="form-control" value="' + (round ? round.capacity : 0) + '"></div></div>' +
      '<div class="form-group"><label>สถานที่จัดส่ง</label><input id="mLocation" class="form-control" placeholder="เช่น แผนกธุรการ อาคาร A ชั้น 2" value="' + (round ? UI.escapeHtml(round.delivery_location || '') : '') + '"></div>' +
      '<div class="form-group"><label>หมายเหตุ</label><input id="mNote" class="form-control" value="' + (round ? UI.escapeHtml(round.note || '') : '') + '"></div>' +
      '<button id="mSubmit" class="btn btn-primary" style="width:100%">บันทึก</button>'
    );
    var submitBtn = document.getElementById('mSubmit');
    var submitting = false;
    submitBtn.onclick = function () {
      // กันแตะซ้อน/แตะรัวบนมือถือยิง API ซ้ำหลายครั้ง (สาเหตุที่กด "สร้างรอบใหม่" ครั้งเดียวแต่ได้ 3 รอบ)
      if (submitting) return;
      var name = document.getElementById('mName').value.trim();
      var open = document.getElementById('mOpen').value, close = document.getElementById('mClose').value, deliver = document.getElementById('mDeliver').value;
      if (!name || !open || !close || !deliver) { UI.toast('กรุณากรอกข้อมูลให้ครบ', 'error'); return; }
      var payload = {
        round_name: name, open_at: open, close_at: close, delivery_at: deliver,
        capacity: Number(document.getElementById('mCap').value || 0), note: document.getElementById('mNote').value,
        delivery_location: document.getElementById('mLocation').value
      };
      var action;
      if (isEdit) { payload.round_id = round.round_id; action = 'admin.rounds.update'; }
      else { payload.status = 'draft'; action = 'admin.rounds.create'; }
      submitting = true;
      submitBtn.disabled = true;
      Api.call(action, payload)
        .then(function () { UI.toast('บันทึกแล้ว', 'success'); m.remove(); load(); })
        .catch(function (err) { submitting = false; submitBtn.disabled = false; UI.toast(err.message, 'error'); });
    };
  }

  function openDetailModal(roundId) {
    var m = UI.modal('<div id="detailBody">' + UI.loading() + '</div>');
    Promise.all([Api.call('admin.rounds.summary', { round_id: roundId }), Api.call('admin.rounds.orders', { round_id: roundId })]).then(function (res) {
      var summary = res[0], orders = res[1];
      var body = document.getElementById('detailBody');
      if (!body) return; // ผู้ใช้ปิด modal ไปแล้วก่อนตอบกลับ
      body.innerHTML =
        '<button class="modal-close no-print" onclick="this.closest(\'.modal-backdrop\').remove()">✕</button>' +
        '<h3>' + UI.escapeHtml(summary.round.round_name) + '</h3>' +
        '<div class="card-head no-print"><button class="btn btn-sm btn-outline" id="printRoundBtn">🖨️ พิมพ์</button>' +
        '<button class="btn btn-sm btn-outline" id="exportRoundCsv">Export CSV</button></div>' +
        '<div id="roundPrintArea">' +
        '<h4>ใบสรุปการผลิต (' + summary.total_items + ' รายการ / ' + summary.total_orders + ' ออเดอร์)</h4>' +
        '<ul class="production-list">' + summary.production_sheet.map(function (p) { return '<li><span>' + UI.escapeHtml(p.product_name) + '</span><b>x ' + p.qty + '</b></li>'; }).join('') + '</ul>' +
        '<h4>สรุปการเงิน</h4>' +
        '<div class="kpi-grid">' +
          Object.keys(summary.finance_summary).map(function (k) { return '<div class="kpi-card"><div class="label">' + k + '</div><div class="value" style="font-size:16px">' + UI.money(summary.finance_summary[k]) + '</div></div>'; }).join('') +
        '</div>' +
        '<h4>รายการออเดอร์ในรอบ (' + orders.length + ')</h4>' +
        '<div class="no-print" style="margin-bottom:8px"><select id="bulkStatus" class="form-control" style="width:auto;display:inline-block"><option value="">เลือกสถานะใหม่...</option>' +
          ORDER_STATUS_LIST_.map(function (s) { return '<option value="' + s + '">' + UI.statusLabel(s) + '</option>'; }).join('') + '</select> ' +
          '<button id="bulkApply" class="btn btn-sm btn-primary">อัปเดตที่เลือกทั้งหมด</button></div>' +
        '<div class="table-wrap"><table><thead><tr><th class="no-print"><input type="checkbox" id="checkAll"></th><th>เลขที่</th><th>ลูกค้า</th><th>ยอด</th><th>สถานะ</th></tr></thead><tbody>' +
        orders.map(function (o) { return '<tr><td class="no-print"><input type="checkbox" class="rowCheck" value="' + o.order_id + '"></td><td>#' + o.order_no + '</td><td>' + UI.escapeHtml(o.customer_name) + '</td><td>' + UI.money(o.grand_total) + '</td><td><span class="chip ' + o.status + '">' + UI.statusLabel(o.status) + '</span></td></tr>'; }).join('') +
        '</tbody></table></div>' +
        '</div>';

      document.getElementById('checkAll').onchange = function (e) {
        body.querySelectorAll('.rowCheck').forEach(function (c) { c.checked = e.target.checked; });
      };
      document.getElementById('bulkApply').onclick = function () {
        var ids = Array.prototype.slice.call(body.querySelectorAll('.rowCheck:checked')).map(function (c) { return c.value; });
        var status = document.getElementById('bulkStatus').value;
        if (!ids.length || !status) { UI.toast('เลือกออเดอร์และสถานะก่อน', 'error'); return; }
        Api.call('admin.orders.bulkUpdateStatus', { order_ids: ids, status: status }).then(function (results) {
          UI.toast('อัปเดตสำเร็จ ' + results.filter(function (r) { return r.ok; }).length + '/' + results.length, 'success');
          m.remove(); load();
        }).catch(function (err) { UI.toast(err.message, 'error'); });
      };
      document.getElementById('exportRoundCsv').onclick = function () {
        UI.exportCsv('round-' + roundId + '.csv', orders.map(function (o) { return { order_no: o.order_no, customer: o.customer_name, phone: o.phone, status: o.status, grand_total: o.grand_total }; }));
      };
      document.getElementById('printRoundBtn').onclick = function () {
        UI.printWithHeader('ใบสรุปการผลิต — ' + summary.round.round_name, document.getElementById('roundPrintArea'));
      };
    });
  }

  load();
};
