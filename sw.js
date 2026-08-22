/* Service worker — ทำให้ติดตั้งลงหน้าจอโฮมได้ และเปิดใช้ได้แม้เน็ตไม่เสถียร
   แก้ CACHE เป็นเลขใหม่ทุกครั้งที่แก้ไฟล์ ไม่งั้นเครื่องจะยังใช้ของเดิม */
const CACHE = 'chart-intake-v1';

const SHELL = [
  './',
  './index.html',
  './zxing.min.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/icon-180.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))   // ไฟล์ใดพลาดก็ไม่ล้มทั้งชุด
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // คำสั่งไป Apps Script ต้องวิ่งผ่านเน็ตเสมอ ห้าม cache
  if (url.origin !== self.location.origin) return;

  // index.html: เอาของใหม่ก่อน ถ้าเน็ตล่มค่อยใช้ของเก่า — แก้โค้ดแล้วเห็นผลทันที
  if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html')) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // ไฟล์อื่น (ไลบรารี, ไอคอน): ใช้ของใน cache ก่อน เร็วกว่าและทำงานออฟไลน์ได้
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }))
  );
});
