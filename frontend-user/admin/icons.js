/**
 * icons.js (admin) — ชุดไอคอนคลาสสิก (เส้น, สีเดียว currentColor) แทน emoji
 */
var ICON_PATHS_ = {
  dashboard: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>',
  orders: '<path d="M14.5 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14.5 2.5V8H19"/><path d="M9 13h6"/><path d="M9 17h6"/>',
  kanban: '<rect x="3" y="3" width="5.5" height="18" rx="1.2"/><rect x="9.5" y="3" width="5.5" height="12" rx="1.2"/><rect x="16" y="3" width="5.5" height="8" rx="1.2"/>',
  rounds: '<path d="M22 4v6h-6"/><path d="M2 20v-6h6"/><path d="M3.5 9a8.5 8.5 0 0 1 13.4-3.4L22 10"/><path d="M20.5 15a8.5 8.5 0 0 1-13.4 3.4L2 14"/>',
  products: '<path d="M20.5 16V8a1.9 1.9 0 0 0-.95-1.64l-6.6-3.8a1.9 1.9 0 0 0-1.9 0l-6.6 3.8A1.9 1.9 0 0 0 3.5 8v8a1.9 1.9 0 0 0 .95 1.64l6.6 3.8a1.9 1.9 0 0 0 1.9 0l6.6-3.8A1.9 1.9 0 0 0 20.5 16Z"/><path d="M3.9 6.9 12 11.5l8.1-4.6"/><path d="M12 21v-9.5"/>',
  stock: '<path d="M20.5 8v12h-17V8"/><path d="M1.5 3h21v5h-21z"/><path d="M9.5 12h5"/>',
  payments: '<rect x="1" y="4.5" width="22" height="15" rx="2"/><path d="M1 9.5h22"/><path d="M5 15h4"/>',
  coupons: '<path d="M19.6 12.9 10.7 21.8a1.9 1.9 0 0 1-2.7 0l-6.8-6.8a1.9 1.9 0 0 1 0-2.7L10.1 3.4a1.9 1.9 0 0 1 1.35-.55H18a2 2 0 0 1 2 2v6.65a1.9 1.9 0 0 1-.4 1.4Z"/><circle cx="15" cy="8" r="1.5"/>',
  announcements: '<path d="M3 11v2a2 2 0 0 0 2 2h1l1.5 5h2l-1.3-5H12l7 4V6l-7 4H6a3 3 0 0 0-3 3Z"/><path d="M12 6v10"/><path d="M18 9.5a2.5 2.5 0 0 1 0 5"/>',
  banners: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8" cy="10" r="1.8"/><path d="M2.5 16l5-4.5 4 3.5 3-2.5 5 4.5"/>',
  users: '<path d="M16 21v-1.8a3.6 3.6 0 0 0-3.6-3.6H5.6A3.6 3.6 0 0 0 2 19.2V21"/><circle cx="8.8" cy="7.8" r="3.6"/><path d="M22 21v-1.8a3.6 3.6 0 0 0-2.7-3.5"/><path d="M15 4.4a3.6 3.6 0 0 1 0 7"/>',
  reports: '<path d="M4 20V11"/><path d="M11 20V4"/><path d="M18 20v-7"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.1a1.65 1.65 0 0 0-1.08-1.5 1.65 1.65 0 0 0-1.82.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.1A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.1a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.31.4.55.72.7.28.13.6.19.9.19H21a2 2 0 0 1 0 4h-.1a1.65 1.65 0 0 0-1.5 1.11Z"/>',
  logout: '<path d="M9 21H5.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2H9"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  camera: '<path d="M22.5 18.5a1.7 1.7 0 0 1-1.7 1.7H3.2a1.7 1.7 0 0 1-1.7-1.7v-9.8a1.7 1.7 0 0 1 1.7-1.7h3.4L8.5 4h7l1.9 3h3.4a1.7 1.7 0 0 1 1.7 1.7Z"/><circle cx="12" cy="13.5" r="3.6"/>',
  snowflake: '<path d="M12 2v20"/><path d="M4.9 4.9l14.2 14.2"/><path d="M19.1 4.9L4.9 19.1"/><path d="M12 6l-2 2M12 6l2 2M12 18l-2-2M12 18l2-2"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 12.5a2 2 0 0 0 2 1.9h6a2 2 0 0 0 2-1.9L18 7"/><path d="M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="7.5" rx="1.5"/><path d="M6 16.5V21h12v-4.5"/>',
  storefront: '<path d="M3.5 9 4.5 4h15l1 5"/><path d="M4 9v11h16V9"/><path d="M3.5 9h17"/><path d="M9.5 20v-5.5h5V20"/>',

  /* ไอคอนหมวดหมู่สินค้า — เส้นคลาสสิกชุดเดียวกันแทน emoji เดิม (ดู CATEGORY_ICON_OPTIONS_ ใน views/products.js) */
  catRice: '<path d="M3 12a9 5 0 0 0 18 0"/><path d="M3 12h18"/><path d="M12 8V4"/><path d="M8.5 8c0-1.5.5-2.8 1.5-4"/><path d="M15.5 8c0-1.5-.5-2.8-1.5-4"/>',
  catNoodle: '<path d="M3 12a9 5 0 0 0 18 0"/><path d="M3 12h18"/><path d="M7.5 9c1-1 2 1 3 0s2 1 3 0 2 1 3 0"/><path d="M17 3l3 5.5"/><path d="M14.3 3.5l2.2 5.5"/>',
  catChicken: '<path d="M9.3 14.7a5 5 0 1 1 7-7c1.8 1.8 2.4 4.6 1.2 7-1.1 2.2-3.3 3-5.2 2.5-1.3-.3-2.4-1.2-3-2.5Z"/><path d="M9 15c-2 2-4 3-5.5 4.5a2 2 0 1 0 2.8 2.8C7.8 20.7 9 18.5 11 16.5"/>',
  catSalad: '<path d="M3 12a9 5 0 0 0 18 0"/><path d="M3 12h18"/><path d="M7.5 9l2 2 5-5"/>',
  catDessert: '<path d="M4 20h16"/><path d="M6 20V11.5l6-5.5 6 5.5V20"/><path d="M6 12h12"/><path d="M12 6V4"/>',
  catHotDrink: '<path d="M4.5 9h13v6a4 4 0 0 1-4 4h-5a4 4 0 0 1-4-4Z"/><path d="M17.5 10.5H19a2.5 2.5 0 0 1 0 5h-1.5"/><path d="M8.5 5c0 1-1 1-1 2"/><path d="M13 5c0 1-1 1-1 2"/>',
  catLunchbox: '<rect x="3" y="8" width="18" height="12" rx="1.5"/><path d="M3 13.5h18"/><path d="M9.5 8V5.3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V8"/>',
  catBread: '<path d="M4 12.5a8 6 0 0 1 16 0v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M9 12.5v6"/><path d="M15 12.5v6"/>',
  catColdDrink: '<path d="M6.3 8h11.4l-1.4 10.7a2 2 0 0 1-2 1.8H9.7a2 2 0 0 1-2-1.8Z"/><path d="M5.5 8l-1-3.5h15l-1 3.5"/><path d="M13.5 3.2v5"/>',
  catSoup: '<path d="M3 11.5h18v2.5a6 6 0 0 1-6 6h-6a6 6 0 0 1-6-6Z"/><path d="M1 11.5h2M21 11.5h2"/><path d="M9 8.5c0-1 1-1 1-2M14 8.5c0-1 1-1 1-2"/>',
  catBox: '<path d="M3 8 12 3l9 5-9 5-9-5Z"/><path d="M3 8v9l9 5V13"/><path d="M21 8v9l-9 5"/>',
  catFish: '<path d="M2.5 12c3.5-4.5 9-6.5 14-4.5a10 10 0 0 1 5 4.5 10 10 0 0 1-5 4.5c-5 2-10.5 0-14-4.5Z"/><path d="M17 7.5l4-3.5-1 4.5"/><path d="M17 16.5l4 3.5-1-4.5"/><circle cx="6" cy="11.3" r=".5"/>',
  catMeat: '<path d="M4.5 13c-1.2-4 1.5-8.5 6-9 3.3-.4 6.3 1.2 7.3 4.2.8 2.4-.1 5-2.3 6.6.9 1 1.3 2.4.8 3.7-.8 2.1-3.4 3-5.7 2-1 .7-2.3.8-3.4.2-2-1.1-3.2-3.3-2.7-5.6Z"/><path d="M10 14l2-2M9 17l3-3"/>',
  catCake: '<path d="M4 21h16"/><path d="M4.5 21v-4.5a1.5 1.5 0 0 1 1.5-1.5h12a1.5 1.5 0 0 1 1.5 1.5V21"/><path d="M4.5 17.5c1-1 2-1 3 0s2 1 3 0 2 1 3 0 2 1 3 0"/><path d="M7.5 15V11a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v4"/><path d="M12 10V7"/><path d="M12 7c-1 0-1.5-.6-1.5-1.3S12 4 12 3c0 1 1.5 1.4 1.5 2.7S13 7 12 7Z"/>'
};

function Icon(name, size, extraStyle) {
  var body = ICON_PATHS_[name] || '';
  size = size || 20;
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:block' + (extraStyle ? ';' + extraStyle : '') + '">' + body + '</svg>';
}

/** ไอคอนหมวดหมู่ — รองรับทั้งค่าใหม่ (icon key เช่น "catRice") และค่าเก่า (emoji ตรงๆ ที่เคยบันทึกไว้ก่อนเปลี่ยนมาใช้ชุดคลาสสิก) */
function CategoryIconHtml(icon, size, extraStyle) {
  if (icon && ICON_PATHS_[icon]) return Icon(icon, size, extraStyle);
  if (icon) return '<span style="font-size:' + (size || 16) + 'px;line-height:1">' + icon + '</span>';
  return Icon('catBox', size, extraStyle);
}
