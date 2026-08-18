/**
 * views/announcements.js — จัดการประกาศที่แสดงใต้แบนเนอร์รอบใหญ่ในหน้าแรกของลูกค้า
 */
var ANNOUNCEMENT_SIZE_LABEL_ = { small: 'เล็ก', medium: 'กลาง', large: 'ใหญ่' };

Views.announcements = function (container) {
  var list = [];
  container.innerHTML = '<div class="card"><div class="card-head"><h3>ประกาศหน้าแรก</h3><button id="btnAdd" class="btn btn-primary">+ สร้างประกาศ</button></div>' +
    '<div style="font-size:12px;color:var(--text-muted);padding:0 16px 10px">ประกาศที่ "เปิดใช้งาน" จะแสดงใต้แบนเนอร์รอบใหญ่ในหน้าแรกของลูกค้าทันที เรียงตามลำดับที่ตั้งไว้</div>' +
    '<div id="area">' + UI.loading() + '</div></div>';
  document.getElementById('btnAdd').onclick = function () { openModal(); };
  load();

  function load() { Api.call('admin.announcements.list').then(function (data) { list = data; render(); }).catch(function (err) { UI.toast(err.message, 'error'); }); }

  function render() {
    var el = document.getElementById('area');
    if (!el) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อนตอบกลับ
    if (!list.length) { el.innerHTML = '<div class="empty-state">ยังไม่มีประกาศ</div>'; return; }
    el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>รูป</th><th>ข้อความ</th><th>ลิงก์</th><th>ขนาด</th><th>ลำดับ</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>' +
      list.map(function (a) {
        return '<tr><td>' + (a.image_url ? '<img src="' + a.image_url + '" style="width:48px;height:48px;object-fit:cover;border-radius:6px">' : '-') + '</td>' +
          '<td style="max-width:220px;font-size:12.5px">' + UI.escapeHtml((a.text || '').slice(0, 60)) + (a.text && a.text.length > 60 ? '…' : '') + '</td>' +
          '<td style="font-size:12px;color:var(--text-muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (a.link_url ? UI.escapeHtml(a.link_url) : '-') + '</td>' +
          '<td>' + (ANNOUNCEMENT_SIZE_LABEL_[a.size] || a.size) + '</td><td>' + a.sort_order + '</td>' +
          '<td><span class="chip ' + (a.is_active ? 'active' : 'cancelled') + '">' + (a.is_active ? 'เปิด' : 'ปิด') + '</span></td>' +
          '<td><button class="btn btn-sm btn-outline" data-edit="' + a.announcement_id + '">แก้ไข</button> <button class="btn btn-sm btn-danger" data-del="' + a.announcement_id + '">ลบ</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    el.querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function () { openModal(list.filter(function (a) { return a.announcement_id === b.dataset.edit; })[0]); }; });
    el.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = function () {
        if (!confirm('ลบประกาศนี้?')) return;
        Api.call('admin.announcements.delete', { announcement_id: b.dataset.del }).then(function () { UI.toast('ลบแล้ว', 'success'); load(); }).catch(function (err) { UI.toast(err.message, 'error'); });
      };
    });
  }

  function openModal(a) {
    var imageUrl = a ? (a.image_url || '') : '';
    var m = UI.modal(
      '<button class="modal-close" onclick="this.closest(\'.modal-backdrop\').remove()">✕</button><h3>' + (a ? 'แก้ไขประกาศ' : 'สร้างประกาศ') + '</h3>' +
      '<div class="form-group"><label>ข้อความประกาศ</label><textarea id="mText" class="form-control" rows="3" placeholder="เช่น โปรโมชั่นพิเศษวันนี้ ลด 10% ทุกเมนู">' + (a ? UI.escapeHtml(a.text) : '') + '</textarea></div>' +
      '<div class="form-group"><label>ลิงก์ (ถ้ามี — กดที่ประกาศแล้วเปิดลิงก์นี้)</label><input id="mLink" class="form-control" placeholder="https://..." value="' + (a ? UI.escapeHtml(a.link_url || '') : '') + '"></div>' +
      '<div class="form-group"><label>รูปประกาศ (ถ้ามี)</label>' +
        '<div id="mImgPreview" style="margin-bottom:8px">' + (imageUrl ? '<img src="' + imageUrl + '" style="width:100%;max-width:280px;border-radius:8px;display:block">' : '<div class="empty-state" style="padding:12px">ยังไม่มีรูป</div>') + '</div>' +
        '<input type="file" id="mImgInput" accept="image/*" style="display:none">' +
        '<button id="mImgBtn" type="button" class="btn btn-outline btn-sm">' + Icon('camera', 14) + ' ' + (imageUrl ? 'เปลี่ยนรูป' : 'อัปโหลดรูป') + '</button> ' +
        (imageUrl ? '<button id="mImgRemove" type="button" class="btn btn-outline btn-sm">ลบรูป</button>' : '') +
      '</div>' +
      '<div class="form-group"><label>ขนาดรูป/แบนเนอร์</label><select id="mSize" class="form-control">' +
        '<option value="small">เล็ก — กะทัดรัด</option><option value="medium">กลาง — แนะนำ</option><option value="large">ใหญ่ — เด่นชัด</option>' +
      '</select><div style="font-size:11px;color:var(--text-muted);margin-top:4px">ระบบจำกัดความสูงสูงสุดให้อัตโนมัติทุกขนาด ป้องกันไม่ให้ประกาศใหญ่จนบดบังหน้าแรก</div></div>' +
      '<div class="form-row"><div class="form-group"><label>ลำดับการแสดง (น้อยไปมาก)</label><input id="mSort" type="number" class="form-control" value="' + (a ? a.sort_order : 0) + '"></div>' +
      '<div class="form-group"><label>สถานะ</label><select id="mActive" class="form-control"><option value="1">เปิดใช้งาน</option><option value="0">ปิดใช้งาน</option></select></div></div>' +
      '<div class="form-row"><div class="form-group"><label>เริ่มแสดง (ถ้าไม่ระบุ = แสดงทันที)</label><input id="mStart" type="date" class="form-control" value="' + (a && a.start_at ? a.start_at.slice(0, 10) : '') + '"></div>' +
      '<div class="form-group"><label>สิ้นสุด (ถ้าไม่ระบุ = ไม่หมดอายุ)</label><input id="mEnd" type="date" class="form-control" value="' + (a && a.end_at ? a.end_at.slice(0, 10) : '') + '"></div></div>' +
      '<button id="mSubmit" class="btn btn-primary" style="width:100%">บันทึก</button>'
    );
    document.getElementById('mSize').value = a ? a.size : 'medium';
    document.getElementById('mActive').value = (!a || a.is_active) ? '1' : '0';

    document.getElementById('mImgBtn').onclick = function () { document.getElementById('mImgInput').click(); };
    document.getElementById('mImgInput').onchange = function (e) {
      var file = e.target.files[0]; if (!file) return;
      if (file.size > 5 * 1024 * 1024) { UI.toast('ไฟล์ใหญ่เกิน 5MB กรุณาเลือกรูปที่เล็กกว่านี้', 'error'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        Api.call('admin.announcements.uploadImage', { image_base64: reader.result }).then(function (r) {
          imageUrl = r.image_url;
          document.getElementById('mImgPreview').innerHTML = '<img src="' + imageUrl + '" style="width:100%;max-width:280px;border-radius:8px;display:block">';
          UI.toast('อัปโหลดรูปแล้ว', 'success');
        }).catch(function (err) { UI.toast(err.message, 'error'); });
      };
      reader.readAsDataURL(file);
    };
    var removeBtn = document.getElementById('mImgRemove');
    if (removeBtn) removeBtn.onclick = function () {
      imageUrl = '';
      document.getElementById('mImgPreview').innerHTML = '<div class="empty-state" style="padding:12px">ยังไม่มีรูป</div>';
    };

    document.getElementById('mSubmit').onclick = function () {
      var text = document.getElementById('mText').value.trim();
      if (!text) { UI.toast('กรุณากรอกข้อความประกาศ', 'error'); return; }
      var payload = {
        text: text, link_url: document.getElementById('mLink').value.trim(), image_url: imageUrl,
        size: document.getElementById('mSize').value, sort_order: Number(document.getElementById('mSort').value || 0),
        is_active: document.getElementById('mActive').value === '1',
        start_at: document.getElementById('mStart').value, end_at: document.getElementById('mEnd').value
      };
      var action = a ? 'admin.announcements.update' : 'admin.announcements.create';
      if (a) payload.announcement_id = a.announcement_id;
      Api.call(action, payload).then(function () { UI.toast('บันทึกแล้ว', 'success'); m.remove(); load(); }).catch(function (err) { UI.toast(err.message, 'error'); });
    };
  }
};
