/**
 * views/coupons.js — CRUD คูปอง/โปรโมชั่น
 */
Views.coupons = function (container) {
  var coupons = [];
  container.innerHTML = '<div class="card"><div class="card-head"><h3>คูปอง/โปรโมชั่น</h3><button id="btnAdd" class="btn btn-primary">+ สร้างคูปอง</button></div><div id="area">' + UI.loading() + '</div></div>';
  document.getElementById('btnAdd').onclick = function () { openModal(); };
  load();

  function load() { Api.call('admin.coupons.list').then(function (data) { coupons = data; render(); }).catch(function (err) { UI.toast(err.message, 'error'); }); }

  function render() {
    var el = document.getElementById('area');
    if (!el) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อนตอบกลับ
    if (!coupons.length) { el.innerHTML = '<div class="empty-state">ยังไม่มีคูปอง</div>'; return; }
    el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>รหัส</th><th>ประเภท</th><th>มูลค่า</th><th>ขั้นต่ำ</th><th>ใช้แล้ว/จำกัด</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>' +
      coupons.map(function (c) {
        return '<tr><td><b>' + c.code + '</b></td><td>' + { percent: 'ลด %', fixed: 'ลดคงที่', free_delivery: 'ส่งฟรี' }[c.type] + '</td><td>' + (c.type === 'percent' ? c.value + '%' : UI.money(c.value)) + '</td><td>' + UI.money(c.min_spend) + '</td>' +
          '<td>' + c.used_count + (c.usage_limit ? '/' + c.usage_limit : '') + '</td><td><span class="chip ' + (c.is_active ? 'active' : 'cancelled') + '">' + (c.is_active ? 'เปิด' : 'ปิด') + '</span></td>' +
          '<td><button class="btn btn-sm btn-outline" data-edit="' + c.coupon_id + '">แก้ไข</button> <button class="btn btn-sm btn-danger" data-del="' + c.coupon_id + '">ลบ</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    el.querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function () { openModal(coupons.filter(function (c) { return c.coupon_id === b.dataset.edit; })[0]); }; });
    el.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { if (confirm('ลบคูปองนี้?')) Api.call('admin.coupons.delete', { coupon_id: b.dataset.del }).then(function () { UI.toast('ลบแล้ว', 'success'); load(); }); }; });
  }

  function openModal(c) {
    var m = UI.modal(
      '<button class="modal-close" onclick="this.closest(\'.modal-backdrop\').remove()">✕</button><h3>' + (c ? 'แก้ไขคูปอง' : 'สร้างคูปอง') + '</h3>' +
      '<div class="form-row"><div class="form-group"><label>รหัสคูปอง</label><input id="mCode" class="form-control" ' + (c ? 'disabled' : '') + ' value="' + (c ? c.code : '') + '"></div>' +
      '<div class="form-group"><label>ประเภท</label><select id="mType" class="form-control"><option value="percent">ลดเปอร์เซ็นต์</option><option value="fixed">ลดจำนวนคงที่</option><option value="free_delivery">ส่งฟรี</option></select></div></div>' +
      '<div class="form-row"><div class="form-group"><label>มูลค่า</label><input id="mValue" type="number" class="form-control" value="' + (c ? c.value : 0) + '"></div>' +
      '<div class="form-group"><label>ลดสูงสุด (สำหรับ %)</label><input id="mMaxDiscount" type="number" class="form-control" value="' + (c && c.max_discount ? c.max_discount : '') + '"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>ยอดขั้นต่ำ</label><input id="mMinSpend" type="number" class="form-control" value="' + (c ? c.min_spend : 0) + '"></div>' +
      '<div class="form-group"><label>จำกัดจำนวนใช้ทั้งหมด (0=ไม่จำกัด)</label><input id="mUsageLimit" type="number" class="form-control" value="' + (c ? c.usage_limit : 0) + '"></div></div>' +
      '<div class="form-group"><label>จำกัดต่อคน (0=ไม่จำกัด)</label><input id="mPerUser" type="number" class="form-control" value="' + (c ? c.per_user_limit : 1) + '"></div>' +
      '<div class="form-row"><div class="form-group"><label>เริ่มใช้งาน</label><input id="mStart" type="date" class="form-control" value="' + (c && c.start_at ? c.start_at.slice(0, 10) : '') + '"></div>' +
      '<div class="form-group"><label>หมดอายุ</label><input id="mEnd" type="date" class="form-control" value="' + (c && c.end_at ? c.end_at.slice(0, 10) : '') + '"></div></div>' +
      (c ? '<label style="display:flex;align-items:center;gap:8px;margin-bottom:14px;cursor:pointer"><input type="checkbox" id="mActive" ' + (c.is_active ? 'checked' : '') + '> เปิดใช้งานคูปองนี้ (ปิดไว้เพื่อพักการใช้งานชั่วคราวโดยไม่ต้องลบ)</label>' : '') +
      '<button id="mSubmit" class="btn btn-primary" style="width:100%">บันทึก</button>'
    );
    document.getElementById('mType').value = c ? c.type : 'percent';
    document.getElementById('mSubmit').onclick = function () {
      var payload = {
        code: document.getElementById('mCode').value.trim().toUpperCase(), type: document.getElementById('mType').value,
        value: Number(document.getElementById('mValue').value || 0), max_discount: Number(document.getElementById('mMaxDiscount').value || 0),
        min_spend: Number(document.getElementById('mMinSpend').value || 0), usage_limit: Number(document.getElementById('mUsageLimit').value || 0),
        per_user_limit: Number(document.getElementById('mPerUser').value || 0),
        start_at: document.getElementById('mStart').value, end_at: document.getElementById('mEnd').value
      };
      if (!payload.code) { UI.toast('กรุณากรอกรหัสคูปอง', 'error'); return; }
      var action = c ? 'admin.coupons.update' : 'admin.coupons.create';
      if (c) { payload.coupon_id = c.coupon_id; payload.is_active = document.getElementById('mActive').checked; }
      Api.call(action, payload).then(function () { UI.toast('บันทึกแล้ว', 'success'); m.remove(); load(); }).catch(function (err) { UI.toast(err.message, 'error'); });
    };
  }
};
