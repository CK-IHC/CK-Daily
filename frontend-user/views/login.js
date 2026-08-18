/**
 * views/login.js — เข้าสู่ระบบด้วยเบอร์มือถืออย่างเดียว (ไม่ใช้ OTP)
 */
Views.login = function (container) {
  var step = 'phone'; // phone -> onboarding

  function render() {
    if (step === 'phone') return renderPhone();
    if (step === 'onboarding') return renderOnboarding();
  }

  function renderPhone() {
    container.innerHTML =
      '<div class="container" style="padding-top:60px;text-align:center">' +
        '<h2 style="margin:0 0 4px">' + UI.escapeHtml(window.CK_CONFIG.APP_NAME) + '</h2>' +
        '<p style="color:var(--text-muted);margin:0 0 24px">' + UI.escapeHtml(window.CK_CONFIG.APP_TAGLINE) + '</p>' +
        '<div class="form-group" style="text-align:left">' +
          '<label>เบอร์มือถือ</label>' +
          '<input id="phoneInput" class="form-control" type="tel" maxlength="10" placeholder="08xxxxxxxx" inputmode="numeric">' +
        '</div>' +
        '<button id="btnLogin" class="btn btn-primary btn-block">เข้าสู่ระบบ</button>' +
        '<button id="btnGuest" class="btn btn-outline btn-block" style="margin-top:10px">เข้าใช้แบบไม่ล็อกอิน (ดูสินค้าเท่านั้น)</button>' +
      '</div>';

    document.getElementById('btnLogin').onclick = doLogin;
    document.getElementById('phoneInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    document.getElementById('btnGuest').onclick = function () { location.hash = '#/home'; };
  }

  function doLogin() {
    var v = document.getElementById('phoneInput').value.trim();
    if (!/^0[689][0-9]{8}$/.test(v)) { UI.toast('รูปแบบเบอร์โทรไม่ถูกต้อง', 'error'); return; }
    var btn = document.getElementById('btnLogin');
    btn.disabled = true; btn.textContent = 'กำลังเข้าสู่ระบบ...';
    Api.call('auth.loginByPhone', { phone: v }).then(function (data) {
      State.login(data.token, data.user);
      if (data.is_new_user || !data.user.name) { step = 'onboarding'; render(); }
      else { UI.toast('เข้าสู่ระบบสำเร็จ', 'success'); location.hash = '#/home'; }
    }).catch(function (err) {
      UI.toast(err.message, 'error');
      btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ';
    });
  }

  function renderOnboarding() {
    container.innerHTML =
      '<div class="container" style="padding-top:60px;text-align:center">' +
        '<div style="font-size:36px">👋</div>' +
        '<h3>ยินดีต้อนรับ!</h3>' +
        '<p style="color:var(--text-muted)">กรอกชื่อของคุณเพื่อเริ่มใช้งาน</p>' +
        '<div class="form-group" style="text-align:left"><label>ชื่อ</label><input id="nameInput" class="form-control" placeholder="ชื่อ-นามสกุล"></div>' +
        '<button id="btnSave" class="btn btn-primary btn-block">เริ่มใช้งาน</button>' +
      '</div>';
    document.getElementById('btnSave').onclick = function () {
      var name = document.getElementById('nameInput').value.trim();
      if (!name) { UI.toast('กรุณากรอกชื่อ', 'error'); return; }
      Api.call('auth.updateProfile', { name: name }).then(function (user) {
        State.updateUser(user);
        UI.toast('บันทึกสำเร็จ', 'success');
        location.hash = '#/home';
      }).catch(function (err) { UI.toast(err.message, 'error'); });
    };
  }

  render();
};
