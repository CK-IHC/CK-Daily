/**
 * views/orders.js — ออเดอร์ทั้งหมด (filter/search + เปลี่ยนสถานะ) + modal รายละเอียด (รูป/หมายเหตุ) + พิมพ์
 */
var ORDER_STATUS_LIST_ = ['pending', 'in_progress', 'completed', 'cancelled'];
/** เปลี่ยนสถานะได้อิสระทุกทิศทาง (ตามคำขอให้แก้ไขสถานะผิดพลาดย้อนหลังได้) — ต้องตรงกับ ORDER_TRANSITIONS ฝั่ง backend */
var ORDER_NEXT_STATUS_ = ORDER_STATUS_LIST_.reduce(function (m, s) {
  m[s] = ORDER_STATUS_LIST_.filter(function (x) { return x !== s; });
  return m;
}, {});

/** เปิด modal รายละเอียดออเดอร์ — ใช้ร่วมกันจากทั้งหน้า Orders และ Kanban */
function openOrderDetailModal(orderId, onChange) {
  var m = UI.modal('<div id="odBody">' + UI.loading() + '</div>');
  load();

  function load() {
    Api.call('order.detail', { order_id: orderId }).then(render).catch(function (err) { UI.toast(err.message, 'error'); });
  }

  function render(order) {
    var body = document.getElementById('odBody');
    if (!body) return; // ผู้ใช้ปิด modal ไปแล้วก่อนตอบกลับ
    if (!order) { body.innerHTML = '<div class="empty-state">ไม่พบออเดอร์</div>'; return; }
    var items = order.items || [];
    body.innerHTML =
      '<button class="modal-close" onclick="this.closest(\'.modal-backdrop\').remove()">✕</button>' +
      '<h3>ออเดอร์ #' + order.order_no + (order.has_frozen ? ' ' + Icon('snowflake', 16, 'display:inline-block;vertical-align:middle;color:#2563eb') : '') +
      ' <span class="chip ' + order.status + '">' + UI.statusLabel(order.status) + '</span></h3>' +
      '<div style="font-size:13px;color:var(--text-muted);margin-bottom:8px">' + UI.escapeHtml(order.customer_name) + ' · ' + order.phone + (order.department ? ' · ' + UI.escapeHtml(order.department) : '') + ' · ' + UI.fmtTime(order.placed_at) + '</div>' +
      (order.delivery_note ? '<div style="font-size:13px;background:#fff7ed;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;margin-bottom:10px;white-space:pre-wrap"><b>หมายเหตุจากลูกค้า:</b> ' + UI.escapeHtml(order.delivery_note) + '</div>' : '') +
      '<button id="odPrintBtn" class="btn btn-outline btn-sm" style="margin-bottom:12px">🖨️ พิมพ์ใบเสร็จ</button>' +
      (items.length ? '<div class="table-wrap"><table><thead><tr><th></th><th>สินค้า</th><th>จำนวน</th><th>ยอด</th></tr></thead><tbody>' +
        items.map(function (i) { return '<tr><td>' + (i.is_frozen ? Icon('snowflake', 13, 'color:#2563eb') : '') + '</td><td>' + UI.escapeHtml(i.product_name) + '</td><td>' + i.qty + '</td><td>' + UI.money(i.line_total) + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : '') +
      '<div class="summary-row total" style="margin:10px 0"><span>ยอดสุทธิ</span><span>' + UI.money(order.grand_total) + '</span></div>' +
      '<h4>เปลี่ยนสถานะ</h4>' +
      '<div style="display:flex;gap:8px;margin-bottom:14px">' +
        '<select id="odStatusSelect" class="form-control" style="width:auto">' +
          (ORDER_NEXT_STATUS_[order.status] || []).map(function (s) { return '<option value="' + s + '">' + UI.statusLabel(s) + '</option>'; }).join('') +
        '</select>' +
        '<button id="odStatusApply" class="btn btn-primary btn-sm">อัปเดตสถานะ</button>' +
      '</div>' +
      '<h4>รูปแนบออเดอร์</h4>' +
      '<div id="odPhotoArea" style="margin-bottom:14px">' +
        (order.photo_url
          ? '<img id="odPhotoThumb" src="' + order.photo_url + '" style="width:120px;height:120px;object-fit:cover;border-radius:10px;cursor:zoom-in;border:1px solid var(--border)">'
          : '<div class="empty-state" style="padding:16px">ยังไม่มีรูปแนบ</div>') +
      '</div>' +
      '<input type="file" id="odPhotoInput" accept="image/*" style="display:none">' +
      '<button id="odPhotoBtn" class="btn btn-outline btn-sm">' + Icon('camera', 14) + ' ' + (order.photo_url ? 'เปลี่ยนรูป' : 'แนบรูป') + '</button>' +
      '<span style="font-size:11px;color:var(--text-muted);margin-left:8px">แนะนำไม่เกิน 3MB/รูป (ประมาณ 1024×1024px กำลังดี ไม่ใหญ่/ช้าเกินไป)</span>' +
      '<h4 style="margin-top:18px">หมายเหตุภายใน (staff)</h4>' +
      '<textarea id="odNoteInput" class="form-control" rows="3" placeholder="">' + UI.escapeHtml(order.admin_note || '') + '</textarea>' +
      '<button id="odNoteSaveBtn" class="btn btn-primary btn-sm" style="margin-top:8px">บันทึกหมายเหตุ</button>';

    var thumb = document.getElementById('odPhotoThumb');
    if (thumb) thumb.onclick = function () { openLightbox_(order.photo_url); };

    document.getElementById('odPrintBtn').onclick = function () { printOrderReceipt(order); };
    var statusApplyBtn = document.getElementById('odStatusApply');
    if (statusApplyBtn) statusApplyBtn.onclick = function () {
      var status = document.getElementById('odStatusSelect').value;
      if (!status) return;
      var reason = status === 'cancelled' ? prompt('ระบุเหตุผลการยกเลิก:') : null;
      Api.call('admin.orders.updateStatus', { order_id: orderId, status: status, reason: reason }).then(function () {
        UI.toast('อัปเดตสถานะเป็น ' + UI.statusLabel(status) + ' แล้ว', 'success'); load(); if (onChange) onChange();
      }).catch(function (err) { UI.toast(err.message, 'error'); });
    };
    document.getElementById('odPhotoBtn').onclick = function () { document.getElementById('odPhotoInput').click(); };
    document.getElementById('odPhotoInput').onchange = function (e) {
      var file = e.target.files[0]; if (!file) return;
      if (file.size > 5 * 1024 * 1024) { UI.toast('ไฟล์ใหญ่เกิน 5MB กรุณาเลือกรูปที่เล็กกว่านี้', 'error'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        Api.call('admin.orders.uploadPhoto', { order_id: orderId, image_base64: reader.result }).then(function () {
          UI.toast('แนบรูปแล้ว', 'success'); load(); if (onChange) onChange();
        }).catch(function (err) { UI.toast(err.message, 'error'); });
      };
      reader.readAsDataURL(file);
    };

    document.getElementById('odNoteSaveBtn').onclick = function () {
      Api.call('admin.orders.setNote', { order_id: orderId, admin_note: document.getElementById('odNoteInput').value }).then(function () {
        UI.toast('บันทึกหมายเหตุแล้ว', 'success'); if (onChange) onChange();
      }).catch(function (err) { UI.toast(err.message, 'error'); });
    };
  }
}

function openLightbox_(url) {
  var box = document.createElement('div');
  box.className = 'modal-backdrop';
  box.style.zIndex = 90;
  box.innerHTML = '<img src="' + url + '" style="max-width:92vw;max-height:92vh;border-radius:10px;cursor:zoom-out">';
  box.onclick = function () { box.remove(); };
  document.body.appendChild(box);
}

/** แกลเลอรีดูสลิปหลายใบ (ลูกค้าแนบซ้ำ) — เลื่อนดูทีละใบพร้อมเลขนับใบที่ N/ทั้งหมด */
function openSlipGalleryLightbox_(dataUris) {
  var idx = 0;
  var box = document.createElement('div');
  box.className = 'modal-backdrop';
  box.style.zIndex = 90;
  function render() {
    box.innerHTML =
      '<div style="position:relative;max-width:92vw;max-height:92vh" onclick="event.stopPropagation()">' +
        '<img src="' + dataUris[idx] + '" style="max-width:92vw;max-height:92vh;border-radius:10px;display:block">' +
        (dataUris.length > 1
          ? '<div style="position:absolute;bottom:10px;left:0;right:0;display:flex;justify-content:center;gap:10px;align-items:center">' +
              '<button id="slipPrev" class="btn btn-sm btn-outline" style="background:#fff">‹ ก่อนหน้า</button>' +
              '<span style="background:#fff;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:700">สลิปที่แนบ ' + (idx + 1) + '/' + dataUris.length + '</span>' +
              '<button id="slipNext" class="btn btn-sm btn-outline" style="background:#fff">ถัดไป ›</button>' +
            '</div>'
          : '') +
      '</div>';
    if (dataUris.length > 1) {
      box.querySelector('#slipPrev').onclick = function () { idx = (idx - 1 + dataUris.length) % dataUris.length; render(); };
      box.querySelector('#slipNext').onclick = function () { idx = (idx + 1) % dataUris.length; render(); };
    }
  }
  render();
  box.onclick = function () { box.remove(); };
  document.body.appendChild(box);
}

/**
 * เปิดดูสลิปโอนเงินของออเดอร์ทั้งหมดที่เคยแนบ (รองรับแนบซ้ำหลายครั้ง แสดงเป็นแกลเลอรี) ดึงเป็น data URI
 * จากเซิร์ฟเวอร์เราเองผ่าน order.getSlipsBase64 แทนการลิงก์ไป Drive ตรงๆ (บาง Google Workspace บล็อกการ
 * แชร์ไฟล์แบบ "Anyone with the link") ใช้ร่วมกันทั้งหน้า Orders (modal พบออเดอร์จากสแกน QR) และหน้า Payments (ตรวจสอบสลิป)
 */
function viewSlipInLightbox_(orderId, btn) {
  var original = btn.innerHTML;
  btn.textContent = 'กำลังโหลด...'; btn.disabled = true;
  Api.call('order.getSlipsBase64', { order_id: orderId }).then(function (r) {
    btn.innerHTML = original; btn.disabled = false;
    if (!r.data_uris || !r.data_uris.length) { UI.toast('ไม่พบไฟล์สลิป', 'error'); return; }
    openSlipGalleryLightbox_(r.data_uris);
  }).catch(function (err) { btn.innerHTML = original; btn.disabled = false; UI.toast(err.message, 'error'); });
}

/** สร้างบรรทัด "พิมพ์โดย/วันที่พิมพ์" สำหรับหน้าพิมพ์ popup (about:blank ไม่มี UI.printHeaderHtml ให้ใช้ตรงๆ) */
function printedByHtml_() {
  var admin = State.user ? (State.user.name || State.user.phone) : '-';
  var now = new Date().toLocaleString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return 'พิมพ์โดย: <b>' + UI.escapeHtml(admin) + '</b> &nbsp;|&nbsp; วันที่พิมพ์: <b>' + now + '</b>';
}

/**
 * สไตล์ร่วมของใบเสร็จ (ใช้ทั้งพิมพ์ใบเดียวและพิมพ์เป็นชุด)
 * @page margin-bottom เว้นไว้กว้างกว่า footer (bottom:8mm) มาก เพื่อกันไม่ให้ footer (fixed) ทับ
 * เนื้อหาใบเสร็จใบสุดท้ายของแต่ละหน้า — เนื้อหาจะหยุดที่ขอบ margin-bottom นี้เสมอตามสเปคของเบราว์เซอร์
 */
var RECEIPT_STYLE_ =
  '@page{size:A4;margin:14mm 12mm 26mm 12mm}' +
  'body{font-family:Arial,sans-serif;padding:20px 20px 46px;color:#000}' +
  '.receipt{max-width:360px;margin:0 auto}' +
  '.receipt-page{page-break-after:always;page-break-inside:avoid}' +
  '.head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}' +
  '.head>div:first-child{min-width:0}' +
  '.head img{flex:none}' +
  '.brand{font-size:16px;font-weight:800}.sub{font-size:11px;color:#666}' +
  '.no{font-size:22px;font-weight:800;margin-top:6px}' +
  '.print-doc-rule{border:none;border-top:1px solid #999;margin:8px 0}' +
  'table{width:100%;border-collapse:collapse;margin-top:14px;font-size:13px}' +
  'th{border-bottom:1px solid #333;text-align:left;padding:4px 2px;font-size:11px}' +
  'td{padding:5px 2px;border-bottom:1px dashed #ccc}' +
  '.total{display:flex;justify-content:space-between;font-size:16px;font-weight:800;margin-top:12px;border-top:1px solid #333;padding-top:8px}' +
  '.meta{font-size:12px;color:#444;margin-top:14px}' +
  '.print-doc-footer{font-size:10px;color:#333;position:fixed;bottom:8mm;left:12mm}' +
  '.receipt-page:last-child,.a4-sheet:last-child{page-break-after:auto}';

/**
 * สไตล์เฉพาะโหมดพิมพ์หลายใบเสร็จต่อแผ่น A4 แนวนอน (2-10 ใบ/แผ่น)
 * grid-auto-rows:auto (ไม่ใช่ 1fr) — แต่ละแถวของกริดสูงเท่ากับใบเสร็จที่สูงที่สุด "ในแถวนั้น" เท่านั้น (ไม่บังคับ
 * เท่ากันทั้งแผ่น) กันปัญหาใบเสร็จที่มีรายการสินค้าเยอะถูกบีบจนเนื้อหาล้นออกนอกกรอบ/ถูกตัดที่ขอบกระดาษ
 * ส่วน .receipt ยัง height:100% + flex เหมือนเดิม จึงยังสูงเท่ากันกับใบข้างเคียง "ในแถวเดียวกัน" (align-items:stretch
 * ของ grid เป็นค่า default อยู่แล้ว) แล้วดันยอดสุทธิ (.total) ไปชิดล่างด้วย margin-top:auto ให้ดูเป็นระเบียบ
 * @page margin-bottom กว้างกว่าเดิม (8mm → 20mm) เพื่อเผื่อพื้นที่ footer "พิมพ์โดย" ไม่ให้ทับใบเสร็จแถวล่างสุด
 */
var RECEIPT_GRID_STYLE_ =
  '@page{size:A4 landscape;margin:8mm 8mm 20mm 8mm}' +
  '.a4-sheet{display:grid;grid-auto-rows:auto;gap:6mm;page-break-after:always}' +
  '.a4-sheet .receipt{max-width:none;width:100%;border:1px dashed #bbb;border-radius:6px;padding:12px;box-sizing:border-box;height:100%;display:flex;flex-direction:column;page-break-inside:avoid}' +
  '.a4-sheet .receipt .total{margin-top:auto}' +
  '.a4-sheet .receipt img{width:64px;height:64px}' +
  '.a4-sheet .no{font-size:1.3em}.a4-sheet .brand{font-size:1.2em}';

/** เนื้อหาใบเสร็จหนึ่งใบ — รายการสินค้าครบ + QR code มุมบนขวา + รายละเอียดลูกค้า/เวลา */
function receiptPageHtml_(order) {
  var items = order.items || [];
  var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=' + encodeURIComponent(order.order_id);
  var itemRows = items.map(function (i) {
    return '<tr><td>' + UI.escapeHtml(i.product_name) + (i.is_frozen ? ' ❄️' : '') + '</td><td style="text-align:center">' + i.qty + '</td><td style="text-align:right">' + UI.money(i.line_total) + '</td></tr>';
  }).join('');
  return '<div class="receipt">' +
    '<div class="head"><div><div class="brand">CK Daily</div><div class="sub">by IHC-Central Kitchen</div><div class="no">ใบเสร็จ #' + UI.escapeHtml(order.order_no) + '</div></div>' +
    '<img src="' + qrUrl + '" width="90" height="90" alt="QR"></div>' +
    '<hr class="print-doc-rule">' +
    '<div class="meta">' + UI.escapeHtml(order.customer_name || '') + ' · ' + UI.escapeHtml(order.phone || '') + (order.department ? ' · ' + UI.escapeHtml(order.department) : '') + '<br>' + UI.fmtTime(order.placed_at) + '</div>' +
    (order.delivery_note ? '<div class="meta" style="margin-top:4px"><b>หมายเหตุ:</b> ' + UI.escapeHtml(order.delivery_note) + '</div>' : '') +
    '<table><thead><tr><th>รายการ</th><th style="text-align:center">จำนวน</th><th style="text-align:right">ยอด</th></tr></thead><tbody>' + itemRows + '</tbody></table>' +
    '<div class="total"><span>ยอดสุทธิ</span><span>' + UI.money(order.grand_total) + '</span></div>' +
  '</div>';
}

/** พิมพ์ใบเสร็จออเดอร์เดียว (ดึงรายการสินค้าเต็มจาก order.detail เสมอ) */
function printOrderReceipt(orderRow) {
  Api.call('order.detail', { order_id: orderRow.order_id }).then(function (order) {
    var win = window.open('', '_blank', 'width=420,height=640');
    if (!win) { UI.toast('เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตแล้วลองใหม่', 'error'); return; }
    var html = '<!DOCTYPE html><html><head><title>ใบเสร็จ #' + UI.escapeHtml(order.order_no) + '</title><meta charset="utf-8">' +
      '<style>' + RECEIPT_STYLE_ + '</style></head><body>' +
      receiptPageHtml_(order) +
      '<div class="print-doc-footer">' + printedByHtml_() + '</div>' +
      '<script>window.onload=function(){window.print();};<\/script>' +
      '</body></html>';
    win.document.open(); win.document.write(html); win.document.close();
  }).catch(function (err) { UI.toast(err.message, 'error'); });
}

function receiptPagesWrap_(bodyHtml, count, extraStyle) {
  return '<!DOCTYPE html><html><head><title>ใบเสร็จ (' + count + ' รายการ)</title><meta charset="utf-8">' +
    '<style>' + RECEIPT_STYLE_ + (extraStyle || '') + '</style></head><body>' +
    bodyHtml +
    '<div class="print-doc-footer">' + printedByHtml_() + '</div>' +
    '<script>window.onload=function(){window.print();};<\/script>' +
    '</body></html>';
}

/**
 * พิมพ์ใบเสร็จเป็นชุด พร้อมรายละเอียดสินค้าครบทุกใบ (ใช้แทนพิมพ์ป้ายเดิม)
 * perSheet: จำนวนใบเสร็จต่อแผ่น A4 (1-10) — 1 = หนึ่งออเดอร์ต่อหนึ่งหน้าแบบเดิม, มากกว่านั้นจัดเป็นตารางในแผ่นเดียว
 */
function printOrderReceiptsBatch(orders, perSheet) {
  if (!orders.length) { UI.toast('ไม่มีออเดอร์ให้พิมพ์ใบเสร็จ', 'error'); return; }
  perSheet = Math.max(1, Math.min(10, parseInt(perSheet, 10) || 1));
  var win = window.open('', '_blank', 'width=420,height=640');
  if (!win) { UI.toast('เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตแล้วลองใหม่', 'error'); return; }
  Promise.all(orders.map(function (o) { return Api.call('order.detail', { order_id: o.order_id }); })).then(function (details) {
    var html;
    if (perSheet <= 1) {
      var pagesHtml = details.map(function (order) { return '<div class="receipt-page">' + receiptPageHtml_(order) + '</div>'; }).join('');
      html = receiptPagesWrap_(pagesHtml, details.length);
    } else {
      // กระดาษแนวนอน (297x210mm, อัตราส่วนกว้าง:สูง ~1.41) — จัดจำนวนคอลัมน์ให้เข้ากับสัดส่วนแนวนอน
      // เช่นเลือก 3 ใบ/แผ่น จะได้ 3 คอลัมน์ 1 แถว (เรียงตามแนวนอนพอดี) แทนที่จะเป็นตาราง 2x2 แบบกระดาษแนวตั้ง
      // เน้นความกว้างของแต่ละใบเสร็จเป็นหลัก (จำกัดไม่เกิน 3 คอลัมน์เสมอ) — จำนวนน้อย (≤3) เรียงแถวเดียวกว้างสุด
      // จำนวนมากขึ้นค่อยเพิ่มคอลัมน์เท่าที่จำเป็น แทนที่จะบีบเป็นตารางสี่เหลี่ยมจัตุรัสซึ่งทำให้แต่ละใบแคบเกินไป
      var cols = perSheet <= 3 ? perSheet : Math.min(3, Math.ceil(Math.sqrt(perSheet)));
      var fontSize = perSheet <= 2 ? 14 : perSheet <= 4 ? 13 : perSheet <= 6 ? 12 : perSheet <= 9 ? 11 : 10;
      var groups = [];
      for (var i = 0; i < details.length; i += perSheet) groups.push(details.slice(i, i + perSheet));
      var sheetsHtml = groups.map(function (grp) {
        return '<div class="a4-sheet" style="grid-template-columns:repeat(' + cols + ',1fr);font-size:' + fontSize + 'px">' +
          grp.map(function (order) { return receiptPageHtml_(order); }).join('') +
          '</div>';
      }).join('');
      html = receiptPagesWrap_(sheetsHtml, details.length, RECEIPT_GRID_STYLE_);
    }
    win.document.open(); win.document.write(html); win.document.close();
  }).catch(function (err) { win.close(); UI.toast(err.message, 'error'); });
}

/** พิมพ์รายงานสรุปออเดอร์ทั้งหมดที่กรองอยู่ในตาราง (เลขที่/ลูกค้า/ยอด/สถานะ) */
function printOrdersReport(items, total) {
  var win = window.open('', '_blank', 'width=700,height=800');
  if (!win) { UI.toast('เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตแล้วลองใหม่', 'error'); return; }
  var rows = items.map(function (o) {
    return '<tr><td>#' + UI.escapeHtml(o.order_no) + '</td><td>' + UI.escapeHtml(o.customer_name) + '</td><td>' + UI.escapeHtml(o.phone) + '</td><td>' + UI.escapeHtml(o.department || '-') + '</td>' +
      '<td style="text-align:right">' + UI.money(o.grand_total) + '</td><td>' + UI.statusLabel(o.status) + '</td><td>' + UI.escapeHtml(o.delivery_note || '-') + '</td></tr>';
  }).join('');
  var sum = items.reduce(function (s, o) { return s + Number(o.grand_total || 0); }, 0);
  var html = '<!DOCTYPE html><html><head><title>รายงานออเดอร์</title><meta charset="utf-8">' +
    '<style>@page{size:A4;margin:14mm 12mm 26mm 12mm}' +
    'body{font-family:Arial,sans-serif;padding:24px 24px 46px;color:#000}' +
    '.print-doc-brand{line-height:1.3}.print-doc-brand b{font-size:17px}.print-doc-brand span{display:block;font-size:11px;color:#555}' +
    '.print-doc-title{font-size:20px;margin:10px 0 4px}' +
    '.print-doc-rule{border:none;border-top:2px solid #111;margin:10px 0 16px}' +
    '.print-doc-footer{font-size:10px;color:#333;position:fixed;bottom:8mm;left:12mm}' +
    '.sub{color:#666;font-size:12px;margin-bottom:16px}' +
    'table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}' +
    'th{background:#f3f4f6}tfoot td{font-weight:800;border-top:2px solid #333}tr{page-break-inside:avoid}thead{display:table-header-group}</style></head><body>' +
    '<div class="print-doc-brand"><b>CK Daily</b><span>by IHC-Central Kitchen</span></div>' +
    '<h2 class="print-doc-title">รายงานออเดอร์</h2>' +
    '<hr class="print-doc-rule">' +
    '<div class="sub">ทั้งหมด ' + total + ' รายการ (แสดง ' + items.length + ' รายการในหน้านี้)</div>' +
    '<table><thead><tr><th>เลขที่</th><th>ลูกค้า</th><th>เบอร์</th><th>แผนก</th><th style="text-align:right">ยอด</th><th>สถานะ</th><th>หมายเหตุ</th></tr></thead><tbody>' + rows + '</tbody>' +
    '<tfoot><tr><td colspan="4">รวม</td><td style="text-align:right">' + UI.money(sum) + '</td><td></td><td></td></tr></tfoot></table>' +
    '<div class="print-doc-footer">' + printedByHtml_() + '</div>' +
    '<script>window.onload=function(){window.print();};<\/script></body></html>';
  win.document.open(); win.document.write(html); win.document.close();
}

/**
 * สแกน QR ออเดอร์ผ่านกล้อง พร้อมช่องกรอกเลขที่สำรองถ้าเปิดกล้องไม่ได้
 * ใช้ BarcodeDetector API เมื่อมี (เร็วกว่า) แต่ Safari/iOS ไม่รองรับ API นี้เลย
 * จึง fallback ไปใช้ jsQR (ไลบรารีถอดรหัส QR ด้วย JS ล้วน อ่านภาพจาก canvas)
 * ซึ่งทำงานได้บนกล้องของทุกเบราว์เซอร์รวมถึง iOS Safari
 */
function openScanModal(onOrderFound) {
  var m = UI.modal(
    '<button class="modal-close" onclick="this.closest(\'.modal-backdrop\').remove()">✕</button>' +
    '<h3>สแกน QR ออเดอร์</h3>' +
    '<div id="scanArea"></div>' +
    '<div class="form-group" style="margin-top:12px"><label>หรือกรอกเลขที่ออเดอร์เอง</label>' +
    '<div style="display:flex;gap:8px"><input id="scanManualInput" class="form-control" placeholder="เช่น 2607-001">' +
    '<button id="scanManualBtn" class="btn btn-outline">ค้นหา</button></div></div>'
  );
  var area = document.getElementById('scanArea');
  var stream = null, rafId = null, resolved = false;

  function stopStream() {
    if (rafId) cancelAnimationFrame(rafId);
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
  }

  function resolveOrder(text) {
    text = String(text || '').trim();
    if (!text || resolved) return;
    resolved = true;
    var call = text.indexOf('ORD-') === 0
      ? Api.call('order.detail', { order_id: text })
      : Api.call('admin.orders.findByOrderNo', { order_no: text });
    call.then(function (order) {
      stopStream(); m.remove(); onOrderFound(order);
    }).catch(function (err) { resolved = false; UI.toast(err.message, 'error'); });
  }

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    area.innerHTML = '<video id="scanVideo" autoplay playsinline muted style="width:100%;border-radius:10px;background:#000"></video>';
    var video = document.getElementById('scanVideo');
    var useNative = 'BarcodeDetector' in window;
    var detector = useNative ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
    var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (s) {
      stream = s; video.srcObject = s;
      var tickNative = function () {
        if (!video.videoWidth) { rafId = requestAnimationFrame(tickNative); return; }
        detector.detect(video).then(function (codes) {
          if (codes.length) resolveOrder(codes[0].rawValue);
          else rafId = requestAnimationFrame(tickNative);
        }).catch(function () { rafId = requestAnimationFrame(tickNative); });
      };
      var tickJsQr = function () {
        if (!video.videoWidth || typeof window.jsQR !== 'function') { rafId = requestAnimationFrame(tickJsQr); return; }
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code && code.data) resolveOrder(code.data);
        else rafId = requestAnimationFrame(tickJsQr);
      };
      rafId = requestAnimationFrame(useNative ? tickNative : tickJsQr);
    }).catch(function () {
      area.innerHTML = '<div class="empty-state" style="padding:16px">เปิดกล้องไม่ได้ กรุณาใช้ช่องกรอกเลขที่ออเดอร์ด้านล่างแทน (ตรวจสอบว่าอนุญาตให้เว็บนี้ใช้กล้องแล้ว)</div>';
    });
  } else {
    area.innerHTML = '<div class="empty-state" style="padding:16px">เบราว์เซอร์นี้ไม่รองรับกล้อง กรุณากรอกเลขที่ออเดอร์ด้านล่างแทน</div>';
  }

  m.addEventListener('click', function (e) { if (e.target === m) stopStream(); });
  var closeBtn = m.querySelector('.modal-close');
  if (closeBtn) closeBtn.addEventListener('click', stopStream);
  document.getElementById('scanManualBtn').onclick = function () { resolveOrder(document.getElementById('scanManualInput').value); };
}

var PAYMENT_STATUS_LABEL_ = { unpaid: '⏳ รอชำระเงิน', pending_verify: '🔍 รอตรวจสอบสลิป', paid: '✅ ชำระเงินแล้ว', refunded: '↩️ คืนเงินแล้ว' };

/** แสดงผลออเดอร์ที่สแกนเจอ พร้อมสถานะการชำระเงิน/สลิป/รายการสินค้า และเปลี่ยนสถานะได้ทันที */
function showScanResultModal(order, onDone) {
  var nextOptions = (ORDER_NEXT_STATUS_[order.status] || []).map(function (s) { return '<option value="' + s + '">' + UI.statusLabel(s) + '</option>'; }).join('');
  var items = order.items || [];
  var pendingVerify = order.payment_status === 'pending_verify';
  var m2 = UI.modal(
    '<button class="modal-close" onclick="this.closest(\'.modal-backdrop\').remove()">✕</button>' +
    '<h3>พบออเดอร์ #' + UI.escapeHtml(order.order_no) + '</h3>' +
    '<div style="font-size:13px;color:var(--text-muted);margin-bottom:10px">' + UI.escapeHtml(order.customer_name) + ' · ' + order.phone + '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">' +
      '<span class="chip ' + order.status + '">' + UI.statusLabel(order.status) + '</span>' +
      '<span class="chip ' + order.payment_status + '">' + (PAYMENT_STATUS_LABEL_[order.payment_status] || order.payment_status) + '</span>' +
    '</div>' +
    (order.slip_url
      ? '<div style="margin-bottom:14px"><button id="scanViewSlipBtn" class="btn btn-outline btn-sm">🖼️ ดูสลิปการโอนเงิน</button>' +
        (pendingVerify
          ? ' <button id="scanApprovePay" class="btn btn-sm btn-approve">✅ อนุมัติ</button> <button id="scanRejectPay" class="btn btn-sm btn-reject">❌ ปฏิเสธ</button>'
          : '') +
        '</div>'
      : '') +
    (items.length
      ? '<div style="font-size:13px;font-weight:600;margin-bottom:6px">รายการสั่งซื้อ</div>' +
        '<div style="font-size:13px;color:var(--text-muted);margin-bottom:14px">' +
          items.map(function (i) { return '<div style="display:flex;justify-content:space-between;padding:3px 0">' +
            '<span>' + UI.escapeHtml(i.product_name) + (i.is_frozen ? ' ❄️' : '') + ' x' + i.qty + '</span><span>' + UI.money(i.line_total) + '</span></div>'; }).join('') +
        '</div>'
      : '') +
    (items.length
      ? '<div style="font-size:13px;font-weight:600;margin-bottom:6px">สรุปค่าใช้จ่าย</div>' +
        '<div style="font-size:13px;border-top:1px solid var(--border);padding-top:8px;margin-bottom:14px">' +
          '<div style="display:flex;justify-content:space-between;padding:2px 0;color:var(--text-muted)"><span>ยอดรวมสินค้า</span><span>' + UI.money(order.subtotal) + '</span></div>' +
          (order.discount ? '<div style="display:flex;justify-content:space-between;padding:2px 0;color:var(--text-muted)"><span>ส่วนลด' + (order.coupon_code ? ' (' + UI.escapeHtml(order.coupon_code) + ')' : '') + '</span><span>-' + UI.money(order.discount) + '</span></div>' : '') +
          (order.delivery_fee ? '<div style="display:flex;justify-content:space-between;padding:2px 0;color:var(--text-muted)"><span>ค่าส่ง</span><span>' + UI.money(order.delivery_fee) + '</span></div>' : '') +
          '<div style="display:flex;justify-content:space-between;padding:4px 0;font-weight:800;font-size:15px"><span>ยอดสุทธิ</span><span>' + UI.money(order.grand_total) + '</span></div>' +
        '</div>'
      : '') +
    (nextOptions ? '<div class="form-group"><label>เปลี่ยนสถานะเป็น</label><select id="scanStatusSelect" class="form-control"><option value="">เลือกสถานะใหม่...</option>' + nextOptions + '</select></div>' +
      '<button id="scanStatusApply" class="btn btn-primary" style="width:100%">อัปเดตสถานะ</button>' :
      '<div class="empty-state" style="padding:10px">ออเดอร์นี้เปลี่ยนสถานะต่อไม่ได้แล้ว</div>')
  );
  var viewSlipBtn = document.getElementById('scanViewSlipBtn');
  if (viewSlipBtn) viewSlipBtn.onclick = function () { viewSlipInLightbox_(order.order_id, viewSlipBtn); };
  var approveBtn = document.getElementById('scanApprovePay');
  if (approveBtn) approveBtn.onclick = function () {
    Api.call('admin.orders.verifyPayment', { order_id: order.order_id, approve: true }).then(function () {
      UI.toast('อนุมัติแล้ว', 'success'); m2.remove(); if (onDone) onDone();
    }).catch(function (err) { UI.toast(err.message, 'error'); });
  };
  var rejectBtn = document.getElementById('scanRejectPay');
  if (rejectBtn) rejectBtn.onclick = function () {
    if (!confirm('ยืนยันปฏิเสธสลิปนี้?')) return;
    Api.call('admin.orders.verifyPayment', { order_id: order.order_id, approve: false }).then(function () {
      UI.toast('ปฏิเสธแล้ว', 'success'); m2.remove(); if (onDone) onDone();
    }).catch(function (err) { UI.toast(err.message, 'error'); });
  };
  var applyBtn = document.getElementById('scanStatusApply');
  if (applyBtn) applyBtn.onclick = function () {
    var status = document.getElementById('scanStatusSelect').value;
    if (!status) { UI.toast('เลือกสถานะก่อน', 'error'); return; }
    var reason = status === 'cancelled' ? prompt('ระบุเหตุผลการยกเลิก:') : null;
    Api.call('admin.orders.updateStatus', { order_id: order.order_id, status: status, reason: reason }).then(function () {
      UI.toast('อัปเดตสถานะแล้ว', 'success'); m2.remove(); if (onDone) onDone();
    }).catch(function (err) { UI.toast(err.message, 'error'); });
  };
}

Views.orders = function (container) {
  var filters = { status: '', payment_status: '', phone: '', round_id: '' };
  var page = 1, lastData = null, tab = 'list', rounds = [];

  container.innerHTML =
    '<div class="card">' +
      '<div class="tabs-row no-print"><button class="tab-btn active" data-tab="list">รายการ</button><button class="tab-btn" data-tab="detail">รายละเอียด</button><button class="tab-btn" data-tab="summary">สรุปยอด</button></div>' +
      '<div class="filters-row">' +
        '<select id="fStatus" class="form-control"><option value="">ทุกสถานะ</option>' + ORDER_STATUS_LIST_.map(function (s) { return '<option value="' + s + '">' + UI.statusLabel(s) + '</option>'; }).join('') + '</select>' +
        '<select id="fPayment" class="form-control"><option value="">การชำระเงินทั้งหมด</option><option value="unpaid">ยังไม่ชำระ</option><option value="pending_verify">รอตรวจสอบ</option><option value="paid">ชำระแล้ว</option></select>' +
        '<select id="fRound" class="form-control"><option value="">ทุกรอบ</option></select>' +
        '<input id="fPhone" class="form-control" placeholder="ค้นหาเบอร์โทร">' +
        '<button id="btnFilter" class="btn btn-outline">กรอง</button>' +
        '<button id="btnScan" class="btn btn-outline">📷 สแกน QR</button>' +
        '<button id="btnReceipts" class="btn btn-outline">🧾 พิมพ์ใบเสร็จ</button>' +
        '<button id="btnExport" class="btn btn-outline">Export CSV</button>' +
        '<button id="btnPrintReport" class="btn btn-outline">🖨️ พิมพ์รายงาน</button>' +
      '</div>' +
      '<div id="tableArea">' + UI.loading() + '</div>' +
    '</div>';

  Api.call('admin.rounds.list').then(function (data) {
    rounds = data;
    var sel = document.getElementById('fRound');
    if (!sel) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อนตอบกลับ
    sel.insertAdjacentHTML('beforeend', rounds.map(function (r) { return '<option value="' + r.round_id + '">' + UI.escapeHtml(r.round_name) + '</option>'; }).join(''));
  }).catch(function () {});

  container.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.onclick = function () {
      container.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active'); tab = btn.dataset.tab; page = 1; load();
    };
  });

  document.getElementById('btnFilter').onclick = function () {
    filters.status = document.getElementById('fStatus').value;
    filters.payment_status = document.getElementById('fPayment').value;
    filters.round_id = document.getElementById('fRound').value;
    filters.phone = document.getElementById('fPhone').value.trim();
    page = 1; load();
  };
  document.getElementById('btnExport').onclick = function () {
    if (!lastData) return;
    UI.exportCsv('orders.csv', lastData.items.map(function (o) {
      return { order_no: o.order_no, customer: o.customer_name, phone: o.phone, status: o.status, payment_status: o.payment_status, grand_total: o.grand_total, placed_at: o.placed_at };
    }));
  };
  document.getElementById('btnPrintReport').onclick = function () {
    if (!lastData) return;
    // พิมพ์ตามแท็บที่กำลังเปิดดูอยู่จริง ไม่ใช่ข้อมูลค้างจากแท็บอื่นที่เคยโหลดไว้ก่อนหน้า
    if (tab === 'list') { printOrdersReport(lastData.items, lastData.total); return; }
    var titles = { detail: 'รายละเอียดออเดอร์ (จัดกลุ่มตามเบอร์โทร)', summary: 'สรุปยอดขาย' };
    UI.printWithHeader(titles[tab] || 'รายงานออเดอร์', document.getElementById('tableArea'));
  };
  document.getElementById('btnScan').onclick = function () {
    openScanModal(function (order) { showScanResultModal(order, load); });
  };
  document.getElementById('btnReceipts').onclick = function () {
    openReceiptsModal();
  };

  function openReceiptsModal() {
    var m = UI.modal(
      '<button class="modal-close" onclick="this.closest(\'.modal-backdrop\').remove()">✕</button>' +
      '<h3>พิมพ์ใบเสร็จเป็นชุด</h3>' +
      '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">พิมพ์ใบเสร็จแบบละเอียด (รายการสินค้า+QR) หนึ่งออเดอร์ต่อหนึ่งแผ่น สำหรับทุกออเดอร์ที่ตรงตัวกรอง</div>' +
      '<div class="form-group"><label>รอบที่ต้องการพิมพ์</label><select id="rcpRound" class="form-control"><option value="">ใช้ตัวกรองปัจจุบัน (' + (filters.round_id ? 'รอบที่เลือกไว้' : 'ทุกรอบ') + ')</option>' +
        rounds.map(function (r) { return '<option value="' + r.round_id + '">' + UI.escapeHtml(r.round_name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-group"><label>จำนวนใบเสร็จต่อแผ่น A4</label><select id="rcpPerSheet" class="form-control">' +
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { return '<option value="' + n + '"' + (n === 1 ? ' selected' : '') + '>' + n + ' ใบ/แผ่น' + (n === 1 ? ' (หนึ่งออเดอร์ต่อหนึ่งหน้า)' : '') + '</option>'; }).join('') +
        '</select><div style="font-size:11px;color:var(--text-muted);margin-top:4px">ข้อมูลใบเสร็จ (รายการสินค้า/QR/ยอด) ยังครบทุกใบ ไม่ว่าจะเลือกกี่ใบต่อแผ่น</div></div>' +
      '<button id="rcpGenerate" class="btn btn-primary" style="width:100%">สร้างและพิมพ์</button>'
    );
    document.getElementById('rcpGenerate').onclick = function () {
      var roundId = document.getElementById('rcpRound').value || filters.round_id;
      var perSheet = document.getElementById('rcpPerSheet').value;
      var payload = Object.assign({ page: 1, page_size: 500 }, filters);
      if (roundId) payload.round_id = roundId;
      Object.keys(payload).forEach(function (k) { if (payload[k] === '') delete payload[k]; });
      Api.call('admin.orders.list', payload).then(function (data) {
        m.remove();
        printOrderReceiptsBatch(data.items, perSheet);
      }).catch(function (err) { UI.toast(err.message, 'error'); });
    };
  }

  function load() {
    document.getElementById('tableArea').innerHTML = UI.loading();
    if (tab === 'summary') { loadSummary(); return; }
    if (tab === 'detail') { loadDetail(); return; }
    var payload = Object.assign({ page: page, page_size: 30 }, filters);
    Object.keys(payload).forEach(function (k) { if (payload[k] === '') delete payload[k]; });
    Api.call('admin.orders.list', payload).then(function (data) { lastData = data; renderTable(data); }).catch(function (err) { UI.toast(err.message, 'error'); });
  }

  function loadSummary() {
    var payload = Object.assign({}, filters);
    Object.keys(payload).forEach(function (k) { if (payload[k] === '') delete payload[k]; });
    Api.call('admin.orders.summary', payload).then(renderSummary).catch(function (err) { UI.toast(err.message, 'error'); });
  }

  /** โหลดออเดอร์ทั้งหมดที่ตรงตัวกรอง (ไม่แบ่งหน้า) แล้วจัดกลุ่มเรียงตามเบอร์โทร — ใช้กับแท็บ "รายละเอียด" */
  function loadDetail() {
    var payload = Object.assign({ page: 1, page_size: 1000 }, filters);
    Object.keys(payload).forEach(function (k) { if (payload[k] === '') delete payload[k]; });
    Api.call('admin.orders.list', payload).then(function (data) {
      var sorted = data.items.slice().sort(function (a, b) {
        if (a.phone !== b.phone) return a.phone < b.phone ? -1 : 1;
        return new Date(a.placed_at) - new Date(b.placed_at);
      });
      lastData = Object.assign({}, data, { items: sorted });
      renderDetail(lastData);
    }).catch(function (err) { UI.toast(err.message, 'error'); });
  }

  /** ออเดอร์หนึ่งใบ ขยายเป็นหลายแถว — หนึ่งแถวต่อหนึ่งรายการสั่งซื้อ (คอลัมน์ระดับออเดอร์ใช้ rowspan ครอบทุกแถวของออเดอร์นั้น) */
  function renderDetail(data) {
    var el = document.getElementById('tableArea');
    if (!el) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อนตอบกลับ
    if (!data.items.length) { el.innerHTML = '<div class="empty-state">ไม่พบออเดอร์</div>'; return; }
    var bodyHtml = '';
    data.items.forEach(function (o, idx) {
      var newGroup = idx === 0 || data.items[idx - 1].phone !== o.phone;
      var repeatBadge = o.phone_order_total > 1 ? ' <span class="chip" style="background:#eef2ff;color:#4338ca" title="ลูกค้าเบอร์นี้สั่งมาแล้ว ' + o.phone_order_total + ' ครั้ง">ครั้งที่ ' + o.phone_order_seq + '/' + o.phone_order_total + '</span>' : '';
      var lineItems = o.items && o.items.length ? o.items : [null];
      var rowspan = lineItems.length;
      var orderCellsHtml =
        '<td rowspan="' + rowspan + '"><a href="javascript:void(0)" class="detailLink" data-id="' + o.order_id + '">#' + o.order_no + '</a></td>' +
        '<td rowspan="' + rowspan + '">' + UI.escapeHtml(o.customer_name) + '</td>' +
        '<td rowspan="' + rowspan + '">' + o.phone + repeatBadge + '</td>' +
        '<td rowspan="' + rowspan + '">' + UI.money(o.grand_total) + '</td>' +
        '<td rowspan="' + rowspan + '"><span class="chip ' + o.payment_status + '">' + o.payment_status + '</span></td>' +
        '<td rowspan="' + rowspan + '"><span class="chip ' + o.status + '">' + UI.statusLabel(o.status) + '</span></td>' +
        '<td rowspan="' + rowspan + '">' + UI.fmtTime(o.placed_at) + '</td>' +
        '<td rowspan="' + rowspan + '" style="font-size:12px">' + UI.escapeHtml(o.delivery_note || '-') + '</td>';
      var manageCellHtml = '<td rowspan="' + rowspan + '" class="no-print"><button class="btn btn-outline btn-sm manageBtn" data-id="' + o.order_id + '">จัดการ</button></td>';
      lineItems.forEach(function (i, itemIdx) {
        var itemCell = i
          ? '<td style="font-size:12px">' + UI.escapeHtml(i.product_name) + (i.is_frozen ? ' ❄️' : '') + ' x' + i.qty + ' <span style="color:var(--text-muted)">(' + UI.money(i.line_total) + ')</span></td>'
          : '<td style="font-size:12px;color:var(--text-muted)">-</td>';
        var trStyle = (newGroup && itemIdx === 0) ? ' style="border-top:2px solid var(--border)"' : '';
        bodyHtml += '<tr' + trStyle + '>' + (itemIdx === 0 ? orderCellsHtml : '') + itemCell + (itemIdx === 0 ? manageCellHtml : '') + '</tr>';
      });
    });
    el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>เลขที่</th><th>ลูกค้า</th><th>เบอร์</th><th>ยอด</th><th>ชำระเงิน</th><th>สถานะ</th><th>เวลา</th><th>หมายเหตุ</th><th>รายการสั่งซื้อ</th><th class="no-print">จัดการ</th></tr></thead><tbody>' +
      bodyHtml + '</tbody></table></div>' +
      '<div style="margin-top:10px;font-size:12px;color:var(--text-muted)">ทั้งหมด ' + data.total + ' รายการ (จัดกลุ่มตามเบอร์โทร)</div>';
    el.querySelectorAll('.detailLink').forEach(function (b) { b.onclick = function () { openOrderDetailModal(b.dataset.id, load); }; });
    el.querySelectorAll('.manageBtn').forEach(function (b) { b.onclick = function () { openOrderDetailModal(b.dataset.id, load); }; });
  }

  function renderSummary(data) {
    var el = document.getElementById('tableArea');
    if (!el) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อนตอบกลับ
    var att = data.attachments_summary || { with_photo: 0, without_photo: 0, with_slip: 0, without_slip: 0, orders: [] };
    el.innerHTML = '<div class="kpi-grid"><div class="kpi-card"><div class="label">จำนวนออเดอร์</div><div class="value">' + data.order_count + '</div></div>' +
      '<div class="kpi-card"><div class="label">ยอดขายรวม</div><div class="value">' + UI.money(data.total_amount) + '</div></div></div>' +
      '<div class="card"><div class="card-head"><h3>สรุปรูปแนบออเดอร์/สลิปโอนเงิน</h3><button class="btn btn-sm btn-outline no-print" id="expAttachments">Export Excel (CSV)</button></div>' +
        '<div class="kpi-grid">' +
          '<div class="kpi-card"><div class="label">แนบรูปออเดอร์แล้ว</div><div class="value">' + att.with_photo + '/' + data.order_count + '</div></div>' +
          '<div class="kpi-card"><div class="label">ยังไม่แนบรูปออเดอร์</div><div class="value">' + att.without_photo + '/' + data.order_count + '</div></div>' +
          '<div class="kpi-card"><div class="label">แนบสลิปโอนเงินแล้ว</div><div class="value">' + att.with_slip + '/' + data.order_count + '</div></div>' +
          '<div class="kpi-card"><div class="label">ยังไม่แนบสลิปโอนเงิน</div><div class="value">' + att.without_slip + '/' + data.order_count + '</div></div>' +
        '</div>' +
        (att.orders.length
          ? '<div class="table-wrap"><table><thead><tr><th>เลขที่</th><th>ลูกค้า</th><th>เบอร์</th><th>เวลา</th><th>รูปออเดอร์</th><th>สลิปโอนเงิน</th></tr></thead><tbody>' +
            att.orders.map(function (o) {
              return '<tr><td>#' + UI.escapeHtml(o.order_no) + '</td><td>' + UI.escapeHtml(o.customer_name) + '</td><td>' + o.phone + '</td><td>' + UI.fmtTime(o.placed_at) + '</td>' +
                '<td>' + (o.has_photo ? '✅ มี' : '❌ ไม่มี') + '</td><td>' + (o.has_slip ? '✅ มี (' + o.slip_count + ' ใบ)' : '❌ ไม่มี') + '</td></tr>';
            }).join('') +
            '</tbody></table></div>'
          : '<div class="empty-state">ไม่มีข้อมูลตามตัวกรองนี้</div>') +
      '</div>' +
      (data.by_product.length
        ? '<div class="table-wrap"><table><thead><tr><th>รหัส SKU</th><th>สินค้า</th><th>จำนวน</th><th>คงเหลือในสต็อก</th><th>ยอดเงิน</th></tr></thead><tbody>' +
          data.by_product.map(function (p) {
            return '<tr><td>' + UI.escapeHtml(p.sku || '-') + '</td><td>' + UI.escapeHtml(p.product_name) + '</td><td>' + p.qty + '</td>' +
              '<td>' + (p.stock_qty === null || p.stock_qty === undefined ? '-' : p.stock_qty) + '</td><td>' + UI.money(p.amount) + '</td></tr>';
          }).join('') +
          '</tbody></table></div>'
        : '<div class="empty-state">ไม่มีข้อมูลตามตัวกรองนี้</div>');
    var expBtn = document.getElementById('expAttachments');
    if (expBtn) expBtn.onclick = function () {
      UI.exportCsv('order-attachments-summary.csv', att.orders.map(function (o) {
        return {
          order_no: o.order_no, customer_name: o.customer_name, phone: o.phone, placed_at: o.placed_at,
          has_photo: o.has_photo ? 'มี' : 'ไม่มี', has_slip: o.has_slip ? 'มี' : 'ไม่มี', slip_count: o.slip_count
        };
      }));
    };
  }

  function renderTable(data) {
    var el = document.getElementById('tableArea');
    if (!el) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อนตอบกลับ
    if (!data.items.length) { el.innerHTML = '<div class="empty-state">ไม่พบออเดอร์</div>'; return; }
    el.innerHTML = '<div class="table-wrap"><table><thead><tr><th></th><th>เลขที่</th><th>ลูกค้า</th><th>เบอร์</th><th>ยอด</th><th>ชำระเงิน</th><th>สถานะ</th><th>เวลา</th><th>จัดการ</th></tr></thead><tbody>' +
      data.items.map(function (o) {
        var nextOptions = (ORDER_NEXT_STATUS_[o.status] || []).map(function (s) { return '<option value="' + s + '">' + UI.statusLabel(s) + '</option>'; }).join('');
        var repeatBadge = o.phone_order_total > 1 ? ' <span class="chip" style="background:#eef2ff;color:#4338ca" title="ลูกค้าเบอร์นี้สั่งมาแล้ว ' + o.phone_order_total + ' ครั้ง">ครั้งที่ ' + o.phone_order_seq + '/' + o.phone_order_total + '</span>' : '';
        return '<tr><td>' + (o.photo_url ? '<img src="' + o.photo_url + '" style="width:32px;height:32px;object-fit:cover;border-radius:6px">' : '') + (o.has_frozen ? Icon('snowflake', 13, 'color:#2563eb;display:inline-block;vertical-align:middle') : '') + '</td>' +
          '<td><a href="javascript:void(0)" class="detailLink" data-id="' + o.order_id + '">#' + o.order_no + '</a></td><td>' + UI.escapeHtml(o.customer_name) + '</td><td>' + o.phone + repeatBadge + '</td><td>' + UI.money(o.grand_total) + '</td>' +
          '<td><span class="chip ' + o.payment_status + '">' + o.payment_status + '</span></td>' +
          '<td><span class="chip ' + o.status + '">' + UI.statusLabel(o.status) + '</span></td><td>' + UI.fmtTime(o.placed_at) + '</td>' +
          '<td>' + (nextOptions ? '<select class="form-control statusSelect" data-id="' + o.order_id + '" style="width:auto"><option value="">เปลี่ยนสถานะ...</option>' + nextOptions + '</select>' : '-') +
          ' <button class="btn btn-sm btn-outline detailBtn" data-id="' + o.order_id + '">รายละเอียด</button>' +
          ' <button class="btn btn-sm btn-outline printBtn" data-id="' + o.order_id + '" title="พิมพ์ใบเสร็จ">🖨️</button>' +
          ' <button class="btn btn-sm btn-danger delBtn" data-id="' + o.order_id + '">' + Icon('trash', 13) + '</button></td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div style="display:flex;justify-content:space-between;margin-top:10px;font-size:12px;color:var(--text-muted)"><span>ทั้งหมด ' + data.total + ' รายการ</span>' +
      '<span><button class="btn btn-sm btn-outline" id="prevPage">ก่อนหน้า</button> หน้า ' + page + ' <button class="btn btn-sm btn-outline" id="nextPage">ถัดไป</button></span></div>';

    el.querySelectorAll('.statusSelect').forEach(function (sel) {
      sel.onchange = function () {
        if (!sel.value) return;
        var reason = sel.value === 'cancelled' ? prompt('ระบุเหตุผลการยกเลิก:') : null;
        Api.call('admin.orders.updateStatus', { order_id: sel.dataset.id, status: sel.value, reason: reason }).then(function () {
          UI.toast('อัปเดตสถานะแล้ว', 'success'); load();
        }).catch(function (err) { UI.toast(err.message, 'error'); sel.value = ''; });
      };
    });
    el.querySelectorAll('.detailBtn, .detailLink').forEach(function (b) {
      b.onclick = function () { openOrderDetailModal(b.dataset.id, load); };
    });
    el.querySelectorAll('.printBtn').forEach(function (b) {
      b.onclick = function () {
        var order = data.items.filter(function (o) { return o.order_id === b.dataset.id; })[0];
        if (order) printOrderReceipt(order);
      };
    });
    el.querySelectorAll('.delBtn').forEach(function (b) {
      b.onclick = function () {
        if (!confirm('ลบออเดอร์นี้? (ประวัติจะถูกซ่อน กู้คืนไม่ได้ผ่านหน้านี้)')) return;
        Api.call('admin.orders.delete', { order_id: b.dataset.id }).then(function () { UI.toast('ลบแล้ว', 'success'); load(); }).catch(function (err) { UI.toast(err.message, 'error'); });
      };
    });
    var prevBtn = document.getElementById('prevPage'), nextBtn = document.getElementById('nextPage');
    if (prevBtn) prevBtn.onclick = function () { if (page > 1) { page--; load(); } };
    if (nextBtn) nextBtn.onclick = function () { if (page * 30 < data.total) { page++; load(); } };
  }

  load();
};
