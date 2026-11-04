// Cada ecrã, em cada tamanho de iPhone: procura texto sobreposto, cortado ou fora do ecrã, e guarda capturas.
const { test, expect } = require('@playwright/test');
const fs = require('fs'); const path = require('path');
const H = require('./helpers');
const AxeBuilder = require('@axe-core/playwright').default;

const SCREENS = [
  ['tutorial-1', async p => { await H.freshApp(p); }],
  ['tutorial-2', async p => { await H.freshApp(p); await p.click('#tNext'); }],
  ['tutorial-3', async p => { await H.freshApp(p); await p.click('#tNext'); await p.click('#tNext'); }],
  ['tutorial-4', async p => { await H.freshApp(p); for (let i = 0; i < 3; i++) await p.click('#tNext'); }],
  ['inicio-vazio', async p => { await H.openApp(p); }],
  ['inicio-cartoes', async p => { await H.openApp(p, { items: H.CARDS() }); }],
  ['inicio-3-por-linha', async p => { await H.openApp(p, { items: H.CARDS(), extra: { cols: 3 } }); }],
  ['inicio-1-por-linha', async p => { await H.openApp(p, { items: H.CARDS(), extra: { cols: 1 } }); }],
  ['bilhetes', async p => { await H.openApp(p, { items: H.CARDS() }); await p.click('#tabTickets'); }],
  ['novo-cartao', async p => { await H.openApp(p); await p.click('#btnAdd'); }],
  ['novo-cartao-fim', async p => { await H.openApp(p); await p.click('#btnAdd'); await p.locator('.sheet').evaluate(s => s.scrollTop = s.scrollHeight); }],
  ['novo-bilhete', async p => { await H.openApp(p); await p.click('#tabTickets'); await p.click('#btnAdd'); }],
  ['cartao-ean', async p => { await H.openApp(p, { items: H.CARDS() }); await p.click('.tile[data-id=c1]'); }],
  ['cartao-pdf417', async p => { await H.openApp(p, { items: H.CARDS() }); await p.click('.tile[data-id=c6]'); }],
  ['bilhete-quase', async p => { await H.openApp(p, { items: H.CARDS() }); await p.click('#tabTickets'); await p.click('.tile[data-id=t1]'); }],
  ['partilhar', async p => { await H.openApp(p, { items: H.CARDS() }); await p.click('.tile[data-id=c1]'); await p.click('#pShare'); }],
  ['receber', async p => { await H.openApp(p, { items: H.CARDS().slice(0, 1) }); const l = await p.evaluate(() => shareLink(state.items[0])); await p.evaluate(() => { state.items = []; save(); }); await p.goto(H.APP.replace('index.html', 'cartao.html') + l.slice(l.indexOf('#'))); await p.waitForTimeout(400); }],
  ['definicoes', async p => { await H.openApp(p, { items: H.CARDS() }); await p.click('#btnSettings'); }],
  ['definicoes-fim', async p => { await H.openApp(p, { items: H.CARDS() }); await p.click('#btnSettings'); await p.locator('.sheet').evaluate(s => s.scrollTop = s.scrollHeight); }],
  ['varias-capturas', async p => { const f = [await H.barcodePng('ean13', '5901234123457', 'l1.png'), await H.barcodePng('qrcode', 'LIDLPLUS-PT-0001', 'l2.png'), await H.barcodePng('qrcode', 'nada', 'l3.png', { scale: 1 })]; await H.openApp(p); await p.click('#btnAdd'); await p.setInputFiles('#ePhoto', f); await p.waitForSelector('#bMsg:not(:has-text("A procurar"))', { timeout: 15000 }); }],
  ['camara', async p => { await H.fakeCamera(p); await H.openApp(p); await p.click('#btnAdd'); await p.click('#eLiveBtn'); await p.waitForSelector('#camFull'); }],
];

test('ecrãs sem sobreposições nem cortes', async ({ page }, info) => {
  test.setTimeout(240_000);
  const report = {};
  for (const [name, go] of SCREENS) {
    const ctx = await page.context().browser().newContext(info.project.use); const p = await ctx.newPage();
    try { await go(p); await p.waitForTimeout(500); report[name] = await H.layoutIssues(p); await H.shot(p, info.project.name, name);
      if (/^(inicio|bilhetes)/.test(name)) { await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(400); const fim = await H.layoutIssues(p, { fixedToo: true }); if (fim.length) report[name + '@fim-da-pagina'] = fim; }
    }
    catch (e) { report[name] = [{ type: 'erro-no-teste', what: e.message.split('\n')[0] }]; }
    await ctx.close();
  }
  fs.mkdirSync(path.join(__dirname, '..', 'results'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'results', `${process.env.SC_SHOTS ? 'antes-' : ''}layout-${info.project.name}.json`), JSON.stringify(report, null, 1));
  const bad = Object.entries(report).filter(([, v]) => v.length).map(([k, v]) => k + ': ' + v.map(x => `${x.type} ${x.what} (${x.detail || ''})`).join('; '));
  expect(bad, bad.join('\n')).toEqual([]);
});

test('acessibilidade (axe): sem problemas graves', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone-15');
  const out = {};
  const scan = async (name, go) => { const ctx = await page.context().browser().newContext(info.project.use); const p = await ctx.newPage(); await go(p); await p.waitForTimeout(500);
    const r = await new AxeBuilder({ page: p }).disableRules(['region']).analyze();
    out[name] = r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, eg: v.nodes.slice(0, 3).map(n => n.target.join(' ')) })); await ctx.close(); };
  await scan('tutorial', p => H.freshApp(p));
  await scan('inicio', p => H.openApp(p, { items: H.CARDS() }));
  await scan('novo-cartao', async p => { await H.openApp(p); await p.click('#btnAdd'); });
  await scan('cartao', async p => { await H.openApp(p, { items: H.CARDS() }); await p.click('.tile[data-id=c1]'); });
  await scan('definicoes', async p => { await H.openApp(p, { items: H.CARDS() }); await p.click('#btnSettings'); });
  fs.writeFileSync(path.join(__dirname, '..', 'results', 'axe.json'), JSON.stringify(out, null, 1));
  const serious = Object.entries(out).flatMap(([k, v]) => v.filter(x => ['serious', 'critical'].includes(x.impact)).map(x => `${k}: ${x.id} (${x.n}) ${x.help} — ${x.eg.join(', ')}`));
  expect(serious, serious.join('\n')).toEqual([]);
});
