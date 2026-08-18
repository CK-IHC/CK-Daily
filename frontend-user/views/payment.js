/**
 * views/payment.js — หน้าชำระเงิน (#/payment/:order_id)
 * แสดงรายการสั่งซื้ออย่างละเอียด + QR ชำระเงินของร้าน (มุมซ้ายล่าง สแกนได้ทุกธนาคาร) +
 * ปุ่มดาวน์โหลดเป็นรูปภาพ PNG อัตราส่วน 9:16 (html2canvas) + แนบหลักฐานการโอน
 */
Views.payment = function (container, params) {
  var orderId = params[0];
  var order = null, settings = null;

  container.innerHTML = UI.loading();
  load();

  function load() {
    Promise.all([Api.call('order.detail', { order_id: orderId }), Api.call('catalog.getPublicSettings')])
      .then(function (res) { order = res[0]; settings = res[1]; render(); })
      .catch(function (err) { UI.toast(err.message, 'error'); location.hash = '#/history'; });
  }

  function qrImageUrl() {
    if (settings && settings.payment_qr_url) return settings.payment_qr_url;
    if (settings && settings.promptpay_id) {
      return 'https://promptpay.io/' + encodeURIComponent(settings.promptpay_id) + '/' + Math.round(order.grand_total) + '.png';
    }
    return '';
  }

  function render() {
    if (!order) return;
    var alreadyPaid = order.payment_status === 'paid';
    var hasSlip = !!order.slip_url;
    var canCancel = order.status === 'pending';
    var qr = qrImageUrl();

    container.innerHTML =
      '<div class="container" style="padding-bottom:0"><a href="#/tracking/' + orderId + '" style="font-size:13px;color:var(--text-muted)">← กลับไปหน้าติดตามออเดอร์</a></div>' +
      '<div class="container">' +
        '<h2 style="margin:8px 0 4px">ชำระเงิน — ออเดอร์ #' + UI.escapeHtml(order.order_no) + '</h2>' +
        '<div id="printArea">' +
          '<div class="section-title">รายการสั่งซื้อ</div>' +
          (order.items || []).map(function (i) {
            return '<div class="cart-item"><div class="thumb">' + (i.is_frozen ? Icon('snowflake', 16, 'color:#2563eb') : '🍱') + '</div>' +
              '<div class="info"><div class="name">' + UI.escapeHtml(i.product_name) + (i.is_frozen ? ' <span style="color:#2563eb;font-size:11px;font-weight:600">(Freezing)</span>' : '') + '</div><div class="opts">x' + i.qty + '</div></div>' +
              '<div class="price">' + UI.money(i.line_total) + '</div></div>';
          }).join('') +
          '<div class="summary-row"><span class="muted">ยอดรวมสินค้า</span><span>' + UI.money(order.subtotal) + '</span></div>' +
          (order.discount ? '<div class="summary-row"><span class="muted">ส่วนลด</span><span>-' + UI.money(order.discount) + '</span></div>' : '') +
          '<div class="summary-row total"><span>ยอดที่ต้องชำระ</span><span>' + UI.money(order.grand_total) + '</span></div>' +
        '</div>' +

        (alreadyPaid
          ? '<div class="empty-state" style="margin-top:16px"><div class="emoji">✅</div>ชำระเงินเรียบร้อยแล้ว</div>' +
            '<div class="payment-qr-box" style="text-align:center;margin-top:10px">' +
              '<div class="section-title" style="text-align:left">ใบเสร็จรับเงิน</div>' +
              '<img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(order.order_no) + '" alt="QR เลขที่ออเดอร์" style="width:180px;height:180px;display:block;margin:0 auto;border:1px solid var(--border);border-radius:10px;padding:8px;background:#fff">' +
              '<div class="payment-qr-note">ออเดอร์ #' + UI.escapeHtml(order.order_no) + ' — แสดง QR นี้เพื่อยืนยัน/รับสินค้า</div>' +
            '</div>'
          :
          '<div class="section-title">สแกน QR เพื่อชำระเงิน</div>' +
          '<div class="payment-qr-box">' +
            (qr ? '<img src="' + qr + '" alt="QR ชำระเงิน" class="payment-qr-img">' : '<div class="empty-state" style="padding:16px">ร้านยังไม่ได้ตั้งค่า QR ชำระเงิน กรุณาติดต่อผู้ดูแลระบบ</div>') +
            '<div class="payment-qr-note">สแกนได้จากแอปธนาคารทุกธนาคาร (Mobile Banking)</div>' +
            (settings && settings.payment_qr_note ? '<div class="payment-qr-account-note">' + UI.escapeHtml(settings.payment_qr_note).replace(/\n/g, '<br>') + '</div>' : '') +
          '</div>' +
          (hasSlip
            ? '<div class="empty-state" style="margin-top:10px">🔍 แนบหลักฐานแล้ว รอตรวจสอบจากร้าน</div>' +
              '<div style="text-align:center;margin-top:8px">' +
                '<button id="viewSlipBtn" class="btn btn-outline btn-sm no-print">' + Icon('camera', 14) + ' ดูสลิปที่แนบ</button>' +
              '</div>'
            : '<button id="uploadSlipBtn" class="btn btn-primary btn-block no-print" style="margin-top:14px">' + Icon('camera', 16) + ' แนบหลักฐานการโอน</button>' +
              '<input type="file" id="slipFile" accept="image/*" style="display:none">') +
          (hasSlip ? '<button id="reuploadSlipBtn" class="btn btn-outline btn-block no-print" style="margin-top:8px">' + Icon('camera', 16) + ' แนบหลักฐานใหม่</button><input type="file" id="slipFileRe" accept="image/*" style="display:none">' : '')
        ) +

        '<button id="downloadBtn" class="btn btn-outline btn-block no-print" style="margin-top:16px">' + Icon('download', 16) + (alreadyPaid ? ' ดาวน์โหลดใบเสร็จรับเงิน (PNG)' : ' ดาวน์โหลดเป็นรูปภาพ (PNG)') + '</button>' +
        (canCancel ? '<button id="cancelBtn" class="btn btn-danger btn-block no-print" style="margin-top:8px">ยกเลิกออเดอร์</button>' : '') +
      '</div>';

    var viewSlipBtn = document.getElementById('viewSlipBtn');
    if (viewSlipBtn) viewSlipBtn.onclick = function () {
      var original = viewSlipBtn.innerHTML;
      viewSlipBtn.textContent = 'กำลังโหลด...'; viewSlipBtn.disabled = true;
      Api.call('order.getSlipBase64', { order_id: orderId }).then(function (r) {
        viewSlipBtn.innerHTML = original; viewSlipBtn.disabled = false;
        if (!r.data_uri) { UI.toast('ไม่พบไฟล์สลิป', 'error'); return; }
        UI.modal('<img src="' + r.data_uri + '" style="width:100%;border-radius:10px;display:block">');
      }).catch(function (err) { viewSlipBtn.innerHTML = original; viewSlipBtn.disabled = false; UI.toast(err.message, 'error'); });
    };

    var uploadBtn = document.getElementById('uploadSlipBtn');
    if (uploadBtn) uploadBtn.onclick = function () { document.getElementById('slipFile').click(); };
    var fileInput = document.getElementById('slipFile');
    if (fileInput) fileInput.onchange = function (e) { handleSlipFile(e); };

    var reuploadBtn = document.getElementById('reuploadSlipBtn');
    if (reuploadBtn) reuploadBtn.onclick = function () { document.getElementById('slipFileRe').click(); };
    var fileInputRe = document.getElementById('slipFileRe');
    if (fileInputRe) fileInputRe.onchange = function (e) { handleSlipFile(e); };

    document.getElementById('downloadBtn').onclick = downloadOrderSummary;

    var cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) cancelBtn.onclick = function () {
      if (!confirm('ยกเลิกออเดอร์นี้?')) return;
      Api.call('order.cancel', { order_id: orderId }).then(function () {
        UI.toast('ยกเลิกออเดอร์แล้ว', 'success');
        location.hash = '#/history';
      }).catch(function (err) { UI.toast(err.message, 'error'); });
    };
  }

  function handleSlipFile(e) {
    var file = e.target.files[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { UI.toast('ไฟล์ใหญ่เกิน 5MB กรุณาเลือกรูปที่เล็กกว่านี้', 'error'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      Api.call('order.uploadSlip', { order_id: orderId, image_base64: reader.result }).then(function () {
        UI.toast('แนบหลักฐานการโอนสำเร็จ', 'success');
        load();
      }).catch(function (err) { UI.toast(err.message, 'error'); });
    };
    reader.readAsDataURL(file);
  }

  /** ข้อความทางการแจ้งให้ลูกค้าสแกน QR ชำระเงินและแนบหลักฐานการโอนในออเดอร์นี้ */
  var PAYMENT_INSTRUCTION_TEXT_ = 'กรุณาสแกน QR Code ด้านบนเพื่อชำระเงินให้ครบถ้วนตามยอดที่ระบุ ' +
    'และกรุณาแนบหลักฐานการโอนเงิน (สลิป) สำหรับคำสั่งซื้อนี้ผ่านระบบทันทีหลังทำการชำระเงิน ' +
    'เพื่อให้เจ้าหน้าที่ดำเนินการตรวจสอบและยืนยันคำสั่งซื้อของท่านโดยเร็วที่สุด ขอขอบพระคุณที่ใช้บริการ';

  /** สร้างรูปสรุปคำสั่งซื้อเป็น PNG อัตราส่วน 9:16 (รวม QR ชำระเงิน + คำแนะนำแนบหลักฐาน) แล้วแสดง popup ในแอปทันที */
  function downloadOrderSummary() {
    if (typeof html2canvas === 'undefined') { UI.toast('ไม่สามารถสร้างรูปภาพได้ในขณะนี้ กรุณาลองใหม่', 'error'); return; }
    var btn = document.getElementById('downloadBtn');
    var alreadyPaid = order.payment_status === 'paid';
    var resetBtn = function () { if (btn) { btn.disabled = false; btn.innerHTML = Icon('download', 16) + (alreadyPaid ? ' ดาวน์โหลดใบเสร็จรับเงิน (PNG)' : ' ดาวน์โหลดเป็นรูปภาพ (PNG)'); } };
    if (btn) { btn.disabled = true; btn.textContent = 'กำลังสร้างรูปภาพ...'; }

    // ต้องดึง QR มาเป็น data URI ก่อนเสมอ (แทนลิงก์ข้ามโดเมนตรงๆ) เพราะ html2canvas วาดรูปข้ามโดเมนที่ไม่ส่ง
    // CORS header ที่เสถียรพอลง canvas ไม่ได้ ไม่งั้นรูป QR จะหายไปเงียบๆ ในรูปที่ export
    var qrPromise = alreadyPaid
      ? Api.call('order.getReceiptQrBase64', { order_id: orderId }).then(function (r) { return r.data_uri || ''; }).catch(function () { return ''; })
      : Api.call('catalog.getPaymentQrBase64', {}).then(function (r) { return r.data_uri || ''; }).catch(function () { return ''; });

    qrPromise.then(function (qr) { buildSnapshot(qr); }).catch(function () { buildSnapshot(''); });

    function buildSnapshot(qr) {
    var snap = document.createElement('div');
    snap.style.cssText = 'position:fixed;left:-9999px;top:0;width:640px;background:#fff;padding:28px;font-family:Sarabun,Arial,sans-serif;color:#1a1a1f;box-sizing:border-box';
    snap.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">' +
        '<div style="width:46px;height:46px;border-radius:10px;background:linear-gradient(135deg,#fb923c,#c2410c);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:18px">CK</div>' +
        '<div><div style="font-weight:800;font-size:18px">CK Daily</div><div style="font-size:12.5px;color:#666">by IHC-Central Kitchen</div></div>' +
      '</div>' +
      '<div style="font-size:23px;font-weight:800;margin-bottom:3px">' + (alreadyPaid ? 'ใบเสร็จรับเงิน #' : 'ใบสรุปคำสั่งซื้อ #') + UI.escapeHtml(order.order_no) + '</div>' +
      '<div style="font-size:13.5px;color:#666;margin-bottom:16px">' + UI.fmtTime(order.placed_at) + '</div>' +
      '<div style="border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;padding:10px 0;margin-bottom:14px">' +
        (order.items || []).map(function (i) {
          return '<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:15px">' +
            '<span>' + UI.escapeHtml(i.product_name) + (i.is_frozen ? ' ❄ <span style="color:#2563eb;font-size:12px;font-weight:600">(Freezing)</span>' : '') + ' x' + i.qty + '</span><span>' + UI.money(i.line_total) + '</span></div>';
        }).join('') +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:19px;font-weight:800;margin-bottom:18px"><span>ยอดสุทธิ</span><span>' + UI.money(order.grand_total) + '</span></div>' +
      (alreadyPaid
        ? '<div style="border-top:1px dashed #d1d5db;padding-top:18px;text-align:center">' +
            '<div style="display:inline-flex;align-items:center;gap:6px;background:#dcfce7;color:#166534;font-weight:700;font-size:14px;padding:6px 14px;border-radius:999px;margin-bottom:14px">✅ ชำระเงินเรียบร้อยแล้ว</div>' +
            (qr ? '<img src="' + qr + '" style="display:block;margin:0 auto;width:260px;height:260px;object-fit:contain;border:1px solid #e5e7eb;border-radius:12px;padding:8px">' : '') +
            '<div style="font-size:14px;color:#666;margin-top:10px">QR เลขที่ออเดอร์ #' + UI.escapeHtml(order.order_no) + '</div>' +
          '</div>'
        : '<div style="border-top:1px dashed #d1d5db;padding-top:18px;text-align:center">' +
          (qr ? '<img src="' + qr + '" style="display:block;margin:0 auto;width:340px;height:340px;object-fit:contain;border:1px solid #e5e7eb;border-radius:12px;padding:8px">' : '') +
          '<div style="font-size:14px;color:#666;margin-top:10px">สแกน QR เพื่อชำระเงิน (Mobile Banking ทุกธนาคาร)</div>' +
          (settings && settings.payment_qr_note
            ? '<div style="font-size:15px;color:#1a1a1f;background:#f7f7fa;border-radius:10px;padding:12px 14px;margin-top:10px;line-height:1.6;text-align:left">' + UI.escapeHtml(settings.payment_qr_note).replace(/\n/g, '<br>') + '</div>'
            : '') +
        '</div>' +
        '<div style="font-size:13px;color:#374151;line-height:1.7;margin-top:16px;padding:14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px">' + UI.escapeHtml(PAYMENT_INSTRUCTION_TEXT_) + '</div>'
      );
    document.body.appendChild(snap);

    html2canvas(snap, { backgroundColor: '#ffffff', scale: 2, useCORS: true }).then(function (srcCanvas) {
      document.body.removeChild(snap);
      var outW = 720, outH = 1280;
      var out = document.createElement('canvas');
      out.width = outW; out.height = outH;
      var ctx = out.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, outW, outH);
      var scale = Math.min(outW / srcCanvas.width, outH / srcCanvas.height, 1);
      var w = srcCanvas.width * scale, h = srcCanvas.height * scale;
      ctx.drawImage(srcCanvas, (outW - w) / 2, (outH - h) / 2, w, h);
      var dataUrl = out.toDataURL('image/png');
      resetBtn();
      showImagePopup_(dataUrl, 'order-' + order.order_no + '.png');
    }).catch(function () {
      if (snap.parentNode) document.body.removeChild(snap);
      UI.toast('สร้างรูปภาพไม่สำเร็จ', 'error');
      resetBtn();
    });
    }
  }

  /** data URI (base64) -> File object เพื่อใช้กับ navigator.share (ต้องเป็น File ไม่ใช่ dataURL string) */
  function dataUrlToFile_(dataUrl, filename) {
    var arr = dataUrl.split(','), mimeMatch = arr[0].match(/:(.*?);/);
    var mime = mimeMatch ? mimeMatch[1] : 'image/png';
    var bin = atob(arr[1]);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new File([u8], filename, { type: mime });
  }

  /**
   * popup แสดงรูปภาพในแอปทันที ไม่เปิดด้วยโปรแกรมอื่น ขนาดกล่อง 9:16 เสมอไม่ว่าจอเล็กแค่ไหน
   * ปุ่มบันทึก: บนมือถือที่รองรับ (iOS Safari / Android Chrome) ใช้ navigator.share พร้อมไฟล์รูป
   * เพื่อเปิด share sheet ของเครื่องแล้วเลือก "บันทึกลงรูปภาพ/อัลบั้ม" ได้ทันที ไม่ต้องเปิดเว็บ/แอปอื่น
   * ถ้าเครื่องไม่รองรับ (ส่วนใหญ่ desktop) fallback เป็นดาวน์โหลดไฟล์ปกติ
   */
  function showImagePopup_(dataUrl, filename) {
    var file = dataUrlToFile_(dataUrl, filename);
    var canShareFile = !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
    var saveLabel = canShareFile ? 'บันทึกรูปภาพ' : 'ดาวน์โหลดรูปภาพ';
    var m = UI.modal(
      '<button class="modal-close" onclick="this.closest(\'.modal-backdrop\').remove()">✕</button>' +
      '<h3 style="margin-bottom:10px">ใบสรุปคำสั่งซื้อ</h3>' +
      '<div style="width:100%;aspect-ratio:9/16;background:#000;border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center">' +
        '<img src="' + dataUrl + '" style="width:100%;height:100%;object-fit:contain">' +
      '</div>' +
      '<button id="popupDownloadBtn" class="btn btn-primary btn-block" style="margin-top:14px">' + Icon('download', 16) + ' ' + saveLabel + '</button>'
    );
    document.getElementById('popupDownloadBtn').onclick = function () {
      if (canShareFile) {
        navigator.share({ files: [file], title: 'ใบสรุปคำสั่งซื้อ #' + order.order_no }).catch(function () { /* ผู้ใช้กดยกเลิก share sheet เอง ไม่ต้องแจ้ง error */ });
        return;
      }
      var link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      link.click();
    };
  }
};
