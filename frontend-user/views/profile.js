/**
 * views/profile.js — โปรไฟล์ผู้ใช้: รูป, ชื่อ (บังคับ), แผนก (บังคับ), แต้ม/tier, ออกจากระบบ
 */
Views.profile = function (container) {
  var user = State.user;
  var tierLabel = { bronze: '🥉 Bronze', silver: '🥈 Silver', gold: '🥇 Gold' }[user.tier] || user.tier;

  render();

  function render() {
    container.innerHTML =
      '<div class="container" style="text-align:center;padding-top:24px">' +
        '<div id="avatarWrap" style="position:relative;width:64px;margin:0 auto 10px">' +
          (user.avatar_url
            ? '<img src="' + user.avatar_url + '" class="avatar-circle" style="object-fit:cover">'
            : '<div class="avatar-circle">' + (user.name ? user.name.charAt(0).toUpperCase() : '👤') + '</div>') +
          '<button id="avatarBtn" class="avatar-edit-btn" title="เปลี่ยนรูปโปรไฟล์">' + Icon('camera', 13) + '</button>' +
        '</div>' +
        '<input type="file" id="avatarInput" accept="image/*" style="display:none">' +
        '<h3 style="margin:0">' + UI.escapeHtml(user.name || '-') + '</h3>' +
        '<p style="color:var(--text-muted);margin:2px 0">' + UI.escapeHtml(user.phone) + '</p>' +
        '<div class="points-chip" style="display:inline-block">' + user.points + ' แต้ม · ' + tierLabel + '</div>' +
        '<div style="margin-top:10px;font-size:13px;color:var(--text-muted)">ยอดใช้จ่ายรวม <b id="totalSpendVal" style="color:var(--text)">...</b></div>' +
      '</div>' +
      '<div class="container">' +
        '<div class="form-group"><label>ชื่อ *</label><input id="nameInput" class="form-control" value="' + UI.escapeHtml(user.name || '') + '"></div>' +
        '<div class="form-group"><label>แผนก *</label><input id="departmentInput" class="form-control" placeholder="เช่น แผนกบัญชี" value="' + UI.escapeHtml(user.department || '') + '"></div>' +
        '<button id="saveBtn" class="btn btn-primary btn-block">บันทึกโปรไฟล์</button>' +
        '<button id="logoutBtn" class="btn btn-outline btn-block" style="margin-top:20px;color:var(--danger);border-color:var(--danger)">ออกจากระบบ</button>' +
      '</div>';

    document.getElementById('avatarBtn').onclick = function () { document.getElementById('avatarInput').click(); };
    document.getElementById('avatarInput').onchange = function (e) {
      var file = e.target.files[0]; if (!file) return;
      if (file.size > 5 * 1024 * 1024) { UI.toast('ไฟล์ใหญ่เกิน 5MB กรุณาเลือกรูปที่เล็กกว่านี้', 'error'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        Api.call('auth.updateProfile', { avatar_base64: reader.result }).then(function (updated) {
          State.updateUser(updated); user = State.user;
          UI.toast('เปลี่ยนรูปโปรไฟล์แล้ว', 'success');
          render();
        }).catch(function (err) { UI.toast(err.message, 'error'); });
      };
      reader.readAsDataURL(file);
    };

    document.getElementById('saveBtn').onclick = function () {
      var name = document.getElementById('nameInput').value.trim();
      var department = document.getElementById('departmentInput').value.trim();
      if (!name) { UI.toast('กรุณากรอกชื่อ', 'error'); return; }
      if (!department) { UI.toast('กรุณากรอกแผนก', 'error'); return; }
      Api.call('auth.updateProfile', { name: name, department: department }).then(function (updated) {
        State.updateUser(updated); user = State.user;
        UI.toast('บันทึกโปรไฟล์แล้ว', 'success');
      }).catch(function (err) { UI.toast(err.message, 'error'); });
    };

    document.getElementById('logoutBtn').onclick = function () {
      if (!confirm('ออกจากระบบ?')) return;
      Api.call('auth.logout').finally(function () {
        State.logout();
        location.hash = '#/login';
      });
    };

    loadTotalSpend_();
  }

  /** สรุปยอดใช้จ่ายรวมของลูกค้าคนนี้ (ไม่นับออเดอร์ที่ยกเลิก) จากประวัติการสั่งซื้อทั้งหมด */
  function loadTotalSpend_() {
    Api.call('order.list', { page_size: 1000 }).then(function (data) {
      var el = document.getElementById('totalSpendVal');
      if (!el) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วก่อนตอบกลับ
      var total = (data.items || []).filter(function (o) { return o.status !== 'cancelled'; })
        .reduce(function (s, o) { return s + Number(o.grand_total || 0); }, 0);
      el.textContent = UI.money(total);
    }).catch(function () {
      var el = document.getElementById('totalSpendVal');
      if (el) el.textContent = '-';
    });
  }
};
