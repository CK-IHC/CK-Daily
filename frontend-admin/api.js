/**
 * api.js (admin) — เหมือนฝั่งลูกค้า ใช้ Content-Type: text/plain กัน CORS preflight
 */
var Api = (function () {
  function call(action, payload) {
    var body = JSON.stringify({ action: action, token: State.token || '', payload: payload || {} });
    return fetch(window.CK_CONFIG.API_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body
    })
      .then(function (res) { return res.json(); })
      .catch(function () { return { success: false, error: { code: 'E_NETWORK' }, message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบ API URL ใน config.js' }; })
      .then(function (res) {
        if (!res.success) {
          if (res.error && res.error.code === 'E_UNAUTHORIZED') State.logout();
          var err = new Error(res.message || 'เกิดข้อผิดพลาด');
          err.code = res.error ? res.error.code : 'E_SERVER';
          err.field = res.error ? res.error.field : null;
          throw err;
        }
        return res.data;
      });
  }
  return { call: call };
})();
