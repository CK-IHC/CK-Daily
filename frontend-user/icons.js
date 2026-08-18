/**
 * icons.js — ชุดไอคอนคลาสสิก (เส้น, สีเดียว currentColor) แทน emoji สีสันหลากหลาย
 * ใช้: Icon('home', 22) คืน SVG string ใส่สีผ่าน CSS (color:...) เพราะใช้ stroke="currentColor"
 */
var ICON_PATHS_ = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M9.5 20v-6h5v6"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l4 2"/>',
  cart: '<circle cx="9" cy="21" r="1.4"/><circle cx="19" cy="21" r="1.4"/><path d="M1.5 2h3l2.4 12.6a2 2 0 0 0 2 1.65h9a2 2 0 0 0 1.95-1.57L22 7H5.2"/>',
  user: '<path d="M20 21v-1.6A4.4 4.4 0 0 0 15.6 15H8.4A4.4 4.4 0 0 0 4 19.4V21"/><circle cx="12" cy="7.5" r="4"/>',
  bell: '<path d="M18 8.5a6 6 0 0 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5Z"/><path d="M13.7 20.5a2 2 0 0 1-3.4 0"/>',
  search: '<circle cx="11" cy="11" r="7.5"/><path d="M21 21l-4.35-4.35"/>',
  camera: '<path d="M22.5 18.5a1.7 1.7 0 0 1-1.7 1.7H3.2a1.7 1.7 0 0 1-1.7-1.7v-9.8a1.7 1.7 0 0 1 1.7-1.7h3.4L8.5 4h7l1.9 3h3.4a1.7 1.7 0 0 1 1.7 1.7Z"/><circle cx="12" cy="13.5" r="3.6"/>',
  snowflake: '<path d="M12 2v20"/><path d="M4.9 4.9l14.2 14.2"/><path d="M19.1 4.9L4.9 19.1"/><path d="M12 6l-2 2M12 6l2 2M12 18l-2-2M12 18l2-2"/>',
  phone: '<path d="M5.5 3h3l1.5 5-2 1.5a12 12 0 0 0 6.5 6.5L16 14l5 1.5v3a2 2 0 0 1-2.2 2A18 18 0 0 1 3.5 5.2 2 2 0 0 1 5.5 3Z"/>',
  chat: '<path d="M21 12a8 8 0 1 1-3.4-6.5"/><path d="M21 3l-6 6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.1a1.65 1.65 0 0 0-1.08-1.5 1.65 1.65 0 0 0-1.82.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.1A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.1a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.31.4.55.72.7.28.13.6.19.9.19H21a2 2 0 0 1 0 4h-.1a1.65 1.65 0 0 0-1.5 1.11Z"/>',
  pin: '<path d="M12 21.5s7-6.5 7-12A7 7 0 0 0 5 9.5c0 5.5 7 12 7 12Z"/><circle cx="12" cy="9.5" r="2.4"/>',
  download: '<path d="M12 3v13"/><path d="M7 11l5 5 5-5"/><path d="M4 19.5h16"/>',
  link: '<path d="M9.5 14.5 14.5 9.5"/><path d="M11 6.5l1.4-1.4a3.6 3.6 0 0 1 5 5L16 11.5"/><path d="M13 17.5l-1.4 1.4a3.6 3.6 0 0 1-5-5L8 12.5"/>',
  qrcode: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3.5v3.5"/><path d="M20.5 14v.01"/><path d="M14 20.5h3.5"/><path d="M20.5 17.5v3"/>',

  /* ไอคอนหมวดหมู่สินค้า — เส้นคลาสสิกชุดเดียวกันแทน emoji เดิม (ดู CATEGORY_ICON_OPTIONS_ ใน products.js ฝั่งแอดมิน) */
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
  size = size || 22;
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="display:block' + (extraStyle ? ';' + extraStyle : '') + '">' + body + '</svg>';
}

/** ไอคอนหมวดหมู่ — รองรับทั้งค่าใหม่ (icon key เช่น "catRice") และค่าเก่า (emoji ตรงๆ ที่เคยบันทึกไว้ก่อนเปลี่ยนมาใช้ชุดคลาสสิก) */
function CategoryIconHtml(icon, size, extraStyle) {
  if (icon && ICON_PATHS_[icon]) return Icon(icon, size, extraStyle);
  if (icon) return '<span style="font-size:' + (size || 16) + 'px;line-height:1">' + icon + '</span>';
  return Icon('catBox', size, extraStyle);
}
