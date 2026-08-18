/**
 * SettingsService.gs — admin.settings.* (อ่าน/แก้ค่าตั้งค่าร้าน) — เฉพาะ admin
 */

function adminSettingsGet(payload, token) {
  requireRole(token, ['admin']);
  return ok(getAllSettings());
}

function adminSettingsUpdate(payload, token) {
  var auth = requireRole(token, ['admin']);
  requireFields(payload, ['settings']);
  var before = getAllSettings();
  Object.keys(payload.settings).forEach(function (key) {
    setSetting(key, String(payload.settings[key]));
  });
  writeAudit(auth.user.user_id, auth.user.role, 'update_settings', 'Settings', '', before, payload.settings);
  return ok(getAllSettings(), 'บันทึกการตั้งค่าแล้ว');
}

/** อัปโหลดรูป QR การชำระเงินของร้าน (แสดงในหน้าชำระเงินของลูกค้า) — เก็บ URL ไว้ที่ setting payment_qr_url */
function adminSettingsUploadQr(payload, token) {
  var auth = requireRole(token, ['admin']);
  requireFields(payload, ['image_base64']);
  var url = uploadImageToDrive_(payload.image_base64, 'payment-qr-' + Date.now() + '.jpg', 'settings');
  setSetting('payment_qr_url', url, 'รูป QR ชำระเงินของร้าน (อัปโหลดจากหน้าตั้งค่า)');
  writeAudit(auth.user.user_id, auth.user.role, 'upload_payment_qr', 'Settings', '', null, { payment_qr_url: url });
  return ok({ payment_qr_url: url }, 'อัปโหลด QR ชำระเงินแล้ว');
}
