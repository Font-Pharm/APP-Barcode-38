/* Smoke test — เปิดหน้าเว็บจริงใน jsdom ตรวจว่า init ไม่พัง
   ปุ่มต่อสายครบ และ pipeline การถอดรหัสอ่านบาร์โค้ดจริงได้ */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

let pass = 0, fail = 0;
const diagChecks = [];
const ok = (l, c, x) => { c ? (pass++, console.log('  ✓ ' + l))
                            : (fail++, console.log('  ✗ ' + l + (x !== undefined ? ' → ' + x : ''))); };

// ── canvas ปลอม: เก็บภาพจริงไว้ให้ getImageData คืนค่ากลับมา ──
const store = { w: 0, h: 0, data: null };
function fakeContext(canvas) {
  return {
    canvas,
    drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh) {
      // ครอปจากภาพต้นทางที่ผูกไว้กับ video แล้วย่อแบบ nearest
      const img = src.__img;
      if (!img) throw new Error('no frame');
      const out = new Uint8ClampedArray(dw * dh * 4);
      for (let y = 0; y < dh; y++) {
        const yy = Math.min(img.h - 1, Math.round(sy + (y + .5) * sh / dh));
        for (let x = 0; x < dw; x++) {
          const xx = Math.min(img.w - 1, Math.round(sx + (x + .5) * sw / dw));
          const v = img.gray[yy * img.w + xx], p = (y * dw + x) * 4;
          out[p] = out[p + 1] = out[p + 2] = v; out[p + 3] = 255;
        }
      }
      store.w = dw; store.h = dh; store.data = out;
    },
    getImageData(x, y, w, h) {
      if (!store.data || store.w !== w || store.h !== h) throw new Error('mismatch');
      return { data: store.data, width: w, height: h };
    }
  };
}

const vc = new VirtualConsole();
const errors = [];
vc.on('jsdomError', e => errors.push(e.message));
vc.on('error', (...a) => errors.push(a.join(' ')));

const html = fs.readFileSync(__dirname + '/index.html', 'utf8')
  // jsdom โหลด <script src> ภายนอกไม่ได้ ให้ฝังไฟล์จริงลงไปแทน
  .replace('<script src="zxing.min.js"></script>',
           '<script>' + fs.readFileSync(__dirname + '/zxing.min.js', 'utf8') + '</script>');

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true,
  url: 'https://example.org/app/', virtualConsole: vc,
  beforeParse(win) {
    win.HTMLCanvasElement.prototype.getContext = function () { return fakeContext(this); };
    win.navigator.mediaDevices = { getUserMedia: async () => { throw new Error('no camera in test'); } };
    win.fetch = async () => { throw new Error('offline in test'); };
    win.AudioContext = function () {
      return { state: 'running', currentTime: 0, resume() {}, destination: {},
               createOscillator: () => ({ frequency: {}, connect: () => ({ connect() {} }), start() {}, stop() {} }),
               createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
                                    connect: () => ({ connect() {} }) }) };
    };
    win.confirm = () => true;
    if (!win.matchMedia) win.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){} });
  }
});
const w = dom.window, d = w.document;

console.log('\n── บูตแอป ──');
ok('ไม่มี error ตอนโหลด', errors.length === 0, errors.join(' | '));
ok('ZXing ถูกโหลด', typeof w.ZXing === 'object');
ok('สถานะเริ่มต้นเป็น "พร้อมสแกน"', d.getElementById('stTitle').textContent.indexOf('พร้อม') === 0,
   d.getElementById('stTitle').textContent);
ok('รายการว่างแสดงข้อความถูก', d.getElementById('list').textContent.indexOf('ยังไม่มีรายการ') !== -1);

console.log('\n── สลับภาษา ──');
d.getElementById('langBtn').dispatchEvent(new w.Event('click', { bubbles: true }));
ok('หัวข้อเปลี่ยนเป็นอังกฤษ', d.querySelector('header h1').textContent === 'Chart intake',
   d.querySelector('header h1').textContent);
ok('คำอธิบายขอบเขตแปลตาม', d.getElementById('areaNote').textContent.indexOf('Balances') === 0,
   d.getElementById('areaNote').textContent);
d.getElementById('langBtn').dispatchEvent(new w.Event('click', { bubbles: true }));
ok('กลับเป็นไทยได้', d.querySelector('header h1').textContent === 'ตรวจรับ Chart');

console.log('\n── เลือกขอบเขตการสแกน ──');
const wideBtn = d.querySelector('[data-area="wide"]');
wideBtn.dispatchEvent(new w.Event('click', { bubbles: true }));
ok('ปุ่ม "กว้าง" ถูกเลือก', wideBtn.getAttribute('aria-pressed') === 'true');
ok('ปุ่ม "ปกติ" ถูกยกเลิก',
   d.querySelector('[data-area="normal"]').getAttribute('aria-pressed') === 'false');
ok('บันทึกค่าไว้ใน localStorage',
   JSON.parse(w.localStorage.getItem('cr_pref')).area === 'wide');

console.log('\n── ค่าตั้งค่าอยู่ข้ามการเปิดแอป ──');
w.localStorage.setItem('cr_cfg', JSON.stringify({ url: 'https://x.test/exec', token: 'abc123' }));
const dom2 = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.org/app/',
  virtualConsole: new VirtualConsole(),
  beforeParse(win) {
    win.HTMLCanvasElement.prototype.getContext = function () { return fakeContext(this); };
    win.navigator.mediaDevices = { getUserMedia: async () => { throw new Error('x'); } };
    win.fetch = async () => { throw new Error('offline'); };
    if (!win.matchMedia) win.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){} });
    win.localStorage.setItem('cr_cfg', JSON.stringify({ url: 'https://x.test/exec', token: 'abc123' }));
    win.localStorage.setItem('cr_pref', JSON.stringify({ lang: 'th', area: 'tight', staff: 'ฟ้อนต์' }));
  }
});
const d2 = dom2.window.document;
ok('ลิงก์ถูกเติมกลับให้อัตโนมัติ', d2.getElementById('apiUrl').value === 'https://x.test/exec',
   d2.getElementById('apiUrl').value);
ok('รหัสเชื่อมต่อถูกเติมกลับ', d2.getElementById('apiToken').value === 'abc123');
ok('ขอบเขตที่เคยเลือกถูกจำไว้',
   d2.querySelector('[data-area="tight"]').getAttribute('aria-pressed') === 'true');
ok('รหัสตั้งค่าถูกสร้าง', d2.getElementById('cfgCode').value.indexOf('CI1:') === 0);

const code = d2.getElementById('cfgCode').value;
const decoded = JSON.parse(Buffer.from(code.slice(4), 'base64').toString('utf8'));
ok('รหัสตั้งค่าถอดกลับได้ครบ', decoded.u === 'https://x.test/exec' && decoded.t === 'abc123',
   JSON.stringify(decoded));
dom2.window.close();

console.log('\n── PWA ──');
ok('มี manifest', !!d.querySelector('link[rel="manifest"]'));
ok('มี apple-touch-icon', !!d.querySelector('link[rel="apple-touch-icon"]'));
ok('ตั้ง apple-mobile-web-app-capable', !!d.querySelector('meta[name="apple-mobile-web-app-capable"]'));
ok('คำแนะนำติดตั้งไม่ว่าง', d.getElementById('installNote').textContent.length > 10);

console.log('\n── โลโก้และไอคอน ──');
ok('หัวแอปใช้ไฟล์โลโก้', d.getElementById('brand').getAttribute('src') === 'icons/icon-192.png',
   d.getElementById('brand').getAttribute('src'));
const mf = JSON.parse(fs.readFileSync(__dirname + '/manifest.json', 'utf8'));
ok('manifest ไม่มี id ที่ผูกกับ path ตายตัว', mf.id === undefined, mf.id);
ok('scope เป็น path สัมพัทธ์ (ใช้ได้ทุก repo)', mf.scope === './', mf.scope);
ok('start_url เป็น path สัมพัทธ์', String(mf.start_url).indexOf('./') === 0, mf.start_url);
ok('มีไอคอน 192 / 512 / maskable ครบ',
   ['192x192','512x512'].every(sz => mf.icons.some(i => i.sizes === sz)) &&
   mf.icons.some(i => i.purpose === 'maskable'));
ok('ไฟล์ไอคอนทุกตัวมีอยู่จริง',
   mf.icons.every(i => fs.existsSync(__dirname + '/' + i.src)),
   mf.icons.filter(i => !fs.existsSync(__dirname + '/' + i.src)).map(i => i.src).join(','));
ok('apple-touch-icon มีไฟล์จริง', fs.existsSync(__dirname + '/icons/icon-180.png'));

const sw = fs.readFileSync(__dirname + '/sw.js', 'utf8');
ok('เลข CACHE ถูกอัปเดต (ไม่งั้นเครื่องเดิมเห็นโลโก้เก่า)', sw.indexOf("chart-intake-v1'") === -1);
ok('ไอคอนถูกตั้งเป็น network-first', /icons.*png\$/.test(sw));

console.log('\n── ตัวตรวจสอบการติดตั้ง ──');
ok('มีปุ่มตรวจสอบ', !!d.getElementById('diagBtn'));
ok('มีที่แสดงผลตรวจ', !!d.getElementById('diag'));
ok('runDiag ถูกนิยาม', w.eval('typeof runDiag') === 'function');
ok('browserKind ทำงานได้', typeof w.eval('browserKind()') === 'string', w.eval('browserKind()'));
// รันจริงในสภาพที่ fetch ล้มเหลว ต้องไม่ throw และต้องรายงานว่าข้อไหนไม่ผ่าน
diagChecks.push((async () => {
  await w.eval('runDiag()');
  const out = d.getElementById('diag');
  ok('runDiag ทำงานจบโดยไม่ error', out.children.length >= 6, out.children.length);
  ok('รายงานว่าข้อที่ล้มเหลวไม่ผ่าน', out.querySelectorAll('.bad').length > 0);
  ok('มีคำแนะนำวิธีแก้ติดมาด้วย', out.querySelectorAll('.fix').length > 0);
})());

console.log('\n── pipeline ถอดรหัสจากเฟรมกล้อง ──');
// ผูกภาพบาร์โค้ดจริงเข้ากับ <video> ปลอม แล้วเรียก scanFrame ผ่าน internal
const meta = JSON.parse(fs.readFileSync('/tmp/gray.json', 'utf8'));
const gray = new Uint8ClampedArray(fs.readFileSync('/tmp/gray.bin'));
// ประกอบเฟรมกล้องจำลอง — วางบาร์โค้ดขนาดจริง 1:1 ไว้กลางภาพ
// (ห้ามย่อ/ขยายด้วย nearest neighbour ความกว้างแท่งจะเพี้ยนจนอ่านไม่ออก
//  ซึ่งเป็นข้อจำกัดของการทดสอบ ไม่ใช่ของกล้องจริง)
const FW = 1060, FH = 800;
const bw = meta.w, bh = meta.h;
const frame = new Uint8ClampedArray(FW * FH);
for (let i = 0; i < frame.length; i++) frame[i] = 182 + ((i * 2654435761) % 13);  // เนื้อกระดาษ
for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++)
  frame[(((FH - bh) >> 1) + y) * FW + ((FW - bw) >> 1) + x] = gray[y * meta.w + x];
const video = d.getElementById('video');
video.__img = { w: FW, h: FH, gray: frame };
Object.defineProperty(video, 'videoWidth',  { get: () => FW, configurable: true });
Object.defineProperty(video, 'videoHeight', { get: () => FH, configurable: true });
Object.defineProperty(video, 'readyState',  { get: () => 4,  configurable: true });

let seen = null;
w.eval('window.__test_handle = handleCode; handleCode = async function(c){ window.__seenCode = c; };');
w.eval('running = true; scanFrame();');
seen = w.__seenCode;
ok('ถอดรหัสจากเฟรมได้ = 690012053', seen && String(seen).replace(/\D/g, '') === '690012053', seen);

// อ่านซ้ำอีกรอบด้วย phase อื่น เพื่อยืนยันว่าทุก phase ใช้งานได้
w.__seenCode = null; w.eval('scanFrame();');
const p2 = w.__seenCode;
w.__seenCode = null; w.eval('scanFrame();');
const p3 = w.__seenCode;
ok('phase "ทั้งภาพ" อ่านได้', p2 && String(p2).replace(/\D/g, '') === '690012053', p2);
ok('phase "ยืดคอนทราสต์" อ่านได้', p3 && String(p3).replace(/\D/g, '') === '690012053', p3);

console.log('\n── กันสแกนซ้ำรัว ──');
w.eval('handleCode = window.__test_handle;');
w.eval('pref.staff = "ฟ้อนต์"; cfg.url = ""; session.items = [];');
w.eval('handleCode("*690012053*");');
const n1 = w.eval('session.items.length');
w.eval('handleCode("690012053");');
const n2 = w.eval('session.items.length');
ok('อ่านค่าเดิมซ้ำภายใน cooldown ไม่เพิ่มรายการ', n1 === n2, n1 + ' → ' + n2);

Promise.all(diagChecks).then(() => {
  console.log('\n' + (fail ? '✗ ' + fail + ' ล้มเหลว, ' : '') + pass + ' ผ่าน');
  dom.window.close();
  process.exit(fail ? 1 : 0);
});
