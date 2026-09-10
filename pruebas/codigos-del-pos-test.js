// Lo que descuenta cada código del punto de venta. El inventario se estrechó el
// 10/9 a bebidas, pollo, papas y lumpias, así que de los que siguen dentro se
// comprueba el camino entero —del código al tramo— y de los que salieron, que
// su receta siga guardada y correcta para cuando vuelvan.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  fs.readFile(path.join('/home/user/mercancia', p), (e, d) => {
    if (e) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(d);
  });
});
const results = [];
function check(desc, cond, extra) { results.push({ desc, ok: !!cond }); if (!cond) console.log('   (falló)', desc, extra ?? ''); }

(async () => {
  await new Promise(r => server.listen(8984, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.addInitScript(() => localStorage.setItem('mercancia.pin', '7070'));
  await page.goto('http://localhost:8984/');
  await page.waitForTimeout(400);

  // ---------- las bebidas que el POS no separa por sabor van juntas ----------
  const pool = await page.evaluate(() => {
    const filas = catalogoFisico().flatMap(g => g.items);
    const de = re => filas.filter(i => re.test(i.nombre)).map(i => i.art);
    return {
      gatorade: [...new Set(de(/^Gatorade/))],
      jugos: [...new Set(de(/Barinas/))],
      tenta: [...new Set(de(/^Tenta té/))],
      ref1l: [...new Set(de(/^Refresco .* 1L$/))]
    };
  });
  check('los dos Gatorade van al mismo artículo', pool.gatorade.join() === 'gatorade', pool.gatorade);
  check('los tres jugos Barinas también', pool.jugos.join() === 'jugo_barinas', pool.jugos);
  check('los cuatro Tenta té también', pool.tenta.join() === 'tenta_te', pool.tenta);
  check('y los nueve sabores de refresco de 1L', pool.ref1l.join() === 'ref_1l', pool.ref1l);

  // ---------- el conteo de la hoja se suma en el artículo ----------
  await page.click('#home-tabs button[data-t="inventario"]');
  await page.click('#btn-new');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const fis = nuevoFisico(masDias(currentInv.semanaInicio, -7));
    fis.fisico = {
      gatorade_de_mandarina: { b: '2', u: '10' }, gatorade_de_tropical: { b: '1', u: '' },
      jugo_naranja_400ml_barinas: { b: '', u: '5' }, jugo_pera_400ml_barinas: { b: '', u: '8' },
      lumpias: { b: '', u: '100' }
    };
    fis.cerrado = true; save(false); renderInv();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    currentInv.ventas = [
      { codigo: '1598', descripcion: 'LUMPIAS', cantidad: 20 },     // ración de 2
      { codigo: '1612', descripcion: '1 LUMPIA', cantidad: 5 },     // suelta
      { codigo: '1574', descripcion: 'GATORADE 0,50 LTS', cantidad: 9 },
      { codigo: '1603', descripcion: 'JUGO BARINAS 400ML', cantidad: 4 },
      { codigo: '1531', descripcion: 'PAPAS FRITAS', cantidad: 10 },
      { codigo: '1564', descripcion: 'DELIVERY 3', cantidad: 196 },
      { codigo: '1588', descripcion: 'PRINGLES', cantidad: 1 }
    ];
    touch(currentInv); save(false); renderInv();
  });
  await page.waitForTimeout(400);
  const f = await page.evaluate(() => {
    const o = {};
    for (const x of calcular(currentInv)) o[x.art.id] = { ini: x.inicial, ven: x.vendido };
    return o;
  });
  check('los dos sabores de Gatorade se juntan en el inicial: 2×12 + 10 + 12 = 46',
    f.gatorade.ini === 46, f.gatorade);
  check('y los jugos Barinas: 5 + 8 = 13', f.jugo_barinas.ini === 13, f.jugo_barinas);
  check('la ración de lumpias son 2, la suelta 1: 20×2 + 5 = 45', f.lumpias.ven === 45, f.lumpias);
  check('un Gatorade por venta, sin mirar el sabor', f.gatorade.ven === 9, f.gatorade);
  check('un jugo por venta', f.jugo_barinas.ven === 4, f.jugo_barinas);
  check('la ración de papas son 350 g: 10 × 0,35 = 3,5', f.papas.ven === 3.5, f.papas);

  // ---------- lo que no descuenta nada, y se dice ----------
  const sin = await page.evaluate(() => codigosSinAsignar(currentInv).map(v => v.codigo));
  check('los delivery ya no salen como pendientes', !sin.includes('1564'), sin);
  check('ni las Pringles', !sin.includes('1588'), sin);
  check('y no se llevan nada de ningún producto',
    Object.values(f).every(x => x.ven !== 196), Object.entries(f).filter(([, x]) => x.ven === 196));
  await page.click('#inv-equivalencias');
  await page.waitForTimeout(300);
  const eqTxt = await page.textContent('#eq-list');
  check('la pantalla lo explica en vez de decir «sin asignar»',
    /no descuenta nada · es el cobro del envío/.test(eqTxt));

  /* ---------- las recetas de lo que salió del control siguen guardadas ----------
     El picadillo, las arepitas, los postres y las salsas ya no se llevan, pero
     lo que costó averiguar no se tira: la receta sigue ahí y la pantalla dice
     que ese producto ya no se lleva, en vez de enseñar un id en crudo. */
  const guardadas = await page.evaluate(() => {
    const eq = equivalencias();
    const c = cod => Object.entries(eq[cod].consume)[0];
    return { picadillo: c('1572'), arepitas: c('1514'), postre: c('1585'), salsas: c('1584') };
  });
  check('el picadillo sigue a 1 kg por venta', guardadas.picadillo[1] === 1, guardadas.picadillo);
  check('la ración de arepitas sigue en 10', guardadas.arepitas[1] === 10, guardadas.arepitas);
  check('el postre extra sigue apuntando a los Paolo', guardadas.postre[1] === 1, guardadas.postre);
  check('«4 salsas» siguen siendo 4 sobres', guardadas.salsas[1] === 4, guardadas.salsas);
  check('y en pantalla se dice que ya no se llevan',
    /ya no se lleva en el inventario/.test(eqTxt), eqTxt.slice(0, 300));

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errors.length ? errors : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errors.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
