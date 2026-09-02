// El conteo se escribe como se cuenta en el negocio: 15 cestas, no 2.400 piezas;
// 57 bultos y 12 sueltas, no 696 refrescos. Se prueba con los números reales de
// la hoja de inventario de agosto.
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
function check(desc, cond) { results.push({ desc, ok: !!cond }); if (!cond) console.log('   (falló)', desc); }

(async () => {
  await new Promise(r => server.listen(8969, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));

  await page.goto('http://localhost:8969/');
  await page.fill('#pin-input', '7070');
  await page.click('#pin-btn');
  await page.waitForTimeout(250);

  // se controlan pollo y refrescos de 1L
  await page.evaluate(() => {
    db.settings.articulosActivos = ['pollo_pieza', 'ref_1l', 'cebollin', 'malta'];
    delete db.settings.porBulto.malta;   // como si todavía no lo supiéramos
    save(false);
  });
  await page.click('#home-tabs button[data-t="inventario"]');
  await page.click('#btn-new');
  await page.waitForTimeout(350);

  // ---------- 1) el pollo se cuenta en cestas ----------
  const etiquetas = await page.$$eval('#inv-comparacion .inv-par em', els => els.map(e => e.textContent));
  check('el pollo se pide en cestas, no en piezas', etiquetas.includes('cestas'));
  check('y deja anotar las sueltas aparte', etiquetas.includes('sueltas'));

  await page.fill('#inv-comparacion .inv-conteo[data-a="pollo_pieza"][data-k="b"]', '15');
  await page.dispatchEvent('#inv-comparacion .inv-conteo[data-a="pollo_pieza"][data-k="b"]', 'change');
  await page.waitForTimeout(250);

  check('15 cestas se convierten a 2.400 piezas',
    (await page.evaluate(() => currentInv.conteo.pollo_pieza)) === 2400);
  const texto = await page.textContent('#inv-comparacion');
  // es-ES no pone punto de millar hasta 5 cifras: 2400 va sin separador
  check('y se ve la cuenta hecha, no solo el resultado', texto.includes('15 cestas × 160 = 2400 piezas'));

  // ---------- 2) los tamaños de bulto que ya se saben vienen puestos ----------
  const pb = await page.evaluate(() => ({
    ref_1l: porBultoDe(articulo('ref_1l')), ref_2l: porBultoDe(articulo('ref_2l')),
    agua: porBultoDe(articulo('agua')), malta: porBultoDe(articulo('malta')),
    yuky: porBultoDe(articulo('yuky')), ref_15l: porBultoDe(articulo('ref_15l')),
    glacier: porBultoDe(articulo('agua_glacier'))
  }));
  check('los refrescos de 1L y 2L traen 6 por bulto', pb.ref_1l === 6 && pb.ref_2l === 6);
  check('el agua y el yuky-pack, 24', pb.agua === 24 && pb.yuky === 24);
  check('la malta, 36, de fábrica',
    (await page.evaluate(() => defaults.settings.porBulto.malta)) === 36);
  check('y si se borra, queda sin tamaño (para probar el aviso)', pb.malta === 0);
  check('el de 1,5L trae 12', pb.ref_15l === 12);
  check('el agua Glacier trae 24', pb.glacier === 24);

  await page.click('#inv-equivalencias');
  await page.waitForTimeout(300);
  const art = await page.textContent('#eq-articulos');
  check('lo que falta se dice, no se adivina', art.includes('falta decir cuántas unidades trae un bulto'));
  check('lo que va en kilos no pide tamaño de bulto', art.includes('se cuenta en kg'));
  check('el del pollo sale solo de las dos cestas', art.includes('cestas marinadas de 20 pollos (160 piezas)'));
  check('y los conocidos se ven', art.includes('1 bulto = 6 unidades'));

  await page.fill('.art-pb[data-a="ref_1l"]', '12');
  await page.dispatchEvent('.art-pb[data-a="ref_1l"]', 'change');
  await page.waitForTimeout(250);
  check('se puede corregir a mano', (await page.evaluate(() => db.settings.porBulto.ref_1l)) === 12);
  check('y se ve en la lista', (await page.textContent('#eq-articulos')).includes('1 bulto = 12 unidades'));

  await page.click('#eq-back');
  await page.waitForTimeout(300);
  await page.fill('#inv-comparacion .inv-conteo[data-a="ref_1l"][data-k="b"]', '57');
  await page.dispatchEvent('#inv-comparacion .inv-conteo[data-a="ref_1l"][data-k="b"]', 'change');
  await page.fill('#inv-comparacion .inv-conteo[data-a="ref_1l"][data-k="u"]', '12');
  await page.dispatchEvent('#inv-comparacion .inv-conteo[data-a="ref_1l"][data-k="u"]', 'change');
  await page.waitForTimeout(250);
  check('57 bultos + 12 sueltas = 696 refrescos',
    (await page.evaluate(() => currentInv.conteo.ref_1l)) === 696);
  check('la cuenta se muestra con las sueltas incluidas',
    (await page.textContent('#inv-comparacion')).includes('57 bultos × 12 + 12 = 696 unidades'));

  // ---------- 3) al volver, se ve lo que se escribió, no el total ----------
  await page.click('#inv-back');
  await page.waitForTimeout(200);
  await page.click('#home-list .entry, #home-list button');
  await page.waitForTimeout(350);
  check('al reabrir sigue diciendo 15 cestas',
    (await page.inputValue('#inv-comparacion .inv-conteo[data-a="pollo_pieza"][data-k="b"]')) === '15');
  check('y 57 bultos con 12 sueltas',
    (await page.inputValue('#inv-comparacion .inv-conteo[data-a="ref_1l"][data-k="b"]')) === '57' &&
    (await page.inputValue('#inv-comparacion .inv-conteo[data-a="ref_1l"][data-k="u"]')) === '12');

  // ---------- 4) borrar lo escrito quita el conteo ----------
  await page.fill('#inv-comparacion .inv-conteo[data-a="pollo_pieza"][data-k="b"]', '');
  await page.dispatchEvent('#inv-comparacion .inv-conteo[data-a="pollo_pieza"][data-k="b"]', 'change');
  await page.waitForTimeout(250);
  check('vaciar la casilla deja el artículo sin contar',
    (await page.evaluate(() => currentInv.conteo.pollo_pieza)) === undefined);
  check('y vuelve a pedir el conteo', (await page.textContent('#inv-comparacion')).includes('Escribe el conteo real'));

  // ---------- 5) lo escrito antes del cambio no se pierde ----------
  await page.evaluate(() => {
    currentInv.conteo = { pollo_pieza: 999 };
    delete currentInv.conteoDet;
    save(false); renderComparacion();
  });
  await page.waitForTimeout(250);
  check('un total viejo se sigue viendo tal cual',
    (await page.inputValue('#inv-comparacion .inv-conteo[data-a="pollo_pieza"][data-k="u"]')) === '999');
  check('y sigue valiendo lo mismo', (await page.evaluate(() => currentInv.conteo.pollo_pieza)) === 999);

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errors.length ? errors : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errors.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
