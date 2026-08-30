/**
 * BannerService.gs — แบนเนอร์สไลด์ใหญ่บนสุดของหน้าแรกลูกค้า (รูปเต็มความกว้าง เลื่อนสไลด์อัตโนมัติ)
 * รองรับไฟล์ gif/png/jpg/svg แนะนำขนาด 1200x600 (อัตราส่วน 2:1)
 * admin.banners.* (manager/admin) + catalog.getActiveBanners (ลูกค้า ไม่ต้อง login)
 */

function publicBanner_(b) {
  return {
    banner_id: b.banner_id, image_url: b.image_url || '', link_url: b.link_url || '',
    sort_order: numFrom(b.sort_order), is_active: boolFrom(b.is_active),
    start_at: b.start_at || '', end_at: b.end_at || '',
    created_at: b.created_at, updated_at: b.updated_at
  };
}

/** ===================== ลูกค้า: ดึงแบนเนอร์ที่กำลังแสดงผลอยู่ ===================== */
function catalogGetActiveBanners() {
  var now = new Date();
  var rows = findAll('Banners', function (b) {
    if (!boolFrom(b.is_active)) return false;
    if (!b.image_url) return false;
    if (b.start_at && toDate(b.start_at) > now) return false;
    if (b.end_at && toDate(b.end_at) < now) return false;
    return true;
  }).sort(function (x, y) { return numFrom(x.sort_order) - numFrom(y.sort_order); });
  return ok(rows.map(publicBanner_));
}

/** ===================== Admin: CRUD ===================== */
function adminBannersList(payload, token) {
  requireRole(token, ['manager', 'admin']);
  var rows = findAll('Banners', null).sort(function (a, b) { return numFrom(a.sort_order) - numFrom(b.sort_order); });
  return ok(rows.map(publicBanner_));
}

function adminBannersCreate(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['image_url']);
  var obj = {
    banner_id: genId('BNR'), image_url: payload.image_url, link_url: String(payload.link_url || '').slice(0, 500),
    sort_order: numFrom(payload.sort_order, 0), is_active: payload.is_active !== undefined ? boolFrom(payload.is_active) : true,
    start_at: payload.start_at || '', end_at: payload.end_at || ''
  };
  insertRow('Banners', obj);
  writeAudit(auth.user.user_id, auth.user.role, 'create', 'Banner', obj.banner_id, null, obj);
  return ok(publicBanner_(obj), 'สร้างแบนเนอร์แล้ว');
}

function adminBannersUpdate(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['banner_id']);
  var patch = {};
  ['image_url', 'link_url', 'start_at', 'end_at'].forEach(function (f) { if (payload[f] !== undefined) patch[f] = payload[f]; });
  if (payload.sort_order !== undefined) patch.sort_order = numFrom(payload.sort_order);
  if (payload.is_active !== undefined) patch.is_active = boolFrom(payload.is_active);
  var updated = updateByKey('Banners', 'banner_id', payload.banner_id, patch);
  writeAudit(auth.user.user_id, auth.user.role, 'update', 'Banner', payload.banner_id, null, updated);
  return ok(publicBanner_(updated), 'บันทึกแบนเนอร์แล้ว');
}

function adminBannersDelete(payload, token) {
  var auth = requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['banner_id']);
  softDelete('Banners', 'banner_id', payload.banner_id);
  writeAudit(auth.user.user_id, auth.user.role, 'delete', 'Banner', payload.banner_id, null, null);
  return ok(null, 'ลบแบนเนอร์แล้ว');
}

/**
 * อัปโหลดรูป/ไฟล์แบนเนอร์ — คืน image_url ให้ frontend เก็บไว้ใช้ตอน create/update (ไม่ผูกกับแบนเนอร์ใดจนกว่าจะบันทึก)
 * ใช้ raw=true เสมอ (ไม่ใช่ thumbnail) เพื่อให้ไฟล์ GIF เล่นภาพเคลื่อนไหวได้จริงบนหน้าร้าน และ SVG ไม่ถูกแปลงเป็นภาพนิ่ง
 */
function adminBannersUploadImage(payload, token) {
  requireRole(token, ['manager', 'admin']);
  requireFields(payload, ['image_base64']);
  var url = uploadImageToDrive_(payload.image_base64, 'banner-' + Date.now(), 'banner', null, 'CK Daily - Banners', true);
  return ok({ image_url: url }, 'อัปโหลดแบนเนอร์แล้ว');
}
