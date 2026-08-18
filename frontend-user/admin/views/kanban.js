/**
 * views/kanban.js — Kanban Board ลาก-วางเปลี่ยนสถานะออเดอร์
 */
var KANBAN_COLUMNS_ = [
  { key: 'pending', label: 'รอดำเนินการ' }, { key: 'in_progress', label: 'กำลังดำเนินการ' },
  { key: 'completed', label: 'สำเร็จ' }, { key: 'cancelled', label: 'ยกเลิก' }
];

Views.kanban = function (container) {
  container.innerHTML = '<div class="kanban-board" id="board">' + UI.loading() + '</div>';
  var orders = [];

  function load() {
    Api.call('admin.orders.list', { page_size: 200 }).then(function (data) {
      orders = data.items;
      render();
    }).catch(function (err) { UI.toast(err.message, 'error'); });
  }

  function render() {
    var board = document.getElementById('board');
    if (!board) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อน admin.orders.list (initial หรือจาก interval) จะตอบกลับ
    board.innerHTML = KANBAN_COLUMNS_.map(function (col) {
      var colOrders = orders.filter(function (o) { return o.status === col.key; });
      return '<div class="kanban-col" data-status="' + col.key + '"><h4>' + col.label + '<span>' + colOrders.length + '</span></h4>' +
        colOrders.map(function (o) {
          return '<div class="kanban-card" draggable="true" data-id="' + o.order_id + '" data-status="' + o.status + '">' +
            (o.photo_url ? '<img src="' + o.photo_url + '" style="width:100%;height:60px;object-fit:cover;border-radius:6px;margin-bottom:6px">' : '') +
            '<b>#' + o.order_no + '</b> ' + (o.has_frozen ? Icon('snowflake', 12, 'color:#2563eb;display:inline-block;vertical-align:middle') : '') + ' ' + UI.money(o.grand_total) + '<br>' + UI.escapeHtml(o.customer_name) + '<br>' +
            '<span style="color:var(--text-muted)">' + UI.fmtTime(o.placed_at) + '</span></div>';
        }).join('') + '</div>';
    }).join('');

    board.querySelectorAll('.kanban-card').forEach(function (card) {
      var moved = false;
      card.addEventListener('dragstart', function (e) { moved = true; card.classList.add('dragging'); e.dataTransfer.setData('text/plain', card.dataset.id + '|' + card.dataset.status); });
      // รีเซ็ต moved ที่ dragend เสมอ (ไม่ใช่ที่ click) เพราะ dragend ยิงทุกครั้งไม่ว่าจะวางถูกที่/วางไม่สำเร็จ/ยกเลิกกลางทาง
      // ต่างจาก click ที่เบราว์เซอร์ส่วนใหญ่ไม่ยิงให้หลัง drag จริง — ถ้ารีเซ็ตที่ click การ์ดจะกดเปิดรายละเอียดไม่ได้อีกเลย
      // ทุกครั้งที่ลากแล้ววางไม่สำเร็จ (วางคอลัมน์เดิม/เปลี่ยนสถานะไม่ได้) เพราะหน้าจะไม่ re-render ให้ moved กลับเป็น false
      card.addEventListener('dragend', function () { card.classList.remove('dragging'); setTimeout(function () { moved = false; }, 0); });
      card.addEventListener('click', function () { if (!moved) openOrderDetailModal(card.dataset.id, load); });
    });
    board.querySelectorAll('.kanban-col').forEach(function (col) {
      col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('dragover'); });
      col.addEventListener('dragleave', function () { col.classList.remove('dragover'); });
      col.addEventListener('drop', function (e) {
        e.preventDefault(); col.classList.remove('dragover');
        var parts = e.dataTransfer.getData('text/plain').split('|');
        var orderId = parts[0], fromStatus = parts[1], toStatus = col.dataset.status;
        if (fromStatus === toStatus) return;
        var allowed = ORDER_NEXT_STATUS_[fromStatus] || [];
        if (allowed.indexOf(toStatus) === -1) { UI.toast('เปลี่ยนสถานะจาก ' + UI.statusLabel(fromStatus) + ' เป็น ' + UI.statusLabel(toStatus) + ' ไม่ได้', 'error'); return; }
        Api.call('admin.orders.updateStatus', { order_id: orderId, status: toStatus }).then(function () { UI.toast('อัปเดตแล้ว', 'success'); load(); }).catch(function (err) { UI.toast(err.message, 'error'); });
      });
    });
  }

  load();
  var interval = setInterval(load, 15000);
  return function cleanup() { clearInterval(interval); };
};
