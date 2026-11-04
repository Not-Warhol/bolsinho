// Percursos completos. Corre só no iPhone 15 (os outros ecrãs são verificados em layout.spec.js).
const { test, expect } = require('@playwright/test');
const H = require('./helpers');

test.beforeEach(({}, info) => { test.skip(info.project.name !== 'iphone-15', 'percursos só no iPhone 15'); });
const errors = page => { const e = []; page.on('pageerror', x => e.push(x.message)); return e; };

test('1. primeira vez: sem cartões, tutorial só uma vez', async ({ page }) => {
  const errs = errors(page);
  await H.freshApp(page);
  await expect(page.locator('.tut')).toBeVisible();
  expect(await page.evaluate(() => state.items.length)).toBe(0);
  for (let i = 0; i < 3; i++) await page.click('#tNext');
  await page.click('#tLater');
  await expect(page.locator('.tut')).toHaveCount(0);
  await expect(page.locator('.empty')).toContainText('Ainda não tem cartões');
  await page.reload(); await page.waitForTimeout(300);
  await expect(page.locator('.tut')).toHaveCount(0);
  expect(errs).toEqual([]);
});

test('2. Novo cartão: Cancelar fecha o ecrã', async ({ page }) => {
  const errs = errors(page);
  await H.openApp(page);
  await page.click('#btnAdd');
  await expect(page.locator('#eCancel')).toBeVisible();
  await page.click('#eCancel');
  await expect(page.locator('#eCancel')).toHaveCount(0);
  expect(errs).toEqual([]);
});

test('3. Novo cartão à mão: sugestão de loja, guardar, fica depois de reabrir', async ({ page }) => {
  const errs = errors(page);
  await H.openApp(page);
  await page.click('#btnAdd');
  await page.fill('#eName', 'conti');
  await page.click('#eSug button:has-text("Continente")');
  await page.selectOption('#eFormat', 'EAN13');
  await page.fill('#eCode', '5901234123457');
  await page.click('#eSave');
  await expect(page.locator('.pass h2')).toHaveText('Continente');
  await page.click('#pClose');
  await expect(page.locator('.tile')).toHaveCount(1);
  await page.reload(); await page.waitForTimeout(300);
  await expect(page.locator('.tile .name')).toHaveText('Continente');
  expect(errs).toEqual([]);
});

test('4. Câmara: abre em ecrã inteiro, Cancelar fecha e desliga a câmara', async ({ page }) => {
  await H.fakeCamera(page);
  await H.openApp(page);
  await page.click('#btnAdd');
  await page.click('#eLiveBtn');
  const cam = page.locator('#camFull');
  await expect(cam).toBeVisible();
  const box = await page.locator('#camFull video').boundingBox(); const vp = page.viewportSize();
  expect(box.width).toBeGreaterThanOrEqual(vp.width - 1); expect(box.height).toBeGreaterThanOrEqual(vp.height - 1);
  await page.click('#eLiveStop');
  await expect(cam).toHaveCount(0);
  const tracks = await page.evaluate(() => window.__camTracks.map(t => t.readyState));
  expect(tracks.length).toBeGreaterThan(0); // a câmara chegou mesmo a ligar
  expect(tracks.every(t => t === 'ended')).toBe(true);
});

test('5. Câmara lê um código de barras e preenche o cartão', async ({ page }) => {
  const png = await H.barcodePng('ean13', '5901234123457', 'cam-ean.png', { includetext: true });
  await H.fakeCamera(page);
  await H.openApp(page);
  await page.evaluate(b64 => window.__setCam('data:image/png;base64,' + b64), require('fs').readFileSync(png).toString('base64'));
  await page.click('#btnAdd');
  await page.click('#eLiveBtn');
  await expect(page.locator('#camFull')).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator('#eCode')).toHaveValue('5901234123457');
  await expect(page.locator('#eFormat')).toHaveValue('EAN13');
});

test('6. Foto: uma captura preenche o número', async ({ page }) => {
  const png = await H.barcodePng('code128', 'PINGODOCE-4410', 'foto-code128.png');
  await H.openApp(page);
  await page.click('#btnAdd');
  await page.setInputFiles('#ePhoto', png);
  await expect(page.locator('#eCode')).toHaveValue('PINGODOCE-4410', { timeout: 10000 });
});

test('7. Várias capturas de uma vez', async ({ page }) => {
  const files = [await H.barcodePng('ean13', '5901234123457', 'b1.png'), await H.barcodePng('qrcode', 'LIDLPLUS-PT-0001', 'b2.png'), await H.barcodePng('code128', 'XYZ-1', 'b3.png')];
  await H.openApp(page);
  await page.click('#btnAdd');
  await page.setInputFiles('#ePhoto', files);
  await expect(page.locator('#bMsg')).toContainText('Encontrei 3 de 3', { timeout: 15000 });
  await expect(page.locator('.brow.ok').nth(1).locator('.bname')).toHaveValue('Lidl');
  await page.locator('.brow.ok').nth(0).locator('.bname').fill('Continente');
  await page.locator('.brow.ok').nth(2).locator('.bname').fill('Loja X');
  await page.click('#bAdd');
  await expect(page.locator('.tile')).toHaveCount(3);
});

test('8. Da Carteira (.pkpass): IKEA com QR e codificação iso-8859-1', async ({ page }) => {
  const f = await H.pkpass('ikea.pkpass', { formatVersion: 1, organizationName: 'IKEA', description: 'IKEA Family', backgroundColor: 'rgb(0, 88, 163)',
    storeCard: { primaryFields: [{ key: 'n', label: 'Membro', value: 'Ana Silva' }] },
    barcodes: [{ message: '6275980099887766', format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1', altText: '6275 9800 9988 7766' }] });
  await H.openApp(page);
  await page.click('#btnAdd');
  await page.setInputFiles('#ePass', f);
  await expect(page.locator('#eName')).toHaveValue('IKEA');
  await expect(page.locator('#eCode')).toHaveValue('6275980099887766');
  await expect(page.locator('#eFormat')).toHaveValue('QR');
  await page.click('#eSave');
  await expect(page.locator('.pass h2')).toHaveText('IKEA');
});

test('9. Bilhetes: aviso dos dias que faltam e Expirados', async ({ page }) => {
  await H.openApp(page, { items: H.CARDS() });
  await page.click('#tabTickets');
  await expect(page.locator('.tile[data-id=t1] .badge')).toHaveText('Faltam 3 dias');
  await expect(page.locator('.section-label')).toContainText('Expirados · 1');
  await expect(page.locator('.tile.expired')).toHaveCount(1);
});

test('10. Procurar aparece com mais de 6 cartões e filtra', async ({ page }) => {
  await H.openApp(page, { items: H.CARDS() });
  await expect(page.locator('#search')).toBeVisible();
  await page.fill('#search', 'lidl');
  await expect(page.locator('.tile')).toHaveCount(1);
});

test('11. Partilhar: o QR mostrado contém o link certo, e o link guarda o cartão noutro telemóvel', async ({ page, browser }) => {
  await H.openApp(page, { items: H.CARDS().slice(0, 1) });
  await page.click('.tile');
  await page.click('#pShare');
  const link = await page.evaluate(() => shareLink(state.items[0]));
  const qr = page.locator('#shQr'); await expect(qr).toBeVisible(); await page.waitForTimeout(300);
  const png = require('path').join(H.FIX, 'share-qr.png'); await qr.screenshot({ path: png });
  expect(H.decodeZxing(png).map(x => x.text)).toContain(link);
  // outro telemóvel, sem cartões
  const other = await browser.newContext({ ...require('@playwright/test').devices['iPhone 15'] });
  const p2 = await other.newPage();
  await p2.goto(H.SITE + 'cartao.html' + link.slice(link.indexOf('#')));
  await expect(p2.locator('#rSave')).toBeVisible();
  await p2.click('#rSave');
  expect(await p2.evaluate(() => state.items.map(i => i.code))).toEqual(['5901234123457']);
  await other.close();
});

test('12. Colar um link partilhado em Novo cartão', async ({ page }) => {
  await H.openApp(page, { items: H.CARDS().slice(0, 1) });
  const link = await page.evaluate(() => shareLink(state.items[0]));
  await page.evaluate(() => { state.items = []; save(); render(); });
  await page.click('#btnAdd');
  await page.fill('#eLink', link);
  await expect(page.locator('.pass h2')).toHaveText('Continente');
});

test('13. Exportar e importar a cópia de segurança', async ({ page, browser }) => {
  await H.openApp(page, { items: H.CARDS() });
  await page.click('#btnSettings'); await page.click('#sExp');
  const json = await page.locator('#sJson').inputValue();
  const ctx = await browser.newContext(); const p2 = await ctx.newPage();
  await H.openApp(p2);
  await p2.click('#btnSettings'); await p2.click('#sImp');
  await p2.fill('#sIn', json); await p2.click('#sDoImp');
  expect(await p2.evaluate(() => state.items.length)).toBe(H.CARDS().length);
  await ctx.close();
});

test('14. Editar e apagar (dois toques)', async ({ page }) => {
  await H.openApp(page, { items: H.CARDS().slice(0, 2) });
  await page.click('.tile >> nth=0'); await page.click('#pEdit');
  await page.fill('#eNote', 'Nota nova'); await page.click('#eSave');
  await expect(page.locator('.meta')).toContainText('Nota nova');
  await page.click('#pEdit'); await page.click('#eDel'); await page.click('#eDel');
  await expect(page.locator('.tile')).toHaveCount(1);
});

test('15. Protótipo do claude.ai (sem câmara em direto): guardar funciona', async ({ page }) => {
  const errs = errors(page);
  await H.openApp(page, { path: H.PROTO });
  await page.click('#btnAdd');
  await page.fill('#eName', 'Lidl'); await page.fill('#eCode', '123'); await page.click('#eSave');
  await expect(page.locator('.pass h2')).toHaveText('Lidl');
  expect(errs).toEqual([]);
});

test('16. QR com textos de vários tamanhos nunca falha', async ({ page }) => {
  await H.openApp(page);
  const bad = await page.evaluate(() => { const fails = []; const el = document.createElement('div'); document.body.appendChild(el);
    for (let n = 1; n <= 400; n += 1) { el.innerHTML = ''; const it = { format: 'QR', code: 'Ç'.repeat(n % 7) + 'x'.repeat(n) }; drawCode(el, it); if (!el.querySelector('canvas,img,table')) fails.push(n); }
    el.remove(); return fails; });
  expect(bad).toEqual([]);
});

test('17. Localização: guardar o local na loja e, ao voltar lá com a app aberta, o cartão passa para a frente', async ({ browser }) => {
  const LOJA = { latitude: 38.7539, longitude: -9.1886 }; // um ponto em Lisboa
  const ctx = await browser.newContext({ ...require('@playwright/test').devices['iPhone 15'], geolocation: LOJA, permissions: ['geolocation'] });
  const page = await ctx.newPage(); const errs = errors(page);
  await H.openApp(page, { items: H.CARDS().slice(0, 4) });
  await page.click('.tile[data-id=c3]'); await page.click('#pEdit');
  await page.click('#eGeo');
  await expect(page.locator('#eGeoHint')).toContainText('1 local guardado');
  await page.click('#eSave'); await page.click('#pClose');
  expect(await page.evaluate(() => state.notify)).toBe(true);
  // longe (5 km): nada muda
  await ctx.setGeolocation({ latitude: 38.72, longitude: -9.14 });
  await page.evaluate(async () => { lastGeo = 0; await checkPlace(); });
  await expect(page.locator('.notif')).toHaveCount(0);
  await expect(page.locator('.tile').first()).toHaveAttribute('data-id', 'c1');
  // a 60 m da loja: o cartão Lidl passa para a frente e aparece o aviso dentro da app
  await ctx.setGeolocation({ latitude: 38.7544, longitude: -9.1886 });
  await page.evaluate(async () => { lastGeo = 0; await checkPlace(); });
  await expect(page.locator('.tile').first()).toHaveAttribute('data-id', 'c3');
  await expect(page.locator('.notif')).toContainText('Estou aqui!');
  await page.click('.notif');
  await expect(page.locator('.pass h2')).toHaveText('Lidl');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('18. Localização recusada: mensagem clara, sem erro', async ({ browser }) => {
  const ctx = await browser.newContext({ ...require('@playwright/test').devices['iPhone 15'] });
  const page = await ctx.newPage(); const errs = errors(page);
  await H.openApp(page, { items: H.CARDS().slice(0, 1) });
  await page.evaluate(() => { navigator.geolocation.getCurrentPosition = (ok, no) => no({ code: 1, message: 'denied' }); });
  await page.click('.tile'); await page.click('#pEdit'); await page.click('#eGeo');
  await expect(page.locator('.toast')).toContainText('Ajustes');
  expect(errs).toEqual([]);
  await ctx.close();
});
