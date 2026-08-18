/**
 * sw.js — cache app shell (HTML/CSS/JS) เพื่อให้เปิดแอปได้บางส่วนแม้ออฟไลน์
 * หมายเหตุ: ข้อมูลสินค้า/ออเดอร์ยังต้องออนไลน์เพื่อเรียก Apps Script API เสมอ (ไม่ cache ผลลัพธ์ API)
 *
 * กลยุทธ์ cache: network-first (เดิมเป็น cache-first แบบ stale-while-revalidate ซึ่งทำให้ผู้ใช้เห็นโค้ด
 * เวอร์ชันเก่าค้างอยู่เสมอในโหลดแรกแม้ deploy เวอร์ชันใหม่ไปแล้ว ต้องรีเฟรชซ้ำสองครั้งกว่าจะได้เวอร์ชันล่าสุด
 * — ปัญหานี้คือสาเหตุที่แท้จริงที่ทำให้ผู้ใช้เห็นบั๊กที่แก้ไปแล้วซ้ำๆ) ตอนนี้ขอข้อมูลจากเน็ตเวิร์กก่อนเสมอ
 * ถ้าเน็ตล่ม/ออฟไลน์เท่านั้นถึงจะ fallback ไปใช้ cache แทน
 */
var CACHE_NAME = 'ckdaily-shell-v3';
var SHELL_FILES = [
  './', './index.html', './style.css', './config.js', './state.js', './api.js', './app.js', './icons.js',
  './views/login.js', './views/home.js', './views/product.js', './views/cart.js', './views/payment.js', './views/tracking.js', './views/history.js', './views/profile.js', './views/notifications.js',
  './manifest.json', './icon.svg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(SHELL_FILES); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return; // ไม่ cache POST (เรียก API เสมอ)
  if (req.url.indexOf('script.google.com') > -1) return; // ไม่ cache การเรียก Apps Script

  event.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(req, clone); });
      }
      return res;
    }).catch(function () { return caches.match(req); }) // ออนไลน์ไม่ได้เท่านั้นถึง fallback ไปใช้ cache
  );
});
