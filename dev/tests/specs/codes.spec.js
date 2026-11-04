// Ida e volta: a app desenha o código no ecrã do cartão, e dois leitores independentes (zxing-cpp e zbar) leem-no.
// O texto lido tem de ser exatamente igual ao guardado.
const { test, expect } = require('@playwright/test');
const fs = require('fs'); const path = require('path');
const H = require('./helpers');

const SAMPLES = [
  ['EAN13', '5901234123457'], ['EAN8', '96385074'], ['UPC', '036000291452'],
  ['CODE128', 'PD-4410-2291'], ['CODE128', '2090017745123'],
  ['QR', 'LIDLPLUS-PT-7731-0042-9918'], ['QR', 'Cartão Família — ÁÉÍ 123'], ['QR', 'x'.repeat(190)],
  ['PDF417', '6275980099887766'], ['AZTEC', 'CP-AP-LIS-PORTO-C3-41'],
];

test('códigos lidos de volta são iguais ao guardado', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone-15');
  test.setTimeout(120_000);
  const rows = [];
  for (const [format, code] of SAMPLES) {
    const p = await (await page.context().browser().newContext(info.project.use)).newPage();
    await H.openApp(p, { items: [{ id: 'x', kind: 'card', name: 'Teste', color: '#4B9BE8', format, code, note: '', places: [], expires: null }] });
    await p.click('.tile'); await p.waitForTimeout(400);
    const png = path.join(H.FIX, `code-${format}-${rows.length}.png`);
    await p.locator('#code').screenshot({ path: png });
    const zx = H.decodeZxing(png).map(x => x.text), zb = H.decodeZbar(png);
    rows.push({ format, code: code.length > 30 ? code.slice(0, 30) + '…' : code, zxing: zx.includes(code) || zx.includes('0' + code), zbar: zb.includes(code) || zb.includes('0' + code), zbarSuporta: !['PDF417', 'AZTEC'].includes(format), lido: zx[0] && zx[0] !== code ? zx[0].slice(0, 30) : undefined });
    await p.context().close();
  }
  fs.writeFileSync(path.join(__dirname, '..', 'results', 'codes.json'), JSON.stringify(rows, null, 1));
  const bad = rows.filter(r => !r.zxing || (r.zbarSuporta && !r.zbar));
  expect(bad, JSON.stringify(bad)).toEqual([]);
});
