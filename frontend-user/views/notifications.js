/**
 * views/notifications.js — รายการแจ้งเตือน (#/notifications)
 * แก้บั๊ก: เดิมไอคอนกระดิ่งไปหน้าประวัติออเดอร์แทนที่จะเป็นหน้าแจ้งเตือนจริง ทั้งที่ backend มี notify.list/markRead อยู่แล้ว
 */
Views.notifications = function (container) {
  container.innerHTML =
    '<div class="container" style="padding-top:8px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
        '<h2 style="margin:0">การแจ้งเตือน</h2>' +
        '<button id="markAllBtn" class="btn btn-outline btn-sm">อ่านทั้งหมด</button>' +
      '</div>' +
      '<div id="list">' + UI.loading() + '</div>' +
    '</div>';

  document.getElementById('markAllBtn').onclick = function () {
    Api.call('notify.markAllRead').then(function () { load(); }).catch(function (err) { UI.toast(err.message, 'error'); });
  };

  load();

  function load() {
    Api.call('notify.list', { limit: 50 }).then(render).catch(function (err) { UI.toast(err.message, 'error'); });
  }

  function render(data) {
    var el = document.getElementById('list');
    if (!el) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อน notify.list จะตอบกลับ
    var items = data.items || [];
    if (!items.length) { el.innerHTML = '<div class="empty-state"><div class="emoji">🔔</div>ยังไม่มีการแจ้งเตือน</div>'; return; }
    el.innerHTML = items.map(function (n) {
      return '<div class="notif-item ' + (n.is_read ? '' : 'unread') + '" data-id="' + n.noti_id + '">' +
        '<button class="notif-delete-btn" data-id="' + n.noti_id + '" title="ลบการแจ้งเตือนนี้" style="position:absolute;top:10px;right:10px;background:none;border:none;cursor:pointer;color:var(--text-muted);padding:4px">✕</button>' +
        '<div class="notif-title">' + UI.escapeHtml(n.title) + '</div>' +
        '<div class="notif-body">' + UI.escapeHtml(n.body) + '</div>' +
        '<div class="notif-time">' + UI.fmtTime(n.created_at) + '</div>' +
      '</div>';
    }).join('');
    el.querySelectorAll('.notif-item').forEach(function (item) {
      item.onclick = function (e) {
        if (e.target.classList.contains('notif-delete-btn')) return;
        if (!item.classList.contains('unread')) return;
        Api.call('notify.markRead', { noti_id: item.dataset.id }).then(function () { item.classList.remove('unread'); }).catch(function () {});
      };
    });
    el.querySelectorAll('.notif-delete-btn').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        Api.call('notify.delete', { noti_id: btn.dataset.id }).then(function () {
          var item = btn.closest('.notif-item');
          if (item) item.remove();
          if (!el.querySelector('.notif-item')) el.innerHTML = '<div class="empty-state"><div class="emoji">🔔</div>ยังไม่มีการแจ้งเตือน</div>';
        }).catch(function (err) { UI.toast(err.message, 'error'); });
      };
    });
  }
};
