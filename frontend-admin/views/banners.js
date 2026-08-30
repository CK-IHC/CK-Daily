/**
 * views/banners.js — จัดการแบนเนอร์สไลด์ใหญ่บนสุดของหน้าแรกลูกค้า (รูปเต็มความกว้าง เลื่อนสไลด์อัตโนมัติ)
 */
Views.banners = function (container) {
  var list = [];
  container.innerHTML = '<div class="card"><div class="card-head"><h3>แบนเนอร์หน้าแรก</h3><button id="btnAdd" class="btn btn-primary">+ เพิ่มแบนเนอร์</button></div>' +
    '<div style="font-size:12px;color:var(--text-muted);padding:0 16px 10px">แบนเนอร์ที่ "เปิดใช้งาน" จะแสดงเป็นสไลด์บนสุดของหน้าแรกลูกค้า เลื่อนสไลด์อัตโนมัติเรียงตามลำดับที่ตั้งไว้ — ' +
      'รองรับไฟล์ GIF, PNG, JPG, SVG แนะนำขนาดรูป 1200 x 600 พิกเซล (อัตราส่วน 2:1)</div>' +
    '<div id="area">' + UI.loading() + '</div></div>';
  document.getElementById('btnAdd').onclick = function () { openModal(); };
  load();

  function load() { Api.call('admin.banners.list').then(function (data) { list = data; render(); }).catch(function (err) { UI.toast(err.message, 'error'); }); }

  function render() {
    var el = document.getElementById('area');
    if (!el) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อนตอบกลับ
    if (!list.length) { el.innerHTML = '<div class="empty-state">ยังไม่มีแบนเนอร์</div>'; return; }
    el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>รูป</th><th>ลิงก์</th><th>ลำดับ</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>' +
      list.map(function (b) {
        return '<tr><td>' + (b.image_url ? '<img src="' + b.image_url + '" style="width:96px;height:48px;object-fit:cover;border-radius:6px">' : '-') + '</td>' +
          '<td style="font-size:12px;color:var(--text-muted);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (b.link_url ? UI.escapeHtml(b.link_url) : '-') + '</td>' +
          '<td>' + b.sort_order + '</td>' +
          '<td><span class="chip ' + (b.is_active ? 'active' : 'cancelled') + '">' + (b.is_active ? 'เปิด' : 'ปิด') + '</span></td>' +
          '<td><button class="btn btn-sm btn-outline" data-edit="' + b.banner_id + '">แก้ไข</button> <button class="btn btn-sm btn-danger" data-del="' + b.banner_id + '">ลบ</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    el.querySelectorAll('[data-edit]').forEach(function (btn) { btn.onclick = function () { openModal(list.filter(function (b) { return b.banner_id === btn.dataset.edit; })[0]); }; });
    el.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.onclick = function () {
        if (!confirm('ลบแบนเนอร์นี้?')) return;
        Api.call('admin.banners.delete', { banner_id: btn.dataset.del }).then(function () { UI.toast('ลบแล้ว', 'success'); load(); }).catch(function (err) { UI.toast(err.message, 'error'); });
      };
    });
    UI.makeTableSortable(el.querySelector('table'));
  }

  function openModal(b) {
    var imageUrl = b ? (b.image_url || '') : '';
    var m = UI.modal(
      '<button class="modal-close" onclick="this.closest(\'.modal-backdrop\').remove()">✕</button><h3>' + (b ? 'แก้ไขแบนเนอร์' : 'เพิ่มแบนเนอร์') + '</h3>' +
      '<div class="form-group"><label>รูปแบนเนอร์ (แนะนำขนาด 1200x600, รองรับ GIF/PNG/JPG/SVG)</label>' +
        '<div id="mImgPreview" style="margin-bottom:8px">' + (imageUrl ? '<img src="' + imageUrl + '" style="width:100%;max-width:320px;border-radius:8px;display:block">' : '<div class="empty-state" style="padding:12px">ยังไม่มีรูป</div>') + '</div>' +
        '<input type="file" id="mImgInput" accept="image/gif,image/png,image/jpeg,image/svg+xml" style="display:none">' +
        '<button id="mImgBtn" type="button" class="btn btn-outline btn-sm">' + Icon('camera', 14) + ' ' + (imageUrl ? 'เปลี่ยนรูป' : 'อัปโหลดรูป') + '</button>' +
      '</div>' +
      '<div class="form-group"><label>ลิงก์ (ถ้ามี — กดที่แบนเนอร์แล้วเปิดลิงก์นี้)</label><input id="mLink" class="form-control" placeholder="https://..." value="' + (b ? UI.escapeHtml(b.link_url || '') : '') + '"></div>' +
      '<div class="form-row"><div class="form-group"><label>ลำดับการแสดง (น้อยไปมาก)</label><input id="mSort" type="number" class="form-control" value="' + (b ? b.sort_order : 0) + '"></div>' +
      '<div class="form-group"><label>สถานะ</label><select id="mActive" class="form-control"><option value="1">เปิดใช้งาน</option><option value="0">ปิดใช้งาน</option></select></div></div>' +
      '<div class="form-row"><div class="form-group"><label>เริ่มแสดง (ถ้าไม่ระบุ = แสดงทันที)</label><input id="mStart" type="date" class="form-control" value="' + (b && b.start_at ? b.start_at.slice(0, 10) : '') + '"></div>' +
      '<div class="form-group"><label>สิ้นสุด (ถ้าไม่ระบุ = ไม่หมดอายุ)</label><input id="mEnd" type="date" class="form-control" value="' + (b && b.end_at ? b.end_at.slice(0, 10) : '') + '"></div></div>' +
      '<button id="mSubmit" class="btn btn-primary" style="width:100%">บันทึก</button>'
    );
    document.getElementById('mActive').value = (!b || b.is_active) ? '1' : '0';

    document.getElementById('mImgBtn').onclick = function () { document.getElementById('mImgInput').click(); };
    document.getElementById('mImgInput').onchange = function (e) {
      var file = e.target.files[0]; if (!file) return;
      if (file.size > 8 * 1024 * 1024) { UI.toast('ไฟล์ใหญ่เกิน 8MB กรุณาเลือกไฟล์ที่เล็กกว่านี้', 'error'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        Api.call('admin.banners.uploadImage', { image_base64: reader.result }).then(function (r) {
          imageUrl = r.image_url;
          document.getElementById('mImgPreview').innerHTML = '<img src="' + imageUrl + '" style="width:100%;max-width:320px;border-radius:8px;display:block">';
          UI.toast('อัปโหลดแล้ว', 'success');
        }).catch(function (err) { UI.toast(err.message, 'error'); });
      };
      reader.readAsDataURL(file);
    };

    document.getElementById('mSubmit').onclick = function () {
      var btn = document.getElementById('mSubmit');
      if (!imageUrl) { UI.toast('กรุณาอัปโหลดรูปแบนเนอร์', 'error'); return; }
      var payload = {
        image_url: imageUrl, link_url: document.getElementById('mLink').value.trim(),
        sort_order: Number(document.getElementById('mSort').value || 0),
        is_active: document.getElementById('mActive').value === '1',
        start_at: document.getElementById('mStart').value, end_at: document.getElementById('mEnd').value
      };
      var action = b ? 'admin.banners.update' : 'admin.banners.create';
      if (b) payload.banner_id = b.banner_id;
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
