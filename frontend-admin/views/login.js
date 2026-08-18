/**
 * views/login.js (admin) — เข้าสู่ระบบด้วยเบอร์มือถืออย่างเดียว (ไม่ใช้ OTP)
 * role มาจากข้อมูลที่ admin ตั้งไว้ให้แล้วเท่านั้น (หน้า ผู้ใช้งาน) — เข้าได้เฉพาะ staff/manager/admin
 */
Views.login = function (container) {
  container.innerHTML = '<div style="max-width:380px;margin:70px auto;text-align:center">' +
    '<div style="width:64px;height:64px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;margin:0 auto 14px">' + Icon('settings', 32) + '</div>' +
    '<h2 style="margin:0">CK Daily Admin</h2><p style="color:var(--text-muted)">เข้าสู่ระบบสำหรับพนักงาน/ผู้ดูแลระบบ</p>' +
    '<div class="form-group" style="text-align:left"><label>เบอร์มือถือ</label><input id="phoneInput" class="form-control" maxlength="10" placeholder="08xxxxxxxx"></div>' +
    '<button id="btnLogin" class="btn btn-primary" style="width:100%">เข้าสู่ระบบ</button>' +
    '<p style="font-size:11px;color:var(--text-muted);margin-top:14px">เข้าได้เฉพาะเบอร์ที่ผู้ดูแลระบบตั้งสิทธิ์ Staff/Manager/Admin ไว้แล้วเท่านั้น</p>' +
  '</div>';

  document.getElementById('phoneInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
  document.getElementById('btnLogin').onclick = doLogin;

  function doLogin() {
    var phone = document.getElementById('phoneInput').value.trim();
    if (!/^0[689][0-9]{8}$/.test(phone)) { UI.toast('รูปแบบเบอร์โทรไม่ถูกต้อง', 'error'); return; }
    var btn = document.getElementById('btnLogin');
    btn.disabled = true; btn.textContent = 'กำลังเข้าสู่ระบบ...';
    Api.call('auth.loginByPhone', { phone: phone }).then(function (data) {
      if (['staff', 'manager', 'admin'].indexOf(data.user.role) === -1) {
        UI.toast('บัญชีนี้ไม่มีสิทธิ์เข้าหน้าแอดมิน กรุณาติดต่อผู้ดูแลระบบให้ตั้งสิทธิ์ให้ก่อน', 'error');
        btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ';
        return;
      }
      State.login(data.token, data.user);
      UI.toast('เข้าสู่ระบบสำเร็จ (' + data.user.role + ')', 'success');
      location.hash = '#/orders';
    }).catch(function (err) {
      UI.toast(err.message, 'error');
      btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ';
    });
  }
};
