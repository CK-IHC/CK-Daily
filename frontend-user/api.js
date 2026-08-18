/**
 * api.js — ตัวกลางเรียก Apps Script Web App (Content-Type: text/plain กัน CORS preflight)
 */
var Api = (function () {
  // แคชสั้นๆ ฝั่ง client สำหรับ endpoint อ่านอย่างเดียวที่ข้อมูลเปลี่ยนไม่บ่อย ลดการยิงซ้ำตอนสลับหน้าไปมา
  var CACHE_TTL_MS_ = { 'catalog.getCategories': 60000, 'catalog.getPublicSettings': 60000 };
  var cache_ = {};

  function call(action, payload) {
    var ttl = CACHE_TTL_MS_[action];
    var cacheKey = ttl ? action + '|' + JSON.stringify(payload || {}) : null;
    if (cacheKey && cache_[cacheKey] && (Date.now() - cache_[cacheKey].t) < ttl) {
      return Promise.resolve(cache_[cacheKey].data);
    }
    var body = JSON.stringify({ action: action, token: State.token || '', payload: payload || {} });
    return fetch(window.CK_CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body
    })
      .then(function (res) { return res.json(); })
      .catch(function () {
        return { success: false, error: { code: 'E_NETWORK' }, message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตหรือ API URL ใน config.js' };
      })
      .then(function (res) {
        if (!res.success) {
          if (res.error && res.error.code === 'E_UNAUTHORIZED') {
            State.logout();
          }
          var err = new Error(res.message || 'เกิดข้อผิดพลาด');
          err.code = res.error ? res.error.code : 'E_SERVER';
          err.field = res.error ? res.error.field : null;
          throw err;
        }
        if (cacheKey) cache_[cacheKey] = { data: res.data, t: Date.now() };
        return res.data;
      });
  }
  return { call: call };
})();
