/**
 * views/settings.js — ตั้งค่าร้าน (อ่าน/แก้ Settings sheet)
 */
var SETTINGS_LABELS_ = {
  shop_name: 'ชื่อร้าน', delivery_fee: 'ค่าส่งมาตรฐาน (บาท)', promptpay_id: 'เบอร์/เลขบัตร PromptPay',
  open_hours: 'เวลาเปิด-ปิดร้าน', points_per_baht: 'อัตราแต้มสะสมต่อบาท', line_notify_admin_token: 'LINE Notify Token (แจ้งเตือนแอดมิน)',
  admin_alert_email: 'อีเมลรับสรุปยอดขาย/แจ้งสต็อกต่ำ', otp_dev_mode: 'โหมดทดสอบ OTP (true/false)', low_stock_check_hour: 'ชั่วโมงเช็คสต็อกต่ำ (0-23)',
  daily_summary_hour: 'ชั่วโมงส่งสรุปยอดขาย (0-23)'
};
var SETTINGS_HIDDEN_ = ['vat_rate', 'round_templates', 'payment_qr_url', 'payment_qr_note']; // ปิดใช้ VAT แล้ว / round_templates เป็นค่าเก่าที่เลิกใช้ / payment_qr_url+note มี uploader แยกด้านล่าง

Views.settings = function (container) {
  container.innerHTML = '<div class="card"><h3>ตั้งค่าร้าน</h3><div id="area">' + UI.loading() + '</div></div>';
  Api.call('admin.settings.get').then(render).catch(function (err) { UI.toast(err.message, 'error'); });

  function render(settings) {
    var el = document.getElementById('area');
    if (!el) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อนตอบกลับ
    var keys = Object.keys(SETTINGS_LABELS_).filter(function (k) { return settings.hasOwnProperty(k); })
      .concat(Object.keys(settings).filter(function (k) { return !SETTINGS_LABELS_[k] && SETTINGS_HIDDEN_.indexOf(k) === -1; }));
    el.innerHTML = keys.map(function (k) {
      return '<div class="form-group"><label>' + (SETTINGS_LABELS_[k] || k) + '</label><input class="form-control settingInput" data-key="' + k + '" value="' + UI.escapeHtml(settings[k]) + '"></div>';
    }).join('') + '<button id="btnSave" class="btn btn-primary" style="width:100%">บันทึกการตั้งค่า</button>' +
      '<hr style="margin:24px 0;border:none;border-top:1px solid var(--border)">' +
      '<h4 style="margin-bottom:6px">QR ชำระเงินของร้าน</h4>' +
      '<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">รูป QR นี้จะแสดงในหน้าชำระเงินของลูกค้า (สแกนได้จากแอปธนาคารทุกธนาคาร) — อัปโหลดรูป QR จริงของร้าน (เช่น Thai QR Payment/PromptPay) แทนที่รูปเดิมได้ตลอดเวลา</div>' +
      '<div id="qrPreviewArea" style="margin-bottom:10px">' +
        (settings.payment_qr_url ? '<img src="' + settings.payment_qr_url + '" style="width:140px;height:140px;object-fit:contain;border:1px solid var(--border);border-radius:10px;padding:6px;background:#fff">' : '<div class="empty-state" style="padding:16px">ยังไม่ได้อัปโหลด QR ชำระเงิน</div>') +
      '</div>' +
      '<div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">ขนาดภาพที่แนะนำ: สี่เหลี่ยมจัตุรัส 600×600px ถึง 1000×1000px ไฟล์ไม่เกิน 5MB (ยิ่งเล็กยิ่งโหลดไวในแอปลูกค้า)</div>' +
      '<input type="file" id="qrFileInput" accept="image/*" style="display:none">' +
      '<button id="btnUploadQr" class="btn btn-outline btn-sm">' + Icon('camera', 14) + ' ' + (settings.payment_qr_url ? 'เปลี่ยนรูป QR' : 'อัปโหลดรูป QR') + '</button> ' +
      (settings.payment_qr_url ? '<button id="btnDeleteQr" class="btn btn-danger btn-sm">' + Icon('trash', 13) + ' ลบรูป QR</button>' : '') +
      '<div class="form-group" style="margin-top:14px"><label>ข้อความใต้ QR (เช่น ชื่อบัญชี/เลขบัญชี/หมายเหตุการโอน)</label>' +
      '<textarea id="qrNoteInput" class="form-control" rows="2" placeholder="เช่น ธ.กสิกรไทย เลขที่ 123-4-56789-0 ชื่อบัญชี IHC Central Kitchen">' + UI.escapeHtml(settings.payment_qr_note || '') + '</textarea></div>' +
      '<button id="btnSaveQrNote" class="btn btn-outline btn-sm">บันทึกข้อความใต้ QR</button>';

    document.getElementById('btnSave').onclick = function () {
      var payload = {};
      el.querySelectorAll('.settingInput').forEach(function (inp) { payload[inp.dataset.key] = inp.value; });
      Api.call('admin.settings.update', { settings: payload }).then(function () { UI.toast('บันทึกการตั้งค่าแล้ว', 'success'); }).catch(function (err) { UI.toast(err.message, 'error'); });
    };
    document.getElementById('btnUploadQr').onclick = function () { document.getElementById('qrFileInput').click(); };
    document.getElementById('qrFileInput').onchange = function (e) {
      var file = e.target.files[0]; if (!file) return;
      if (file.size > 5 * 1024 * 1024) { UI.toast('ไฟล์ใหญ่เกิน 5MB กรุณาเลือกรูปที่เล็กกว่านี้', 'error'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        Api.call('admin.settings.uploadQr', { image_base64: reader.result }).then(function () {
          UI.toast('อัปโหลด QR แล้ว', 'success');
          Api.call('admin.settings.get').then(render);
        }).catch(function (err) { UI.toast(err.message, 'error'); });
      };
      reader.readAsDataURL(file);
    };
    var deleteBtn = document.getElementById('btnDeleteQr');
    if (deleteBtn) deleteBtn.onclick = function () {
      if (!confirm('ลบรูป QR ชำระเงินนี้?')) return;
      Api.call('admin.settings.update', { settings: { payment_qr_url: '' } }).then(function () {
        UI.toast('ลบรูป QR แล้ว', 'success');
        Api.call('admin.settings.get').then(render);
      }).catch(function (err) { UI.toast(err.message, 'error'); });
    };
    document.getElementById('btnSaveQrNote').onclick = function () {
      Api.call('admin.settings.update', { settings: { payment_qr_note: document.getElementById('qrNoteInput').value } })
        .then(function () { UI.toast('บันทึกข้อความแล้ว', 'success'); }).catch(function (err) { UI.toast(err.message, 'error'); });
    };
  }
};
