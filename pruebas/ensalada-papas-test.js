// Lo que Alberto contó el 7/9: la tanda de ensalada rallada (21 kg de verduras
// y la mayonesa, racionada en potes de 170 g) y la ración de papas de los
// combos de pollo. Y una trampa que se llevaba el azúcar por delante: el azúcar
// no está vinculada a ningún renglón de la hoja (hay cinco marcas), así que si
// el tramo solo trae lo activo y lo vinculado, su consumo desaparecía sin que
// nadie avisara.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  fs.readFile(path.join('/home/user/mercancia', p), (e, d) => {
    if (e) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : 'text/html' }); res.end(d);
  });
});
const results = [];
function check(desc, cond, extra) { results.push({ desc, ok: !!cond }); if (!cond) console.log('   (falló)', desc, extra ?? ''); }
const cerca = (a, b) => Math.abs(a - b) < 0.005;

(async () => {
  await new Promise(r => server.listen(8981, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));

  await page.goto('http://localhost:8981/');
  await page.fill('#pin-input', '7070'); await page.click('#pin-btn');
  await page.waitForTimeout(250);

  // ---------- la tanda ----------
  const tanda = await page.evaluate(() => ({ potes: POTES_POR_TANDA, racion: RACION_PAPAS }));
  check('de una tanda salen 172 potes', tanda.potes === 172, tanda.potes);
  check('la ración de papas son 350 g', cerca(tanda.racion, 0.35), tanda.racion);

  const uno = await page.evaluate(() => potesEnsalada(1));
  check('un pote lleva 16 kg de repollo blanco entre 172', cerca(uno.repollo_blanco, 16 / 172), uno.repollo_blanco);
  check('y 2,5 de zanahoria entre 172', cerca(uno.zanahoria, 2.5 / 172), uno.zanahoria);
  check('y 2,5 de repollo morado', cerca(uno.repollo_morado, 2.5 / 172), uno.repollo_morado);
  check('los huevos de la mayonesa son 45 por tanda', cerca(uno.huevos, 45 / 172), uno.huevos);
  check('el azúcar, 3 kg por tanda', cerca(uno.azucar, 3 / 172), uno.azucar);
  // 40 g de limón entre 172 potes es 0,000233 kg: a tres decimales se redondeaba
  // a cero y el limón desaparecía de la receta
  check('el limón no se redondea a cero', uno.limon > 0, uno.limon);
  check('sal, vinagre, mostaza y aceite quedan fuera a propósito',
    !('sal' in uno) && !('vinagre' in uno) && !('mostaza' in uno) && !('aceite' in uno),
    Object.keys(uno));

  // ---------- qué combos llevan ensalada y papas ----------
  const eq = await page.evaluate(() => {
    const e = equivalencias(); const o = {};
    for (const c of ['1519', '1521', '1523', '1524', '1611', '1610', '1527', '1531', '1512'])
      o[c] = e[c] ? e[c].consume : null;
    return o;
  });
  check('el combo 2 lleva 1 ensalada', cerca(eq['1521'].repollo_blanco, 16 / 172), eq['1521']);
  check('el combo 4 lleva 2', cerca(eq['1524'].repollo_blanco, 2 * 16 / 172), eq['1524']);
  check('el combo 1 no lleva ensalada', !eq['1519'].repollo_blanco);
  check('el combo 3 tampoco', !eq['1523'].repollo_blanco);
  for (const c of ['1519', '1521', '1523', '1524', '1611', '1610', '1531'])
    check('lleva papas el ' + c, cerca(eq[c].papas, 0.35), eq[c]);
  check('el pote de chino no lleva papas', !eq['1512'] || !eq['1512'].papas, eq['1512']);

  // ---------- y todo eso llega al tramo ----------
  await page.evaluate(() => { db.settings.articulosActivos = ['pollo_pieza']; save(false); });
  await page.click('#home-tabs button[data-t="inventario"]');
  await page.click('#btn-new');
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    currentInv.ventas = [{ codigo: '1527', descripcion: 'ENSALADA RALLADA', cantidad: 172 }];
    touch(currentInv); save(false); renderInv();
  });
  await page.waitForTimeout(300);
  const ven = await page.evaluate(() => {
    const o = {}; for (const f of calcular(currentInv)) o[f.art.id] = f.vendido; return o;
  });
  check('172 potes se comen la tanda entera de repollo', cerca(ven.repollo_blanco, 16), ven.repollo_blanco);
  check('y los 45 huevos de la mayonesa', cerca(ven.huevos, 45), ven.huevos);
  check('el azúcar sale en el tramo aunque no esté activa ni vinculada',
    ven.azucar !== undefined, Object.keys(ven).filter(k => /azuc/.test(k)));
  check('y se le cuentan los 3 kg de la tanda', cerca(ven.azucar, 3), ven.azucar);
  check('el limón también', cerca(ven.limon, 0.04), ven.limon);

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errors.length ? errors : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errors.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
