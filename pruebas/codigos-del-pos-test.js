// Lo que Alberto aclaró el 7/9 sobre los códigos del punto de venta: los que
// juntan varios renglones de la hoja (envases, Gatorade, jugos, Tenta té), los
// que descuentan de un renglón suelto (arepitas, postres, picadillo) y los que
// no descuentan nada a propósito (los delivery, Pringles).
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
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));

  await page.goto('http://localhost:8984/');
  await page.fill('#pin-input', '7070'); await page.click('#pin-btn');
  await page.waitForTimeout(250);

  // ---------- el bulto se pregunta por renglón, no por artículo ----------
  const pb = await page.evaluate(() => {
    const fila = id => catalogoFisico().flatMap(g => g.items).find(x => x.id === id);
    const g = id => { const it = fila(id); return porBultoFisico(it, articulo(it.art)); };
    return { ct1: g('ct1_envases'), ct2: g('ct2_envases'), ct3: g('ct3_envases'),
             art: fila('ct1_envases').art };
  });
  check('los tres envases van al mismo artículo', pb.art === 'envases', pb);
  check('pero cada uno conserva su bulto: 88, 105 y 90',
    pb.ct1 === 88 && pb.ct2 === 105 && pb.ct3 === 90, pb);

  // ---------- el conteo de la hoja se suma en el artículo ----------
  await page.evaluate(() => { db.settings.articulosActivos = ['envases', 'gatorade', 'lumpias']; save(false); });
  await page.click('#home-tabs button[data-t="inventario"]');
  await page.click('#btn-new');
  await page.waitForTimeout(400);
  // el físico va una semana ANTES del tramo, sea cual sea el día en que se corra
  await page.evaluate(() => {
    const fis = nuevoFisico(masDias(currentInv.semanaInicio, -7));
    fis.fisico = {
      ct1_envases: { b: '4', u: '' }, ct2_envases: { b: '9', u: '' }, ct3_envases: { b: '8', u: '' },
      gatorade_de_mandarina: { b: '2', u: '10' }, gatorade_de_tropical: { b: '1', u: '' }
    };
    fis.cerrado = true; save(false); renderInv();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    currentInv.ventas = [
      { codigo: '1583', descripcion: 'ENVASES', cantidad: 14 },
      { codigo: '1574', descripcion: 'GATORADE 0,50 LTS', cantidad: 9 },
      { codigo: '1598', descripcion: 'LUMPIAS', cantidad: 74 },
      { codigo: '1612', descripcion: '1 LUMPIA', cantidad: 2 },
      { codigo: '1514', descripcion: 'AREPITAS FRITAS', cantidad: 7 },
      { codigo: '1572', descripcion: 'PICADILLO DE POLLO', cantidad: 133 },
      { codigo: '1585', descripcion: 'POSTRE EXTRA', cantidad: 19 },
      { codigo: '1528', descripcion: 'MARQUESA DE CHOCOLATE', cantidad: 3 },
      { codigo: '1584', descripcion: '4 SALSAS', cantidad: 2 },
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
  check('4×88 + 9×105 + 8×90 = 2.017 envases de inicial', f.envases.ini === 2017, f.envases);
  check('los dos sabores de Gatorade se juntan: 46', f.gatorade.ini === 46, f.gatorade);

  // ---------- lo que descuenta cada código ----------
  check('un envase por venta suelta', f.envases.ven === 14, f.envases);
  check('un Gatorade por venta, sin mirar el sabor', f.gatorade.ven === 9, f.gatorade);
  check('la ración de lumpias son 2, la suelta 1: 74×2 + 2 = 150',
    f.lumpias.ven === 150, f.lumpias);
  check('la ración de arepitas son 10: 7×10 = 70', f.f_arepitas_fritas.ven === 70, f.f_arepitas_fritas);
  check('el picadillo va por kilo: 133', f.f_picadillo_de_pollo.ven === 133, f.f_picadillo_de_pollo);
  check('«postre extra» son los Paolo', f.f_postres_paolo.ven === 19, f.f_postres_paolo);
  check('y la marquesa es donde se cobran los tres leches',
    f.f_postres_tres_leches.ven === 3, f.f_postres_tres_leches);
  check('«4 salsas» son 4 sobres Chef Quality: 2×4 = 8',
    f.f_salsa_ketchup_chef_quality_sobre.ven === 8, f.f_salsa_ketchup_chef_quality_sobre);

  // un renglón de la hoja con receta deja de ser «solo conteo»: si no, su
  // consumo se perdía sin que nada lo dijera
  check('un renglón de la hoja con receta entra en la fórmula',
    (await page.evaluate(() => articulosConFormula().some(a => a.id === 'f_picadillo_de_pollo'))));

  // ---------- lo que no descuenta nada, y se dice ----------
  const sin = await page.evaluate(() => codigosSinAsignar(currentInv).map(v => v.codigo));
  check('los delivery ya no salen como pendientes', !sin.includes('1564'), sin);
  check('ni las Pringles', !sin.includes('1588'), sin);
  check('y no se llevan nada de ningún artículo',
    Object.values(f).every(x => x.ven !== 196 && x.ven !== 1), Object.entries(f).filter(([,x])=>x.ven===196));
  await page.click('#inv-equivalencias');
  await page.waitForTimeout(300);
  const eqTxt = await page.textContent('#eq-list');
  check('la pantalla lo explica en vez de decir «sin asignar»',
    /no descuenta nada · es el cobro del envío/.test(eqTxt));

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errors.length ? errors : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errors.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
