/**
 * Auth.gs — OTP (dev-mode, พร้อมต่อ SMS provider จริงภายหลัง), Session, RBAC middleware
 */

var OTP_TTL_MIN = 5;
var OTP_MAX_ATTEMPTS = 5;
var OTP_RATE_LIMIT_COUNT = 3;
var OTP_RATE_LIMIT_MIN = 10;
var SESSION_TTL_DAYS = 30;

/** ===================== auth.requestOtp ===================== */
function authRequestOtp(payload) {
  requireFields(payload, ['phone']);
  var phone = String(payload.phone).trim();
  if (!isValidThaiPhone(phone)) {
    throw new ApiError('E_INVALID_PAYLOAD', 'รูปแบบเบอร์โทรไม่ถูกต้อง', 'phone');
  }

  var since = addMinutes(new Date(), -OTP_RATE_LIMIT_MIN);
  var recentCount = countRows('OTP', function (r) {
    return r.phone === phone && toDate(r.created_at) && toDate(r.created_at) > since;
  });
  if (recentCount >= OTP_RATE_LIMIT_COUNT) {
    throw new ApiError('E_OTP_RATE_LIMIT', 'ขอ OTP บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่');
  }

  var otpCode = randomDigits_(6);
  var refCode = randomDigits_(4);
  var expiresAt = addMinutes(new Date(), OTP_TTL_MIN);

  insertRow('OTP', {
    otp_id: genId('OTP'),
    phone: phone,
    otp_code: sha256_(otpCode),
    ref_code: refCode,
    expires_at: fmtDateTime(expiresAt),
    attempts: 0,
    is_used: false
  });

  var devMode = boolFrom(getSetting('otp_dev_mode', OTP_DEV_MODE));
  var sent = false;
  if (!devMode) {
    sent = sendOtpSms_(phone, otpCode);
  }

  var data = { ref_code: refCode, expires_in_sec: OTP_TTL_MIN * 60, dev_mode: devMode, sms_sent: sent };
  if (devMode) {
    data.otp_code = otpCode; // เฉพาะ dev mode เท่านั้น เพื่อทดสอบ flow โดยไม่ต้องต่อ SMS จริง
  }
  return ok(data, devMode ? 'โหมดทดสอบ: ใช้ otp_code ที่ส่งกลับมาได้เลย' : 'ส่งรหัส OTP แล้ว');
}

/** ===================== auth.verifyOtp ===================== */
function authVerifyOtp(payload) {
  requireFields(payload, ['phone', 'otp_code', 'ref_code']);
  var phone = String(payload.phone).trim();

  var candidates = findAll('OTP', function (r) {
    return r.phone === phone && r.ref_code === String(payload.ref_code) && !boolFrom(r.is_used);
  }).sort(function (a, b) { return toDate(b.created_at) - toDate(a.created_at); });

  var otpRow = candidates[0];
  if (!otpRow) throw new ApiError('E_OTP_INVALID', 'รหัสอ้างอิงไม่ถูกต้องหรือถูกใช้ไปแล้ว', 'ref_code');

  if (toDate(otpRow.expires_at) < new Date()) {
    throw new ApiError('E_OTP_EXPIRED', 'รหัส OTP หมดอายุแล้ว กรุณาขอรหัสใหม่');
  }
  if (numFrom(otpRow.attempts) >= OTP_MAX_ATTEMPTS) {
    throw new ApiError('E_OTP_INVALID', 'กรอกผิดเกินจำนวนครั้งที่กำหนด กรุณาขอรหัสใหม่');
  }

  if (sha256_(String(payload.otp_code)) !== otpRow.otp_code) {
    updateRowAt('OTP', otpRow.__row, { attempts: numFrom(otpRow.attempts) + 1 });
    throw new ApiError('E_OTP_INVALID', 'รหัส OTP ไม่ถูกต้อง', 'otp_code');
  }

  updateRowAt('OTP', otpRow.__row, { is_used: true });

  var user = findOne('Users', function (r) { return normalizePhone_(r.phone) === phone; });
  var isNewUser = false;
  if (!user) {
    isNewUser = true;
    user = insertRow('Users', {
      user_id: genId('USR'),
      phone: phone,
      name: '',
      role: 'customer',
      points: 0,
      tier: 'bronze',
      default_address: '',
      status: 'active',
      last_login_at: fmtDateTime(new Date())
    });
  } else {
    if (user.status === 'suspended') throw new ApiError('E_FORBIDDEN', 'บัญชีนี้ถูกระงับการใช้งาน');
    updateRowAt('Users', user.__row, { last_login_at: fmtDateTime(new Date()) });
  }

  var token = Utilities.getUuid();
  var issuedAt = new Date();
  var expiresAt = addDays(issuedAt, SESSION_TTL_DAYS);
  insertRow('Sessions', {
    token: token,
    user_id: user.user_id,
    role: user.role,
    device_info: String(payload.device_info || ''),
    issued_at: fmtDateTime(issuedAt),
    expires_at: fmtDateTime(expiresAt),
    revoked: false
  });

  writeAudit(user.user_id, user.role, 'login', 'User', user.user_id, null, null);

  return ok({
    token: token,
    is_new_user: isNewUser,
    user: publicUser_(user)
  }, 'เข้าสู่ระบบสำเร็จ');
}

/**
 * auth.loginByPhone — ล็อกอินด้วยเบอร์โทรอย่างเดียว ไม่ต้องยืนยัน OTP
 * role ของบัญชีมาจากข้อมูลที่มีอยู่แล้วเท่านั้น (ผู้ใช้ใหม่ = customer เสมอ) — ไม่รับ role จาก client
 * การให้สิทธิ์ staff/manager/admin ต้องทำผ่านหน้า admin.users.updateRole โดยบัญชี admin เท่านั้น
 * คำเตือน: ไม่มีการยืนยันตัวตนด้วย OTP อีกต่อไป ใครพิมพ์เบอร์ที่ยังไม่เคยมี role สูงก็ยัง login เป็น customer ได้ทันที
 * เหมาะสำหรับช่วงทดสอบ/demo เท่านั้น — ก่อนใช้งานจริงควรกลับไปใช้ auth.requestOtp/verifyOtp
 */
function authLoginByPhone(payload) {
  requireFields(payload, ['phone']);
  var phone = String(payload.phone).trim();
  if (!isValidThaiPhone(phone)) {
    throw new ApiError('E_INVALID_PAYLOAD', 'รูปแบบเบอร์โทรไม่ถูกต้อง', 'phone');
  }

  var user = findOne('Users', function (r) { return normalizePhone_(r.phone) === phone; });
  var isNewUser = false;
  if (!user) {
    isNewUser = true;
    user = insertRow('Users', {
      user_id: genId('USR'),
      phone: phone,
      name: '',
      role: 'customer',
      points: 0,
      tier: 'bronze',
      default_address: '',
      status: 'active',
      last_login_at: fmtDateTime(new Date())
    });
  } else {
    if (user.status === 'suspended') throw new ApiError('E_FORBIDDEN', 'บัญชีนี้ถูกระงับการใช้งาน');
    user = updateRowAt('Users', user.__row, { last_login_at: fmtDateTime(new Date()) });
  }

  var token = Utilities.getUuid();
  var issuedAt = new Date();
  var expiresAt = addDays(issuedAt, SESSION_TTL_DAYS);
  insertRow('Sessions', {
    token: token,
    user_id: user.user_id,
    role: user.role,
    device_info: String(payload.device_info || ''),
    issued_at: fmtDateTime(issuedAt),
    expires_at: fmtDateTime(expiresAt),
    revoked: false
  });

  writeAudit(user.user_id, user.role, 'login_by_phone', 'User', user.user_id, null, null);

  return ok({ token: token, is_new_user: isNewUser, user: publicUser_(user) }, 'เข้าสู่ระบบสำเร็จ');
}

function publicUser_(user) {
  return {
    user_id: user.user_id,
    phone: normalizePhone_(user.phone),
    name: user.name,
    role: user.role,
    points: numFrom(user.points),
    tier: user.tier,
    default_address: user.default_address,
    department: user.department || '',
    avatar_url: user.avatar_url || '',
    status: user.status
  };
}

/** ===================== Session / RBAC middleware ===================== */
function getSession_(token) {
  if (!token) return null;
  var session = findOne('Sessions', function (r) { return r.token === token; }, true);
  if (!session) return null;
  if (boolFrom(session.revoked)) return null;
  if (toDate(session.expires_at) < new Date()) return null;
  return session;
}

/** คืน {user, session} หรือ throw E_UNAUTHORIZED */
function requireAuth(token) {
  var session = getSession_(token);
  if (!session) throw new ApiError('E_UNAUTHORIZED', 'กรุณาเข้าสู่ระบบ');
  var user = findOne('Users', function (r) { return r.user_id === session.user_id; });
  if (!user || user.status === 'suspended') throw new ApiError('E_UNAUTHORIZED', 'บัญชีไม่พร้อมใช้งาน');
  user.phone = normalizePhone_(user.phone); // กันเบอร์ที่ Sheets ตัดเลข 0 นำหน้าทิ้ง ให้ทุกจุดที่ใช้ auth.user.phone ต่อได้ค่าที่ถูกต้องเสมอ
  return { user: user, session: session };
}

/** ตรวจ role ฝั่ง backend เสมอ ห้ามพึ่ง frontend ซ่อนปุ่มอย่างเดียว */
function requireRole(token, allowedRoles) {
  var auth = requireAuth(token);
  if (allowedRoles.indexOf(auth.user.role) === -1) {
    throw new ApiError('E_FORBIDDEN', 'คุณไม่มีสิทธิ์ทำรายการนี้');
  }
  return auth;
}

/** ===================== auth.me / updateProfile / logout ===================== */
function authMe(payload, token) {
  var auth = requireAuth(token);
  return ok(publicUser_(auth.user));
}

function authUpdateProfile(payload, token) {
  var auth = requireAuth(token);
  var patch = {};
  if (payload.name !== undefined) patch.name = String(payload.name).slice(0, 100);
  if (payload.address !== undefined) patch.default_address = String(payload.address).slice(0, 300);
  if (payload.department !== undefined) patch.department = String(payload.department).slice(0, 100);
  if (payload.avatar_base64) patch.avatar_url = uploadImageToDrive_(payload.avatar_base64, 'avatar-' + auth.user.user_id + '.jpg', auth.user.user_id);
  var before = publicUser_(auth.user);
  var updated = updateRowAt('Users', auth.user.__row, patch);
  writeAudit(auth.user.user_id, auth.user.role, 'update_profile', 'User', auth.user.user_id, before, publicUser_(updated));
  return ok(publicUser_(updated), 'บันทึกโปรไฟล์แล้ว');
}

function authLogout(payload, token) {
  var session = getSession_(token);
  if (session) updateRowAt('Sessions', session.__row, { revoked: true });
  return ok(null, 'ออกจากระบบแล้ว');
}
