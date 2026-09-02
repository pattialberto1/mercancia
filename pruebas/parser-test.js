// El parser corre en el navegador (DecompressionStream), así que se prueba
// ahí mismo, contra el PDF real que mandó Alberto.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const PDF = '/root/.claude/uploads/9495015d-441f-5e68-af2d-9fb7c6c8f7c3/e28e80ae-LSTPROVE.PDF';

const results = [];
function check(desc, cond) { results.push({ desc, ok: !!cond }); if (!cond) console.log('   (falló)', desc); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  await page.goto('about:blank');
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'parser.js'), 'utf8') });

  check('el navegador puede descomprimir sin librerías', await page.evaluate(() => typeof DecompressionStream === 'function'));

  const b64 = fs.readFileSync(PDF).toString('base64');
  const out = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    try { return { ok: true, r: await leerReporteVentas(bytes.buffer) }; }
    catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  }, b64);

  check('el PDF real se lee sin error', out.ok);
  if (!out.ok) { console.log('ERROR:', out.err); process.exit(1); }
  const r = out.r;

  check('detecta solo la semana, sin escribirla a mano', r.desde === '2026-08-16' && r.hasta === '2026-08-21');
  check('saca los 55 renglones de producto', r.renglones.length === 55);

  const porCod = Object.fromEntries(r.renglones.map(x => [x.codigo, x]));
  check('COMBO 3 POLLO: 730 unidades', porCod['1523'] && porCod['1523'].cantidad === 730);
  check('COMBO 2 POLLO: 362 unidades', porCod['1521'] && porCod['1521'].cantidad === 362);
  check('COMBO 4 POLLO: 385 unidades', porCod['1524'] && porCod['1524'].cantidad === 385);
  check('COMBO 1 POLLO: 160 unidades', porCod['1519'] && porCod['1519'].cantidad === 160);
  check('COMBO DUO: 117 unidades', porCod['1611'] && porCod['1611'].cantidad === 117);
  check('lee bien las descripciones', porCod['1523'].descripcion === 'COMBO 3 POLLO');
  // El POS guarda los nombres sin tildes ("REF. 1L PINA"); donde sí las hay es
  // en las cabeceras del reporte, y ahí se comprueba que el decodificador de
  // escapes octales (\363 = ó) funciona.
  const cabeceras = await page.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pags = await textoDelPDF(bytes.buffer);
    return celdasDePagina(pags[0]).map(c => c.t);
  }, b64);
  check('decodifica las tildes del PDF (Código, Descripción)',
    cabeceras.includes('Código') && cabeceras.includes('Descripción'));
  check('los nombres del POS se copian tal cual, sin inventar tildes',
    porCod['1605'].descripcion === 'REF. 1L PINA');

  // los miles con coma son la trampa clásica de este reporte
  check('ARROZ CHINO P&C: 173 vendidos', porCod['1517'].cantidad === 173);
  check('y su total de $1.043,19 se lee entero', Math.abs(porCod['1517'].total - 1043.19) < 0.01);
  check('COMBO 3: total $8.811,10 (miles con coma)', Math.abs(porCod['1523'].total - 8811.10) < 0.01);
  check('lee el precio unitario', Math.abs(porCod['1523'].precio - 12.07) < 0.01);

  // productos de las dos páginas
  check('toma renglones de la página 1', !!porCod['1612']);
  check('toma renglones de la página 2', !!porCod['1554']);
  check('no se cuela ninguna cabecera como producto',
    !r.renglones.some(x => /Código|Descripción|Cantidad|Total Vendido/i.test(x.descripcion)));
  check('ningún renglón queda sin cantidad', r.renglones.every(x => x.cantidad > 0));

  // el cálculo que va a alimentar el inventario
  const piezas = { '1519': 4, '1521': 4, '1523': 8, '1524': 8, '1611': 2, '1610': 2 };
  const totalPiezas = r.renglones.reduce((s, x) => s + (piezas[x.codigo] || 0) * x.cantidad, 0);
  check('las piezas de pollo dan 11.272 (calculado a mano)', totalPiezas === 11272);
  const refrescos = (porCod['1521'].cantidad + porCod['1524'].cantidad);
  check('los combos consumen 747 refrescos de 1L', refrescos === 747);

  console.log('\n=== RESULTADOS ===');
  for (const x of results) console.log((x.ok ? '✅' : '❌'), x.desc);
  const fallos = results.filter(x => !x.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close();
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
