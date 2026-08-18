/**
 * state.js (admin) — token/user ของแอดมิน + RBAC helper (§9)
 */
var ROLE_PERMISSIONS = {
  customer: [],
  staff: ['dashboard:view_limited', 'orders:view', 'orders:update_status', 'kanban:view', 'rounds:view', 'payments:verify'],
  manager: ['dashboard:view', 'dashboard:view_limited', 'orders:view', 'orders:update_status', 'kanban:view', 'rounds:view', 'rounds:manage', 'products:manage', 'stock:manage', 'payments:verify', 'coupons:manage', 'reports:view', 'announcements:manage'],
  admin: ['dashboard:view', 'dashboard:view_limited', 'orders:view', 'orders:update_status', 'kanban:view', 'rounds:view', 'rounds:manage', 'products:manage', 'stock:manage', 'payments:verify', 'coupons:manage', 'reports:view', 'users:manage', 'settings:manage', 'announcements:manage']
};

var State = (function () {
  var KEY = 'ckdaily_admin_state_v1';
  function load() {
    try { var raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) {}
    return { token: null, user: null };
  }
  var data = load();
  function save() { localStorage.setItem(KEY, JSON.stringify(data)); }
  return {
    get token() { return data.token; },
    get user() { return data.user; },
    login: function (token, user) { data.token = token; data.user = user; save(); },
    logout: function () { data.token = null; data.user = null; save(); },
    isLoggedIn: function () { return !!data.token && !!data.user; },
    can: function (perm) {
      if (!data.user) return false;
      var perms = ROLE_PERMISSIONS[data.user.role] || [];
      return perms.indexOf(perm) > -1;
    }
  };
})();
