/**
 * Code.gs — จุดเข้า Web App เดียว (doGet / doPost) + Router
 * เรียกด้วย POST body JSON: { "action": "...", "token": "...", "payload": {...} }
 * หมายเหตุ CORS: ฝั่ง frontend ต้อง POST ด้วย Content-Type: text/plain;charset=utf-8
 * (ไม่ใช่ application/json) เพื่อให้เป็น "simple request" ไม่ trigger CORS preflight
 * ซึ่ง Apps Script Web App จัดการ preflight เองไม่ได้
 */

var ROUTES = {
  'auth.requestOtp': function (p, t) { return authRequestOtp(p); },
  'auth.verifyOtp': function (p, t) { return authVerifyOtp(p); },
  'auth.loginByPhone': function (p, t) { return authLoginByPhone(p); },
  'auth.me': function (p, t) { return authMe(p, t); },
  'auth.updateProfile': function (p, t) { return authUpdateProfile(p, t); },
  'auth.logout': function (p, t) { return authLogout(p, t); },

  'catalog.getCategories': function (p, t) { return catalogGetCategories(); },
  'catalog.getProducts': function (p, t) { return catalogGetProducts(p); },
  'catalog.getProductDetail': function (p, t) { return catalogGetProductDetail(p); },
  'catalog.getActiveRounds': function (p, t) { return catalogGetActiveRounds(); },
  'catalog.getPublicSettings': function (p, t) { return catalogGetPublicSettings(); },
  'catalog.getPaymentQrBase64': function (p, t) { return catalogGetPaymentQrBase64(); },
  'catalog.getActiveAnnouncements': function (p, t) { return catalogGetActiveAnnouncements(); },
  'catalog.getActiveBanners': function (p, t) { return catalogGetActiveBanners(); },

  'cart.validate': function (p, t) { return cartValidate(p, t); },
  'coupon.check': function (p, t) { return couponCheck(p, t); },

  'order.create': function (p, t) { return orderCreate(p, t); },
  'order.uploadSlip': function (p, t) { return orderUploadSlip(p, t); },
  'order.list': function (p, t) { return orderList(p, t); },
  'order.detail': function (p, t) { return orderDetail(p, t); },
  'order.cancel': function (p, t) { return orderCancel(p, t); },
  'order.track': function (p, t) { return orderTrack(p, t); },
  'order.getReceiptQrBase64': function (p, t) { return orderGetReceiptQrBase64(p, t); },
  'order.getSlipBase64': function (p, t) { return orderGetSlipBase64(p, t); },
  'order.getSlipsBase64': function (p, t) { return orderGetSlipsBase64(p, t); },

  'notify.list': function (p, t) { return notifyList(p, t); },
  'notify.markRead': function (p, t) { return notifyMarkRead(p, t); },
  'notify.markAllRead': function (p, t) { return notifyMarkAllRead(p, t); },
  'notify.delete': function (p, t) { return notifyDelete(p, t); },

  'admin.dashboard': function (p, t) { return adminDashboard(p, t); },
  'admin.liveDashboard': function (p, t) { return adminLiveDashboard(p, t); },

  'admin.orders.list': function (p, t) { return adminOrdersList(p, t); },
  'admin.orders.updateStatus': function (p, t) { return adminOrdersUpdateStatus(p, t); },
  'admin.orders.bulkUpdateStatus': function (p, t) { return adminOrdersBulkUpdateStatus(p, t); },
  'admin.orders.verifyPayment': function (p, t) { return adminOrdersVerifyPayment(p, t); },
  'admin.orders.refund': function (p, t) { return adminOrdersRefund(p, t); },
  'admin.orders.analyzeSlip': function (p, t) { return adminOrdersAnalyzeSlip(p, t); },
  'admin.payments.list': function (p, t) { return adminPaymentsList(p, t); },
  'admin.orders.uploadPhoto': function (p, t) { return adminOrdersUploadPhoto(p, t); },
  'admin.orders.setNote': function (p, t) { return adminOrdersSetNote(p, t); },
  'admin.orders.delete': function (p, t) { return adminOrdersDelete(p, t); },
  'admin.orders.summary': function (p, t) { return adminOrdersSummary(p, t); },
  'admin.orders.findByOrderNo': function (p, t) { return adminOrdersFindByOrderNo(p, t); },
  'admin.orderItems.export': function (p, t) { return adminOrderItemsExport(p, t); },

  'admin.rounds.list': function (p, t) { return adminRoundsList(p, t); },
  'admin.rounds.create': function (p, t) { return adminRoundsCreate(p, t); },
  'admin.rounds.update': function (p, t) { return adminRoundsUpdate(p, t); },
  'admin.rounds.open': function (p, t) { return adminRoundsOpen(p, t); },
  'admin.rounds.close': function (p, t) { return adminRoundsClose(p, t); },
  'admin.rounds.setStatus': function (p, t) { return adminRoundsSetStatus(p, t); },
  'admin.rounds.delete': function (p, t) { return adminRoundsDelete(p, t); },
  'admin.rounds.summary': function (p, t) { return adminRoundsSummary(p, t); },
  'admin.rounds.orders': function (p, t) { return adminRoundsOrders(p, t); },

  'admin.products.list': function (p, t) { return adminProductsList(p, t); },
  'admin.products.create': function (p, t) { return adminProductsCreate(p, t); },
  'admin.products.update': function (p, t) { return adminProductsUpdate(p, t); },
  'admin.products.toggleActive': function (p, t) { return adminProductsToggleActive(p, t); },
  'admin.products.delete': function (p, t) { return adminProductsDelete(p, t); },
  'admin.products.importCsv': function (p, t) { return adminProductsImportCsv(p, t); },

  'admin.categories.list': function (p, t) { return adminCategoriesList(p, t); },
  'admin.categories.create': function (p, t) { return adminCategoriesCreate(p, t); },
  'admin.categories.update': function (p, t) { return adminCategoriesUpdate(p, t); },
  'admin.categories.delete': function (p, t) { return adminCategoriesDelete(p, t); },

  'admin.productOptions.list': function (p, t) { return adminProductOptionsList(p, t); },
  'admin.productOptions.upsert': function (p, t) { return adminProductOptionsUpsert(p, t); },
  'admin.productOptions.delete': function (p, t) { return adminProductOptionsDelete(p, t); },

  'admin.stock.list': function (p, t) { return adminStockList(p, t); },
  'admin.stock.adjust': function (p, t) { return adminStockAdjust(p, t); },
  'admin.stock.importCsv': function (p, t) { return adminStockImportCsv(p, t); },
  'admin.stock.movements': function (p, t) { return adminStockMovements(p, t); },

  'admin.coupons.list': function (p, t) { return adminCouponsList(p, t); },
  'admin.coupons.create': function (p, t) { return adminCouponsCreate(p, t); },
  'admin.coupons.update': function (p, t) { return adminCouponsUpdate(p, t); },
  'admin.coupons.delete': function (p, t) { return adminCouponsDelete(p, t); },

  'admin.users.list': function (p, t) { return adminUsersList(p, t); },
  'admin.users.create': function (p, t) { return adminUsersCreate(p, t); },
  'admin.users.updateRole': function (p, t) { return adminUsersUpdateRole(p, t); },
  'admin.users.setStatus': function (p, t) { return adminUsersSetStatus(p, t); },
  'admin.users.delete': function (p, t) { return adminUsersDelete(p, t); },

  'admin.reports.salesByTime': function (p, t) { return adminReportsSalesByTime(p, t); },
  'admin.reports.topProducts': function (p, t) { return adminReportsTopProducts(p, t); },
  'admin.reports.bottomProducts': function (p, t) { return adminReportsBottomProducts(p, t); },
  'admin.reports.salesByRound': function (p, t) { return adminReportsSalesByRound(p, t); },
  'admin.reports.profitLoss': function (p, t) { return adminReportsProfitLoss(p, t); },
  'admin.reports.stock': function (p, t) { return adminReportsStock(p, t); },
  'admin.reports.customers': function (p, t) { return adminReportsCustomers(p, t); },
  'admin.reports.payments': function (p, t) { return adminReportsPayments(p, t); },
  'admin.reports.cancellations': function (p, t) { return adminReportsCancellations(p, t); },
  'admin.reports.generateSheets': function (p, t) { return adminReportsGenerateSheets(p, t); },

  'admin.settings.get': function (p, t) { return adminSettingsGet(p, t); },
  'admin.settings.update': function (p, t) { return adminSettingsUpdate(p, t); },
  'admin.settings.uploadQr': function (p, t) { return adminSettingsUploadQr(p, t); },

  'admin.announcements.list': function (p, t) { return adminAnnouncementsList(p, t); },
  'admin.announcements.create': function (p, t) { return adminAnnouncementsCreate(p, t); },
  'admin.announcements.update': function (p, t) { return adminAnnouncementsUpdate(p, t); },
  'admin.announcements.delete': function (p, t) { return adminAnnouncementsDelete(p, t); },
  'admin.announcements.uploadImage': function (p, t) { return adminAnnouncementsUploadImage(p, t); },

  'admin.banners.list': function (p, t) { return adminBannersList(p, t); },
  'admin.banners.create': function (p, t) { return adminBannersCreate(p, t); },
  'admin.banners.update': function (p, t) { return adminBannersUpdate(p, t); },
  'admin.banners.delete': function (p, t) { return adminBannersDelete(p, t); },
  'admin.banners.uploadImage': function (p, t) { return adminBannersUploadImage(p, t); }
};

function dispatch_(action, payload, token) {
  var handler = ROUTES[action];
  if (!handler) return fail('E_INVALID_PAYLOAD', 'ไม่รู้จัก action: ' + action, 'action');
  try {
    return handler(payload || {}, token || '');
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.field);
    console.error(action, err && err.stack ? err.stack : err);
    return fail('E_SERVER', 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์: ' + (err && err.message ? err.message : String(err)));
  }
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput_(fail('E_INVALID_PAYLOAD', 'รูปแบบ request ไม่ถูกต้อง (ต้องเป็น JSON)'));
  }
  return jsonOutput_(dispatch_(body.action, body.payload, body.token));
}

/** doGet ไว้เช็คสถานะ/ทดสอบเบา ๆ เท่านั้น (การใช้งานจริงทั้งหมดผ่าน doPost) */
function doGet(e) {
  if (e && e.parameter && e.parameter.action) {
    return jsonOutput_(dispatch_(e.parameter.action, {}, e.parameter.token));
  }
  return jsonOutput_(ok({ service: 'CK Daily API', status: 'running', time: nowIso_() }));
}
