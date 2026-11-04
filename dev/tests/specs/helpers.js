const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const bwipjs = require('bwip-js');
const JSZip = require('jszip');

const KEY = 'scaling-cards-proto-v2';
// Funciona em dois sítios: na pasta de trabalho (site em pwa/) e dentro do repositório (testes em dev/tests, site na raiz).
const IN_REPO = !fs.existsSync(path.join(__dirname, '..', '..', 'pwa', 'index.html'));
const SITE = IN_REPO ? '' : 'pwa/';
const PROTO = IN_REPO ? 'dev/scaling-cards.html' : 'scaling-cards.html';
const APP = process.env.SC_APP || SITE + 'index.html'; // SC_APP=antes-v7/pwa/index.html testa a versão antiga
const SHOTS = path.join(__dirname, '..', process.env.SC_SHOTS || 'shots');
const FIX = path.join(__dirname, '..', 'fixtures');
fs.mkdirSync(FIX, { recursive: true }); fs.mkdirSync(path.join(__dirname, '..', 'results'), { recursive: true });

const day = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

const CARDS = () => [
  { id: 'c1', kind: 'card', name: 'Continente', color: '#E30613', format: 'EAN13', code: '5901234123457', note: 'Cartão Continente · nível Ouro', places: [], expires: null },
  { id: 'c2', kind: 'card', name: 'Pingo Doce', color: '#7AB929', format: 'CODE128', code: '4410229177530', note: 'Poupa Mais', places: [], expires: null },
  { id: 'c3', kind: 'card', name: 'Lidl', color: '#0050AA', format: 'QR', code: 'LIDLPLUS-PT-7731-0042-9918', note: '', places: [], expires: null },
  { id: 'c4', kind: 'card', name: 'Worten', color: '#E2001A', format: 'NUMBER', code: '883 120 554', note: 'Worten Resolve', places: [], expires: null },
  { id: 'c5', kind: 'card', name: 'Farmácias Portuguesas', color: '#00A19A', format: 'EAN13', code: '2600000123459', note: 'Cartão Saúda com uma nota bastante comprida para testar', places: [], expires: null },
  { id: 'c6', kind: 'card', name: 'IKEA Family', color: '#0058A3', format: 'PDF417', code: '6275980099887766', note: '', places: [], expires: null },
  { id: 'c7', kind: 'card', name: 'Holmes Place', color: '#5B5B66', format: 'QR', code: 'HP-MEMBER-55102', note: 'Porta lateral · cacifo 214', places: [], expires: null },
  { id: 'c8', kind: 'card', name: 'Decathlon', color: '#0082C3', format: 'CODE128', code: '2090017745123', note: '', places: [], expires: null },
  { id: 't1', kind: 'ticket', name: 'Cinema NOS', color: '#6A5ACD', format: 'QR', code: 'NOS-ALV-SALA4-F12', note: 'Sala 4 · F12 e F13 · 21h30', places: [], expires: day(3) },
  { id: 't2', kind: 'ticket', name: 'Vale IKEA', color: '#0058A3', format: 'CODE128', code: 'VALE10-8812', note: '10 € acima de 50 €', places: [], expires: day(25) },
  { id: 't3', kind: 'ticket', name: 'Coliseu', color: '#E86FB8', format: 'AZTEC', code: 'COL-PLATEIA-B-18', note: 'Plateia B, lugar 18', places: [], expires: day(-2) },
];

async function openApp(page, { items = [], onboarded = true, extra = {}, hash = '', path: p = APP } = {}) {
  await page.addInitScript(([key, data]) => {
    if (!sessionStorage.getItem('__seeded')) { localStorage.setItem(key, JSON.stringify(data)); sessionStorage.setItem('__seeded', '1'); }
  }, [KEY, { items, onboarded, cols: 2, tab: 'card', ...extra }]);
  await page.goto(p + hash);
  await page.waitForFunction(() => typeof window.render === 'function');
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2000))]));
  await page.waitForTimeout(150);
}
async function freshApp(page, p = APP) { await page.goto(p); await page.waitForFunction(() => typeof window.render === 'function'); await page.waitForTimeout(200); }

// Fake camera: a canvas stream showing a picture we choose (window.__cam = data URL)
async function fakeCamera(page) {
  await page.addInitScript(() => {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720; c.style.cssText = 'position:fixed;left:-2000px;top:0;width:2px;height:2px';
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(c)); const g = c.getContext('2d');
    window.__camTracks = [];
    const draw = () => { g.fillStyle = '#ddd'; g.fillRect(0, 0, 1280, 720); if (window.__camImg) { const i = window.__camImg; const s = Math.min(1000 / i.width, 600 / i.height); g.drawImage(i, 640 - i.width * s / 2, 360 - i.height * s / 2, i.width * s, i.height * s); } requestAnimationFrame(draw); };
    draw();
    window.__setCam = url => new Promise(r => { const i = new Image(); i.onload = () => { window.__camImg = i; r(); }; i.src = url; });
    if (!navigator.mediaDevices) navigator.mediaDevices = {};
    const fake = async () => { const s = c.captureStream(15); window.__camTracks.push(...s.getTracks()); return s; };
    Object.defineProperty(MediaDevices.prototype, 'getUserMedia', { value: fake, configurable: true, writable: true });
    Object.defineProperty(MediaDevices.prototype, 'enumerateDevices', { value: async () => [{ kind: 'videoinput', deviceId: 'fake', label: 'Câmara de teste', groupId: 'g' }], configurable: true, writable: true });
  });
}

function barcodePng(bcid, text, file, opts = {}) {
  const out = path.join(FIX, file);
  return bwipjs.toBuffer({ bcid, text, scale: 4, height: 18, includetext: false, paddingwidth: 20, paddingheight: 20, backgroundcolor: 'FFFFFF', ...opts })
    .then(buf => { fs.writeFileSync(out, buf); return out; });
}

async function pkpass(file, pass) {
  const zip = new JSZip();
  zip.file('pass.json', JSON.stringify(pass));
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const out = path.join(FIX, file); fs.writeFileSync(out, buf); return out;
}

// independent readers: zxing-cpp (C++) and zbar
function decodeZxing(png) {
  const py = 'import sys,json,zxingcpp\nfrom PIL import Image\nr=zxingcpp.read_barcodes(Image.open(sys.argv[1]).convert("L"))\nprint(json.dumps([{"format":str(x.format).split(".")[-1],"text":x.text} for x in r]))';
  return JSON.parse(execFileSync('python3', ['-c', py, png]).toString());
}
function decodeZbar(png) {
  try { return execFileSync('/opt/homebrew/bin/zbarimg', ['--raw', '-q', png]).toString().trim().split('\n').filter(Boolean); }
  catch (e) { return []; }
}

// Finds text that overlaps other visible text, text cut off / overflowing, and sideways scrolling.
async function layoutIssues(page, { fixedToo = false } = {}) {
  return page.evaluate((fixedToo) => {
    const W = innerWidth, H = innerHeight, out = [];
    const visible = el => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false; } return true; };
    const onTop = (el, b) => { const x = Math.min(W - 1, Math.max(0, b.left + b.width / 2)), y = Math.min(H - 1, Math.max(0, b.top + b.height / 2)); const hit = document.elementFromPoint(x, y); return hit && (hit === el || el.contains(hit) || hit.contains(el)); };
    const label = el => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''));
    const boxes = [];
    const fixedOf = el => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) if (getComputedStyle(e).position === 'fixed') return e; return null; };
    const scrolls = document.documentElement.scrollHeight > H + 4;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode, t = n.textContent.trim(); if (!t) continue;
      const el = n.parentElement; if (!el || !visible(el) || el.closest('script,style,svg,datalist,option')) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      const clip = (b0) => { let b = { left: b0.left, right: b0.right, top: b0.top, bottom: b0.bottom }; for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const c = e.getBoundingClientRect(); b = { left: Math.max(b.left, c.left), right: Math.min(b.right, c.right), top: Math.max(b.top, c.top), bottom: Math.min(b.bottom, c.bottom) }; } } b.width = b.right - b.left; b.height = b.bottom - b.top; return b; };
      for (const b0 of r.getClientRects()) { const b = clip(b0); if (b.width < 2 || b.height < 2) continue; if (b.width < 2 || b.height < 2 || b.bottom < 0 || b.top > H) continue; if (!onTop(el, b)) continue; boxes.push({ el, b, t: t.slice(0, 40) }); }
    }
    for (const el of document.querySelectorAll('input:not([type=checkbox]):not([type=file]):not([type=range]),textarea,select')) {
      if (!visible(el)) continue; const b = el.getBoundingClientRect(); if (b.width < 2 || b.bottom < 0 || b.top > H || !onTop(el, b)) continue;
      boxes.push({ el, b, t: '[campo ' + label(el) + ']' });
      if (b.width < 60) out.push({ type: 'campo-estreito', what: label(el), detail: Math.round(b.width) + 'px' });
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i], B = boxes[j]; if (A.el === B.el || A.el.contains(B.el) || B.el.contains(A.el)) continue;
      // um botão fixo por cima de conteúdo que se pode deslizar é normal; isso verifica-se no fim da página (fixedToo)
      if (!fixedToo && scrolls && !!fixedOf(A.el) !== !!fixedOf(B.el)) continue;
      const ix = Math.min(A.b.right, B.b.right) - Math.max(A.b.left, B.b.left), iy = Math.min(A.b.bottom, B.b.bottom) - Math.max(A.b.top, B.b.top);
      if (ix > 3 && iy > 3) out.push({ type: 'sobreposto', what: `"${A.t}" × "${B.t}"`, detail: `${Math.round(ix)}×${Math.round(iy)}px` });
    }
    for (const { el, b, t } of boxes) {
      if ((b.right > W + 1 && b.left < W - 1) || (b.left < -1 && b.right > 1)) out.push({ type: 'fora-do-ecra', what: `"${t}"`, detail: `x ${Math.round(b.left)}–${Math.round(b.right)} de ${W}` });
    }
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el) || el.closest('svg')) continue; const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && cs.textOverflow !== 'ellipsis' && ['hidden', 'clip'].includes(cs.overflowX) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !['canvas','video','img'].includes(el.tagName.toLowerCase()))
        out.push({ type: 'texto-cortado', what: label(el), detail: `${el.scrollWidth}>${el.clientWidth}px` });
    }
    if (document.documentElement.scrollWidth > W + 1) out.push({ type: 'scroll-lateral', what: 'página', detail: document.documentElement.scrollWidth + '>' + W });
    const seen = new Set(); return out.filter(o => { const k = o.type + o.what; if (seen.has(k)) return false; seen.add(k); return true; });
  }, fixedToo);
}

async function shot(page, project, name) {
  const dir = path.join(SHOTS, project); fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(450); // animações
  await page.screenshot({ path: path.join(dir, name + '.png') });
}

module.exports = { KEY, APP, SITE, PROTO, CARDS, day, openApp, freshApp, fakeCamera, barcodePng, pkpass, decodeZxing, decodeZbar, layoutIssues, shot, FIX, SHOTS };
