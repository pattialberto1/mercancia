// El cierre diario del punto de venta («BALANCE DE CAJA») es otro reporte:
// a dos columnas, sin el código del producto y con el nombre cortado a 17
// letras. Se prueba con el del 1 de octubre de 2026, tal cual lo exportó.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');

// el PDF real; si no está a mano, se puede apuntar a otro cierre del mismo sistema
const PDF = '/root/.claude/uploads/9495015d-441f-5e68-af2d-9fb7c6c8f7c3/44b75c9f-cierre-1-10-2026.pdf';

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
  if (!fs.existsSync(PDF)) { console.log('Falta el PDF del cierre:', PDF); process.exit(0); }
  await new Promise(r => server.listen(8947, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.addInitScript(() => {
    localStorage.setItem('mercancia.pin', '7070');
    if (localStorage.getItem('mercancia.v1')) return;
    localStorage.setItem('mercancia.v1', JSON.stringify({
      v: 2, settings: { tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, syncToken: '', apiKey: '' },
      recepciones: [], facturas: [],
      inventarios: [{ id: 'ioct', semanaInicio: '2026-09-28', semanaFin: '2026-10-04',
                      creada: 1, mod: 1, cerrado: false, ventas: [], conteoDet: {}, inicialManual: {} }],
      borradas: {}
    }));
  });
  await page.goto('http://localhost:8947/');
  await page.waitForTimeout(400);

  // ---------- 1) lo lee, aunque sea otro reporte ----------
  const r = await page.evaluate(async (b64) => {
    const bin = atob(b64); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return await leerVentas(u.buffer);
  }, fs.readFileSync(PDF).toString('base64'));

  check('reconoce el cierre diario sin que haya que decírselo', r.renglones.length === 39, r.renglones.length);
  check('saca la fecha del día', r.desde === '2026-10-01' && r.hasta === '2026-10-01', r);

  const por = Object.fromEntries(r.renglones.map(x => [x.descripcion, x]));
  check('lee las cantidades', por['COMBO 3 POLLO'].cantidad === 94, por['COMBO 3 POLLO']);
  check('y no se le cuela la otra columna del balance',
    !r.renglones.some(x => /Bebidas|Efectivo|Tarjetas|TOTAL/i.test(x.descripcion)));

  // ---------- 2) el nombre cortado encuentra su producto ----------
  check('«REF. 1L FRESCOLIT» es la frescolita de 1L', por['REF. 1L FRESCOLIT'].codigo === '1537');
  check('«TENDER+REF./ YUKY» encuentra el suyo', por['TENDER+REF./ YUKY'].codigo === '1602');
  check('«COMBO 1 POLLO» no se confunde con «COMBO 1 CHINO POL»',
    por['COMBO 1 POLLO'].codigo === '1519' && por['COMBO 1 CHINO POL'].codigo === null);
  check('«TE LIPTON 500ML» se queda sin asignar: no dice el sabor',
    por['TE LIPTON 500ML'].codigo === null);
  check('«PICADILLO DE POLL» tampoco, que falta saber cuántas piezas son un kilo',
    por['PICADILLO DE POLL'].codigo === null);

  // ---------- 3) cargado en la semana ----------
  await page.click('#home-tabs button[data-t="inventario"]');
  await page.waitForTimeout(200);
  await page.click('#home-list button');
  await page.waitForTimeout(400);
  await page.setInputFiles('#inv-file', PDF);
  await page.waitForTimeout(1500);

  const f = id => page.evaluate(k => calcular(currentInv).find(x => x.clave === k), id);
  // 20×4 + 38×4 + 94×8 + 41×8 + 18×2 + 4×2 = 80+152+752+328+36+8
  const pollo = await f('pollo');
  check('los combos descuentan 1.356 piezas de pollo', pollo.vendido === 1356, pollo.vendido);
  // 38 + 41 del combo + 1+17+2+11+8 sueltos
  const r1 = await f('ref_1l');
  check('los refrescos de 1L: 79 del combo y 39 sueltos = 118', r1.vendido === 118, r1.vendido);
  const papas = await f('papas');
  // (20+38+94+41+18+4) ración de combo + 8 raciones sueltas = 223 × 0,35
  check('las papas: 223 raciones = 78,05 kg', Math.abs(papas.vendido - 78.05) < 0.01, papas.vendido);
  const postre = await f('postre_paolo');
  check('los postres: 2', postre.vendido === 2, postre.vendido);
  const malta = await f('malta');
  check('la malta: 5', malta.vendido === 5, malta.vendido);
  const agua = await f('agua_glacier');
  check('el «AGUA 600ML» es la Glacier: 3', agua.vendido === 3, agua.vendido);

  // ---------- 4) avisa de lo que falta ----------
  const msg = await page.textContent('#inv-msg');
  check('dice qué días de la semana faltan por cargar', /Faltan las ventas de/.test(msg), msg);
  check('y no se queja del rango, que es un cierre de un día', !/no cae/.test(msg));
  check('lista lo que no tiene equivalencia', /no tienen equivalencia/.test(msg), msg);

  // ---------- 5) cargarlo dos veces no lo cuenta dos veces ----------
  await page.setInputFiles('#inv-file', PDF);
  await page.waitForTimeout(1500);
  const pollo2 = await f('pollo');
  check('volver a cargar el mismo día lo reemplaza, no lo suma', pollo2.vendido === 1356, pollo2.vendido);
  check('y queda un solo reporte guardado',
    (await page.evaluate(() => currentInv.reportes.length)) === 1);

  console.log('\n=== RESULTADOS ===');
  for (const x of results) console.log((x.ok ? '✅' : '❌'), x.desc);
  console.log('\nerrores JS:', errores.length ? errores : 'ninguno');
  const fallos = results.filter(x => !x.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errores.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
