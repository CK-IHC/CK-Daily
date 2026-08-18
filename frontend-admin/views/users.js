/**
 * views/users.js — จัดการผู้ใช้/role/ระงับบัญชี (เฉพาะ admin)
 */
Views.users = function (container) {
  var users = [], lastSearch = '';
  container.innerHTML = '<div class="card"><div class="card-head"><h3>ผู้ใช้งานทั้งหมด</h3>' +
    '<div style="display:flex;gap:8px"><input id="searchInput" class="form-control" style="width:auto" placeholder="ค้นหาชื่อ/เบอร์">' +
    '<button id="btnExport" class="btn btn-outline">Export CSV</button>' +
    '<button id="btnAddUser" class="btn btn-primary">+ เพิ่มผู้ใช้</button></div></div><div id="area">' + UI.loading() + '</div></div>';

  document.getElementById('searchInput').addEventListener('input', debounce(function (e) { lastSearch = e.target.value; load(lastSearch); }, 300));
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); var a = arguments; t = setTimeout(function () { fn.apply(null, a); }, ms); }; }

  document.getElementById('btnAddUser').onclick = function () { openAddUserModal(); };
  document.getElementById('btnExport').onclick = function () {
    UI.exportCsv('users.csv', users.map(function (u) {
      return { phone: u.phone, name: u.name, role: u.role, department: u.department, points: u.points, tier: u.tier, total_spend: u.total_spend, status: u.status, created_at: u.created_at };
    }));
  };

  function openAddUserModal() {
    var m = UI.modal(
      '<button class="modal-close" onclick="this.closest(\'.modal-backdrop\').remove()">✕</button>' +
      '<h3>เพิ่มผู้ใช้</h3>' +
      '<div class="form-group"><label>เบอร์โทร</label><input id="mPhone" class="form-control" placeholder="08xxxxxxxx"></div>' +
      '<div class="form-group"><label>ชื่อ</label><input id="mName" class="form-control"></div>' +
      '<div class="form-group"><label>แผนก</label><input id="mDept" class="form-control"></div>' +
      '<div class="form-group"><label>Role</label><select id="mRole" class="form-control">' +
        ['customer', 'staff', 'manager', 'admin'].map(function (r) { return '<option value="' + r + '">' + r + '</option>'; }).join('') + '</select></div>' +
      '<button id="mSubmit" class="btn btn-primary" style="width:100%">บันทึก</button>'
    );
    document.getElementById('mSubmit').onclick = function () {
      var phone = document.getElementById('mPhone').value.trim();
      if (!phone) { UI.toast('กรุณากรอกเบอร์โทร', 'error'); return; }
      Api.call('admin.users.create', {
        phone: phone, name: document.getElementById('mName').value.trim(),
        department: document.getElementById('mDept').value.trim(), role: document.getElementById('mRole').value
      }).then(function () { UI.toast('เพิ่มผู้ใช้แล้ว', 'success'); m.remove(); load(lastSearch); }).catch(function (err) { UI.toast(err.message, 'error'); });
    };
  }

  function openUserHistoryModal(u) {
    var m = UI.modal(
      '<button class="modal-close" onclick="this.closest(\'.modal-backdrop\').remove()">✕</button>' +
      '<h3>ประวัติการสั่งซื้อ — ' + UI.escapeHtml(u.name || u.phone) + '</h3>' +
      '<div style="font-size:13px;color:var(--text-muted);margin-bottom:10px">' + u.phone + '</div>' +
      '<div id="userHistoryArea">' + UI.loading() + '</div>'
    );
    Api.call('admin.orders.list', { phone: u.phone, page_size: 1000 }).then(function (data) {
      var area = document.getElementById('userHistoryArea');
      if (!area) return;
      if (!data.items.length) { area.innerHTML = '<div class="empty-state">ยังไม่มีประวัติการสั่งซื้อ</div>'; return; }
      var totalSpend = data.items.filter(function (o) { return o.status !== 'cancelled'; })
        .reduce(function (s, o) { return s + Number(o.grand_total || 0); }, 0);
      area.innerHTML = '<div class="kpi-grid" style="margin-bottom:14px"><div class="kpi-card"><div class="label">ยอดใช้จ่ายรวม</div><div class="value">' + UI.money(totalSpend) + '</div></div></div>' +
        '<div class="table-wrap"><table><thead><tr><th>เลขที่</th><th>ยอด</th><th>สถานะ</th><th>ชำระเงิน</th><th>เวลา</th></tr></thead><tbody>' +
        data.items.map(function (o) {
          return '<tr><td>#' + UI.escapeHtml(o.order_no) + '</td><td>' + UI.money(o.grand_total) + '</td>' +
            '<td><span class="chip ' + o.status + '">' + UI.statusLabel(o.status) + '</span></td>' +
            '<td><span class="chip ' + o.payment_status + '">' + o.payment_status + '</span></td><td>' + UI.fmtTime(o.placed_at) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<div style="font-size:12px;color:var(--text-muted);margin-top:8px">ทั้งหมด ' + data.total + ' รายการ</div>';
    }).catch(function (err) { UI.toast(err.message, 'error'); });
  }

  function load(search) {
    Api.call('admin.users.list', { search: search || '' }).then(function (data) { users = data; render(); }).catch(function (err) { UI.toast(err.message, 'error'); });
  }

  function render() {
    var el = document.getElementById('area');
    if (!el) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อนตอบกลับ
    if (!users.length) { el.innerHTML = '<div class="empty-state">ไม่พบผู้ใช้</div>'; return; }
    el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>ชื่อ</th><th>เบอร์</th><th>Role</th><th>แต้ม</th><th>Tier</th><th>ยอดใช้จ่ายรวม</th><th>สถานะ</th><th>สมัครเมื่อ</th><th>จัดการ</th></tr></thead><tbody>' +
      users.map(function (u) {
        return '<tr><td>' + UI.escapeHtml(u.name || '-') + '</td><td>' + u.phone + '</td>' +
          '<td><select class="form-control roleSelect" data-id="' + u.user_id + '" style="width:auto">' +
          ['customer', 'staff', 'manager', 'admin'].map(function (r) { return '<option value="' + r + '" ' + (u.role === r ? 'selected' : '') + '>' + r + '</option>'; }).join('') + '</select></td>' +
          '<td>' + u.points + '</td><td>' + u.tier + '</td><td><b>' + UI.money(u.total_spend || 0) + '</b></td><td><span class="chip ' + u.status + '">' + u.status + '</span></td><td>' + UI.fmtTime(u.created_at) + '</td>' +
          '<td><button class="btn btn-sm btn-outline" data-history="' + u.user_id + '">ประวัติการสั่งซื้อ</button> ' +
          '<button class="btn btn-sm btn-outline" data-toggle="' + u.user_id + '" data-status="' + u.status + '">' + (u.status === 'active' ? 'ระงับ' : 'เปิดใช้งาน') + '</button> ' +
          '<button class="btn btn-sm btn-danger" data-del="' + u.user_id + '">' + Icon('trash', 13) + '</button></td></tr>';
      }).join('') + '</tbody></table></div>';

    el.querySelectorAll('[data-history]').forEach(function (b) {
      b.onclick = function () {
        var u = users.filter(function (x) { return x.user_id === b.dataset.history; })[0];
        if (u) openUserHistoryModal(u);
      };
    });

    el.querySelectorAll('.roleSelect').forEach(function (sel) {
      sel.onchange = function () {
        Api.call('admin.users.updateRole', { user_id: sel.dataset.id, role: sel.value }).then(function () { UI.toast('เปลี่ยนสิทธิ์แล้ว', 'success'); }).catch(function (err) { UI.toast(err.message, 'error'); load(); });
      };
    });
    el.querySelectorAll('[data-toggle]').forEach(function (b) {
      b.onclick = function () {
        var newStatus = b.dataset.status === 'active' ? 'suspended' : 'active';
        if (newStatus === 'suspended' && !confirm('ระงับผู้ใช้นี้?')) return;
        Api.call('admin.users.setStatus', { user_id: b.dataset.toggle, status: newStatus }).then(function () { UI.toast('อัปเดตแล้ว', 'success'); load(); }).catch(function (err) { UI.toast(err.message, 'error'); });
      };
    });
    el.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = function () {
        if (!confirm('ลบผู้ใช้นี้? (ประวัติออเดอร์เดิมจะยังอยู่ แต่บัญชีนี้จะล็อกอินไม่ได้อีก)')) return;
        Api.call('admin.users.delete', { user_id: b.dataset.del }).then(function () { UI.toast('ลบแล้ว', 'success'); load(); }).catch(function (err) { UI.toast(err.message, 'error'); });
      };
    });
    UI.makeTableSortable(el.querySelector('table'));
  }

  load();
};
