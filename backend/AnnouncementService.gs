/**
 * AnnouncementService.gs — ประกาศที่แสดงใต้แบนเนอร์รอบใหญ่ในหน้าแรกของลูกค้า (ข้อความ + ลิงก์ + รูป)
 * admin.announcements.* (manager/admin) + catalog.getActiveAnnouncements (ลูกค้า ไม่ต้อง login)
 */

var ANNOUNCEMENT_SIZES_ = ['small', 'medium', 'large'];

function publicAnnouncement_(a) {
  return {
    announcement_id: a.announcement_id, text: a.text, link_url: a.link_url || '', image_url: a.image_url || '',
    size: ANNOUNCEMENT_SIZES_.indexOf(a.size) > -1 ? a.size : 'medium', sort_order: numFrom(a.sort_order),
    is_active: boolFrom(a.is_active), start_at: a.start_at || '', end_at: a.end_at || '',
    created_at: a.created_at, updated_at: a.updated_at
  };
}

/** ===================== ลูกค้า: ดึงประกาศที่กำลังแสดงผลอยู่ ===================== */
function catalogGetActiveAnnouncements() {
  var now = new Date();
  var rows = findAll('Announcements', function (a) {
    if (!boolFrom(a.is_active)) return false;
    if (a.start_at && toDate(a.start_at) > now) return false;
    if (a.end_at && toDate(a.end_at) < now) return false;
    return true;
  }).sort(function (x, y) { return numFrom(x.sort_order) - numFrom(y.sort_order); });
  return ok(rows.map(publicAnnouncement_));
}

/** ===================== Admin: CRUD ===================== */
function adminAnnouncementsList(payload, token) {
  requireRole(token, ['manager', 'admin']);
  var rows = findAll('Announcements', null).sort(function (a, b) { return numFrom(a.sort_order) - numFrom(b.sort_order); });
  return ok(rows.map(publicAnnouncement_));
}

function adminAnnouncementsCreate(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['text']);
  if (payload.size && ANNOUNCEMENT_SIZES_.indexOf(payload.size) === -1) throw new ApiError('E_INVALID_PAYLOAD', 'ขนาดไม่ถูกต้อง', 'size');
  var obj = {
    announcement_id: genId('ANN'), text: String(payload.text).slice(0, 500), link_url: String(payload.link_url || '').slice(0, 500),
    image_url: payload.image_url || '', size: payload.size || 'medium', sort_order: numFrom(payload.sort_order, 0),
    is_active: payload.is_active !== undefined ? boolFrom(payload.is_active) : true,
    start_at: payload.start_at || '', end_at: payload.end_at || ''
  };
  insertRow('Announcements', obj);
  writeAudit(auth.user.user_id, auth.user.role, 'create', 'Announcement', obj.announcement_id, null, obj);
  return ok(publicAnnouncement_(obj), 'สร้างประกาศแล้ว');
}

function adminAnnouncementsUpdate(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['announcement_id']);
  if (payload.size && ANNOUNCEMENT_SIZES_.indexOf(payload.size) === -1) throw new ApiError('E_INVALID_PAYLOAD', 'ขนาดไม่ถูกต้อง', 'size');
  var patch = {};
  ['text', 'link_url', 'image_url', 'size', 'start_at', 'end_at'].forEach(function (f) { if (payload[f] !== undefined) patch[f] = payload[f]; });
  if (payload.sort_order !== undefined) patch.sort_order = numFrom(payload.sort_order);
  if (payload.is_active !== undefined) patch.is_active = boolFrom(payload.is_active);
  var updated = updateByKey('Announcements', 'announcement_id', payload.announcement_id, patch);
  writeAudit(auth.user.user_id, auth.user.role, 'update', 'Announcement', payload.announcement_id, null, updated);
  return ok(publicAnnouncement_(updated), 'บันทึกประกาศแล้ว');
}

function adminAnnouncementsDelete(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['announcement_id']);
  softDelete('Announcements', 'announcement_id', payload.announcement_id);
  writeAudit(auth.user.user_id, auth.user.role, 'delete', 'Announcement', payload.announcement_id, null, null);
  return ok(null, 'ลบประกาศแล้ว');
}

/** อัปโหลดรูปประกาศ — คืน image_url ให้ frontend เก็บไว้ใช้ตอน create/update (ไม่ผูกกับประกาศใดจนกว่าจะบันทึก) */
function adminAnnouncementsUploadImage(payload, token) {
  requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['image_base64']);
  var url = uploadImageToDrive_(payload.image_base64, 'announcement-' + Date.now() + '.jpg', 'announcement', null, 'CK Daily - Announcements');
  return ok({ image_url: url }, 'อัปโหลดรูปแล้ว');
}
