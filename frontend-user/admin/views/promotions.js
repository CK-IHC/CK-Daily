/**
 * views/promotions.js — โปรโมชั่นลดราคาอัตโนมัติต่อสินค้า (ไม่ต้องกรอกโค้ดแบบคูปอง)
 * รองรับลด%/ลดคงที่/ซื้อ-แถม (BOGO) — ตั้งช่วงเวลาสั้นๆ (เริ่ม-สิ้นสุด) ใช้เป็นแฟลชเซลได้ทันที
 */
var PROMOTION_TYPE_LABEL_ = { percent: 'ลด %', fixed: 'ลดคงที่/ชิ้น', bogo: 'ซื้อ-แถม (BOGO)' };

Views.promotions = function (container) {
  var promotions = [], products = [];
  container.innerHTML = '<div class="card"><div class="card-head"><h3>โปรโมชั่น</h3><button id="btnAdd" class="btn btn-primary">+ สร้างโปรโมชั่น</button></div>' +
    '<div style="font-size:12px;color:var(--text-muted);padding:0 16px 10px">โปรโมชั่นที่ "เปิดใช้งาน" จะลดราคาให้ลูกค้าอัตโนมัติทันทีที่เข้าเงื่อนไข ไม่ต้องกรอกโค้ด — ผูกกับสินค้าได้ทีละ 1 รายการ ' +
      'ตั้งช่วง "เริ่ม-สิ้นสุด" เป็นช่วงเวลาสั้นๆ เพื่อทำเป็นแฟลชเซลได้ สินค้าหนึ่งชิ้นเปิดโปรพร้อมกันได้แค่ 1 รายการ (เปิดโปรใหม่จะปิดโปรเดิมของสินค้านั้นให้อัตโนมัติ)</div>' +
    '<div id="area">' + UI.loading() + '</div></div>';
  document.getElementById('btnAdd').onclick = function () { openModal(); };
  load();

  function load() {
    Promise.all([Api.call('admin.promotions.list'), Api.call('admin.products.list')]).then(function (res) {
      promotions = res[0]; products = res[1]; render();
    }).catch(function (err) { UI.toast(err.message, 'error'); });
  }

  function valueLabel_(p) {
    if (p.type === 'percent') return p.value + '%';
    if (p.type === 'fixed') return UI.money(p.value) + '/ชิ้น';
    return 'ซื้อ ' + p.buy_qty + ' แถม ' + p.free_qty;
  }

  function render() {
    var el = document.getElementById('area');
    if (!el) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อนตอบกลับ
    if (!promotions.length) { el.innerHTML = '<div class="empty-state">ยังไม่มีโปรโมชั่น</div>'; return; }
    el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>สินค้า</th><th>ชื่อโปร</th><th>ประเภท</th><th>ส่วนลด</th><th>ช่วงเวลา</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>' +
      promotions.map(function (p) {
        var period = (p.start_at || p.end_at) ? (UI.fmtTime(p.start_at) || 'ตอนนี้') + ' – ' + (UI.fmtTime(p.end_at) || 'ไม่กำหนด') : 'ตลอดไป';
        return '<tr><td>' + UI.escapeHtml(p.product_name) + '</td><td>' + UI.escapeHtml(p.name || '-') + '</td>' +
          '<td>' + PROMOTION_TYPE_LABEL_[p.type] + '</td><td>' + valueLabel_(p) + '</td><td style="font-size:12px">' + period + '</td>' +
          '<td><span class="chip ' + (p.is_active ? 'active' : 'cancelled') + '">' + (p.is_active ? 'เปิด' : 'ปิด') + '</span></td>' +
          '<td><button class="btn btn-sm btn-outline" data-edit="' + p.promotion_id + '">แก้ไข</button> <button class="btn btn-sm btn-danger" data-del="' + p.promotion_id + '">ลบ</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    el.querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function () { openModal(promotions.filter(function (p) { return p.promotion_id === b.dataset.edit; })[0]); }; });
    el.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = function () {
        if (!confirm('ลบโปรโมชั่นนี้?')) return;
        Api.call('admin.promotions.delete', { promotion_id: b.dataset.del }).then(function () { UI.toast('ลบแล้ว', 'success'); load(); }).catch(function (err) { UI.toast(err.message, 'error'); });
      };
    });
    UI.makeTableSortable(el.querySelector('table'));
  }

  function openModal(p) {
    var m = UI.modal(
      '<button class="modal-close" onclick="this.closest(\'.modal-backdrop\').remove()">✕</button><h3>' + (p ? 'แก้ไขโปรโมชั่น' : 'สร้างโปรโมชั่น') + '</h3>' +
      '<div class="form-group"><label>สินค้าที่ร่วมโปรโมชั่น</label><select id="mProduct" class="form-control">' +
        products.map(function (x) { return '<option value="' + x.product_id + '"' + (p && p.product_id === x.product_id ? ' selected' : '') + '>' + UI.escapeHtml(x.name) + ' (' + UI.money(x.price) + ')</option>'; }).join('') +
      '</select></div>' +
      '<div class="form-group"><label>ชื่อโปรโมชั่น (ไม่บังคับ — ไว้จำเฉยๆ)</label><input id="mName" class="form-control" placeholder="เช่น แฟลชเซลวันศุกร์" value="' + (p ? UI.escapeHtml(p.name || '') : '') + '"></div>' +
      '<div class="form-group"><label>ประเภท</label><select id="mType" class="form-control">' +
        '<option value="percent">ลดเปอร์เซ็นต์</option><option value="fixed">ลดคงที่ต่อชิ้น</option><option value="bogo">ซื้อ-แถม (BOGO)</option>' +
      '</select></div>' +
      '<div id="mValueWrap" class="form-group"><label id="mValueLabel">ลดกี่เปอร์เซ็นต์</label><input id="mValue" type="number" class="form-control" value="' + (p ? p.value : '') + '"></div>' +
      '<div id="mBogoWrap" class="form-row" style="display:none">' +
        '<div class="form-group"><label>ซื้อกี่ชิ้น</label><input id="mBuyQty" type="number" class="form-control" value="' + (p && p.buy_qty ? p.buy_qty : 1) + '"></div>' +
        '<div class="form-group"><label>แถมกี่ชิ้น</label><input id="mFreeQty" type="number" class="form-control" value="' + (p && p.free_qty ? p.free_qty : 1) + '"></div>' +
      '</div>' +
      '<div class="form-row"><div class="form-group"><label>เริ่มใช้งาน (เว้นว่าง = ใช้ได้ทันที)</label><input id="mStart" type="datetime-local" class="form-control" value="' + (p && p.start_at ? p.start_at.slice(0, 16) : '') + '"></div>' +
      '<div class="form-group"><label>สิ้นสุด (เว้นว่าง = ไม่หมดอายุ — ใส่ช่วงสั้นๆ เพื่อทำแฟลชเซล)</label><input id="mEnd" type="datetime-local" class="form-control" value="' + (p && p.end_at ? p.end_at.slice(0, 16) : '') + '"></div></div>' +
      (p ? '<label style="display:flex;align-items:center;gap:8px;margin-bottom:14px;cursor:pointer"><input type="checkbox" id="mActive" ' + (p.is_active ? 'checked' : '') + '> เปิดใช้งานโปรโมชั่นนี้</label>' : '') +
      '<button id="mSubmit" class="btn btn-primary" style="width:100%">บันทึก</button>'
    );
    var typeSel = document.getElementById('mType');
    typeSel.value = p ? p.type : 'percent';

    function syncTypeFields_() {
      var isBogo = typeSel.value === 'bogo';
      document.getElementById('mValueWrap').style.display = isBogo ? 'none' : '';
      document.getElementById('mBogoWrap').style.display = isBogo ? 'flex' : 'none';
      document.getElementById('mValueLabel').textContent = typeSel.value === 'percent' ? 'ลดกี่เปอร์เซ็นต์' : 'ลดกี่บาทต่อชิ้น';
    }
    typeSel.onchange = syncTypeFields_;
    syncTypeFields_();

    document.getElementById('mSubmit').onclick = function () {
      var btn = document.getElementById('mSubmit');
      var type = typeSel.value;
      var payload = {
        product_id: document.getElementById('mProduct').value, name: document.getElementById('mName').value.trim(), type: type,
        start_at: document.getElementById('mStart').value, end_at: document.getElementById('mEnd').value
      };
      if (type === 'bogo') {
        payload.buy_qty = Number(document.getElementById('mBuyQty').value || 0);
        payload.free_qty = Number(document.getElementById('mFreeQty').value || 0);
        if (payload.buy_qty < 1 || payload.free_qty < 1) { UI.toast('กรุณาระบุจำนวนซื้อและจำนวนแถมอย่างน้อย 1', 'error'); return; }
      } else {
        payload.value = Number(document.getElementById('mValue').value || 0);
        if (payload.value <= 0) { UI.toast('กรุณาระบุมูลค่าส่วนลด', 'error'); return; }
      }
      var action = p ? 'admin.promotions.update' : 'admin.promotions.create';
      if (p) { payload.promotion_id = p.promotion_id; payload.is_active = document.getElementById('mActive').checked; }
      btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
      Api.call(action, payload).then(function () {
        UI.toast('บันทึกแล้ว', 'success'); m.remove(); load();
      }).catch(function (err) {
        btn.disabled = false; btn.textContent = 'บันทึก';
        UI.toast(err.message, 'error');
      });
    };
  }
};
