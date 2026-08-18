/**
 * views/history.js — ประวัติออเดอร์ (tab active/completed/cancelled) + สั่งซ้ำ
 */
var STATUS_LABEL_TH_ = { pending: 'รอดำเนินการ', in_progress: 'กำลังดำเนินการ', completed: 'สำเร็จ', cancelled: 'ยกเลิก' };

var HISTORY_TAB_LABEL_ = { active: 'กำลังดำเนินการ', completed: 'สำเร็จ', cancelled: 'ยกเลิก' };
var HISTORY_PAGE_SIZE_ = 30;

Views.history = function (container) {
  var tab = 'active', page = 1, loading = false, hasMore = true, items = [];

  container.innerHTML =
    '<div class="container" style="display:flex;justify-content:space-between;align-items:center;padding-bottom:0">' +
      '<h2 style="margin:8px 0">ประวัติการสั่งซื้อ</h2>' +
      '<button id="printHistoryBtn" class="btn btn-outline btn-sm">🖨️ พิมพ์รายงาน</button>' +
    '</div>' +
    '<div class="tabs">' +
      '<div class="tab active" data-tab="active">กำลังดำเนินการ</div>' +
      '<div class="tab" data-tab="completed">สำเร็จ</div>' +
      '<div class="tab" data-tab="cancelled">ยกเลิก</div>' +
    '</div><div id="list"></div><div id="loadMoreArea"></div>';

  document.getElementById('printHistoryBtn').onclick = printHistoryReport;

  container.querySelectorAll('.tab').forEach(function (t) {
    t.onclick = function () {
      container.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); });
      t.classList.add('active');
      tab = t.dataset.tab; page = 1; items = []; hasMore = true;
      document.getElementById('list').innerHTML = '';
      load();
    };
  });

  function load() {
    if (loading || !hasMore) return;
    loading = true;
    UI.setHtml('loadMoreArea', UI.loading());
    Api.call('order.list', { status_group: tab, page: page, page_size: HISTORY_PAGE_SIZE_ }).then(function (data) {
      items = items.concat(data.items);
      hasMore = items.length < data.total;
      page++;
      loading = false;
      renderList();
    }).catch(function (err) {
      loading = false;
      UI.toast(err.message, 'error');
      if (!items.length) {
        if (!UI.setHtml('list', '<div class="empty-state"><div class="emoji">⚠️</div>โหลดประวัติการสั่งซื้อไม่สำเร็จ<br>' + UI.escapeHtml(err.message) + '</div>')) return; // ผู้ใช้เปลี่ยนหน้าไปแล้ว
        UI.setHtml('loadMoreArea', '<button id="retryLoadBtn" class="btn btn-outline btn-block" style="margin:10px 16px;width:calc(100% - 32px)">ลองใหม่</button>');
        var retryBtn = document.getElementById('retryLoadBtn');
        if (retryBtn) retryBtn.onclick = load;
      } else {
        UI.setHtml('loadMoreArea', '');
      }
    });
  }

  function renderList() {
    var el = document.getElementById('list');
    if (!el) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อน order.list จะตอบกลับ
    if (!items.length) {
      el.innerHTML = '<div class="empty-state"><div class="emoji">📭</div>ยังไม่มีออเดอร์ในหมวดนี้</div>';
      UI.setHtml('loadMoreArea', '');
      return;
    }
    el.innerHTML = items.map(function (o) {
      var itemLines = (o.items || []).map(function (i) {
        return '<div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--text-muted);padding:2px 0">' +
          '<span>' + UI.escapeHtml(i.product_name) + (i.is_frozen ? ' ❄ <span style="color:#2563eb;font-weight:600">(Freezing)</span>' : '') + ' x' + i.qty + '</span></div>';
      }).join('') || '<div style="font-size:12.5px;color:var(--text-muted)">-</div>';
      var isPaid = o.payment_status === 'paid';
      var isPendingVerify = o.payment_status === 'pending_verify';
      var needsPay = !isPaid && !isPendingVerify && o.status !== 'cancelled';
      var actionLabel = needsPay ? 'ชำระเงิน' : (isPendingVerify ? 'รอตรวจสอบ' : (isPaid ? 'ใบเสร็จ' : 'จัดการ'));
      var actionHash = (needsPay || isPaid || isPendingVerify) ? '#/payment/' + o.order_id : '#/tracking/' + o.order_id;
      return '<div class="order-card" data-id="' + o.order_id + '">' +
        '<div class="top"><span class="order-no">#' + o.order_no + '</span><span class="chip ' + o.status + '">' + (STATUS_LABEL_TH_[o.status] || o.status) + '</span></div>' +
        '<div class="meta">' + UI.fmtTime(o.placed_at) + '</div>' +
        '<div style="margin:8px 0;border-top:1px dashed var(--border);border-bottom:1px dashed var(--border);padding:6px 0">' + itemLines + '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<b>' + UI.money(o.grand_total) + '</b>' +
          '<button class="btn ' + (needsPay ? 'btn-primary' : 'btn-outline') + ' manageBtn" data-hash="' + actionHash + '" style="padding:3px 9px;font-size:10.5px;min-height:auto;min-width:auto;width:auto;flex:none;border-radius:6px">' + actionLabel + '</button>' +
        '</div>' +
      '</div>';
    }).join('');
    el.querySelectorAll('.order-card').forEach(function (card) {
      card.onclick = function (e) { if (e.target.classList.contains('manageBtn')) return; location.hash = '#/tracking/' + card.dataset.id; };
    });
    el.querySelectorAll('.manageBtn').forEach(function (btn) {
      btn.onclick = function (e) { e.stopPropagation(); location.hash = btn.dataset.hash; };
    });
    document.getElementById('loadMoreArea').innerHTML = hasMore ? '<button id="loadMoreBtn" class="btn btn-outline btn-block" style="margin:10px 16px;width:calc(100% - 32px)">โหลดเพิ่มเติม</button>' : '';
    var moreBtn = document.getElementById('loadMoreBtn');
    if (moreBtn) moreBtn.onclick = load;
  }

  /** ดึงออเดอร์ทั้งหมดของแท็บปัจจุบัน (ไม่จำกัดจำนวนหน้าที่โหลดไว้บนจอ) แล้วเปิดหน้าต่างพิมพ์รายงาน */
  function printHistoryReport() {
    UI.toast('กำลังเตรียมรายงาน...', '');
    Api.call('order.list', { status_group: tab, page: 1, page_size: 1000 }).then(function (data) {
      printOrderHistoryReport_(data.items, HISTORY_TAB_LABEL_[tab] || tab);
    }).catch(function (err) { UI.toast(err.message, 'error'); });
  }

  load();
};

/** เปิดหน้าต่างพิมพ์รายงานประวัติการสั่งซื้อของลูกค้า (เลขที่/เวลา/สถานะ/ยอด + สรุปรวม) */
function printOrderHistoryReport_(items, tabLabel) {
  var win = window.open('', '_blank', 'width=700,height=800');
  if (!win) { UI.toast('เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตแล้วลองใหม่', 'error'); return; }
  var rows = items.map(function (o) {
    return '<tr><td>#' + UI.escapeHtml(o.order_no) + '</td><td>' + UI.fmtTime(o.placed_at) + '</td>' +
      '<td>' + (STATUS_LABEL_TH_[o.status] || o.status) + '</td><td style="text-align:right">' + UI.money(o.grand_total) + '</td><td>' + UI.escapeHtml(o.delivery_note || '-') + '</td></tr>';
  }).join('');
  var sum = items.reduce(function (s, o) { return s + Number(o.grand_total || 0); }, 0);
  var custName = (State.user && State.user.name) || '';
  var custPhone = (State.user && State.user.phone) || '';
  var html = '<!DOCTYPE html><html><head><title>ประวัติการสั่งซื้อ</title><meta charset="utf-8">' +
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
    '<h2 class="print-doc-title">ประวัติการสั่งซื้อ — ' + UI.escapeHtml(tabLabel) + '</h2>' +
    '<hr class="print-doc-rule">' +
    '<div class="sub">' + UI.escapeHtml(custName) + (custPhone ? ' · ' + UI.escapeHtml(custPhone) : '') + '<br>ทั้งหมด ' + items.length + ' รายการ</div>' +
    '<table><thead><tr><th>เลขที่</th><th>เวลา</th><th>สถานะ</th><th style="text-align:right">ยอด</th><th>หมายเหตุ</th></tr></thead><tbody>' + rows + '</tbody>' +
    '<tfoot><tr><td colspan="3">รวม</td><td style="text-align:right">' + UI.money(sum) + '</td><td></td></tr></tfoot></table>' +
    '<div class="print-doc-footer">พิมพ์เมื่อ: ' + new Date().toLocaleString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + '</div>' +
    '<script>window.onload=function(){window.print();};<\/script></body></html>';
  win.document.open(); win.document.write(html); win.document.close();
}
