/**
 * UserService.gs — admin.users.* (จัดการผู้ใช้/role, ระงับบัญชี) — เฉพาะ admin เท่านั้น (RBAC §9)
 */

function publicUserAdmin_(u) {
  return {
    user_id: u.user_id, phone: normalizePhone_(u.phone), name: u.name, role: u.role, points: numFrom(u.points),
    tier: u.tier, default_address: u.default_address, department: u.department || '', status: u.status, last_login_at: u.last_login_at,
    created_at: u.created_at
  };
}

function adminUsersList(payload, token) {
  requireRole(token, ['admin']);
  payload = payload || {};
  var rows = findAll('Users', function (u) {
    if (payload.role && u.role !== payload.role) return false;
    if (payload.search) {
      var q = String(payload.search).toLowerCase();
      return normalizePhone_(u.phone).indexOf(q) > -1 || String(u.name).toLowerCase().indexOf(q) > -1;
    }
    return true;
  }).sort(function (a, b) { return toDate(b.created_at) - toDate(a.created_at); });

  // สรุปยอดใช้จ่ายรวมของลูกค้าแต่ละคน (ไม่นับออเดอร์ที่ยกเลิก) — join จาก Orders ครั้งเดียวแทนวนคิวรีทีละคน
  var spendByUser_ = {};
  findAll('Orders', function (o) { return o.status !== 'cancelled'; }).forEach(function (o) {
    spendByUser_[o.user_id] = (spendByUser_[o.user_id] || 0) + numFrom(o.grand_total);
  });

  return ok(rows.map(function (u) {
    var d = publicUserAdmin_(u);
    d.total_spend = round2(spendByUser_[u.user_id] || 0);
    return d;
  }));
}

/** เพิ่มผู้ใช้โดยตรงจากหน้า admin (เช่น ให้สิทธิ์ staff ล่วงหน้าก่อนเจ้าตัว login เอง) */
function adminUsersCreate(payload, token) {
  var auth = requireRole(token, ['admin']);
  requireFields(payload, ['phone']);
  var phone = String(payload.phone).trim();
  if (!isValidThaiPhone(phone)) throw new ApiError('E_INVALID_PAYLOAD', 'รูปแบบเบอร์โทรไม่ถูกต้อง', 'phone');
  var existing = findOne('Users', function (u) { return normalizePhone_(u.phone) === phone; }, true);
  if (existing) throw new ApiError('E_INVALID_PAYLOAD', 'มีผู้ใช้เบอร์นี้อยู่แล้ว', 'phone');
  var role = ['customer', 'staff', 'manager', 'admin'].indexOf(payload.role) > -1 ? payload.role : 'customer';
  var user = insertRow('Users', {
    user_id: genId('USR'), phone: phone, name: String(payload.name || '').slice(0, 100), role: role,
    points: 0, tier: 'bronze', default_address: '', department: String(payload.department || '').slice(0, 100),
    status: 'active', last_login_at: ''
  });
  writeAudit(auth.user.user_id, auth.user.role, 'create', 'User', user.user_id, null, publicUserAdmin_(user));
  return ok(publicUserAdmin_(user), 'เพิ่มผู้ใช้แล้ว');
}

function adminUsersUpdateRole(payload, token) {
  var auth = requireRole(token, ['admin']);
  requireFields(payload, ['user_id', 'role']);
  if (['customer', 'staff', 'manager', 'admin'].indexOf(payload.role) === -1) {
    throw new ApiError('E_INVALID_PAYLOAD', 'role ไม่ถูกต้อง', 'role');
  }
  // กันแอดมินลดสิทธิ์ตัวเอง (จะหลุดจากหน้าแอดมินทันทีเพราะ role เช็คสดทุกครั้ง) เหมือนที่กันการลบบัญชีตัวเองไว้แล้ว
  if (payload.user_id === auth.user.user_id && payload.role !== 'admin') {
    throw new ApiError('E_INVALID_PAYLOAD', 'ลดสิทธิ์บัญชีตัวเองไม่ได้ (จะทำให้ออกจากระบบแอดมินทันที) ให้แอดมินคนอื่นเปลี่ยนสิทธิ์ให้แทน');
  }
  var user = findOne('Users', function (u) { return u.user_id === payload.user_id; }, true);
  if (!user) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบผู้ใช้', 'user_id');
  var updated = updateRowAt('Users', user.__row, { role: payload.role });
  writeAudit(auth.user.user_id, auth.user.role, 'update_role', 'User', payload.user_id, { role: user.role }, { role: payload.role });
  return ok(publicUserAdmin_(updated), 'เปลี่ยนสิทธิ์แล้ว');
}

function adminUsersSetStatus(payload, token) {
  var auth = requireRole(token, ['admin']);
  requireFields(payload, ['user_id', 'status']);
  if (['active', 'suspended'].indexOf(payload.status) === -1) {
    throw new ApiError('E_INVALID_PAYLOAD', 'status ไม่ถูกต้อง', 'status');
  }
  if (payload.user_id === auth.user.user_id && payload.status === 'suspended') {
    throw new ApiError('E_INVALID_PAYLOAD', 'ระงับบัญชีตัวเองไม่ได้ (จะออกจากระบบทันที) ให้แอดมินคนอื่นระงับให้แทน');
  }
  var user = findOne('Users', function (u) { return u.user_id === payload.user_id; }, true);
  if (!user) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบผู้ใช้', 'user_id');
  var updated = updateRowAt('Users', user.__row, { status: payload.status });
  if (payload.status === 'suspended') {
    findAll('Sessions', function (s) { return s.user_id === payload.user_id; }, true)
      .forEach(function (s) { updateRowAt('Sessions', s.__row, { revoked: true }); });
  }
  writeAudit(auth.user.user_id, auth.user.role, 'set_status', 'User', payload.user_id, { status: user.status }, { status: payload.status });
  return ok(publicUserAdmin_(updated), payload.status === 'suspended' ? 'ระงับบัญชีแล้ว' : 'เปิดใช้งานบัญชีแล้ว');
}

function adminUsersDelete(payload, token) {
  var auth = requireRole(token, ['admin']);
  requireFields(payload, ['user_id']);
  if (payload.user_id === auth.user.user_id) throw new ApiError('E_INVALID_PAYLOAD', 'ลบบัญชีตัวเองไม่ได้');
  var user = findOne('Users', function (u) { return u.user_id === payload.user_id; }, true);
  if (!user) throw new ApiError('E_INVALID_PAYLOAD', 'ไม่พบผู้ใช้', 'user_id');
  softDelete('Users', 'user_id', payload.user_id);
  findAll('Sessions', function (s) { return s.user_id === payload.user_id; }, true)
    .forEach(function (s) { updateRowAt('Sessions', s.__row, { revoked: true }); });
  writeAudit(auth.user.user_id, auth.user.role, 'delete', 'User', payload.user_id, null, null);
  return ok(null, 'ลบผู้ใช้แล้ว');
}
