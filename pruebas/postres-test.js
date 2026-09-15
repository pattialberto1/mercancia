// Postres redondos y cuadrados en la pestaña de Insumos. Se cuentan de uno en
// uno, no se pesan, y son dos productos distintos: si se mezclaran no habría
// forma de saber cuál se acabó.
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
  await new Promise(r => server.listen(8974, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.addInitScript(() => localStorage.setItem('mercancia.pin', '7070'));
  await page.goto('http://localhost:8974/');
  await page.waitForTimeout(400);

  // ---------- 1) están en Insumos ----------
  await page.click('#home-tabs button[data-t="insumos"]');
  await page.waitForTimeout(300);
  const tipos = await page.evaluate(() => TABS.insumos.tipos);
  check('los postres redondos están en Insumos', tipos.includes('postre_redondo'), tipos);
  check('y los cuadrados también', tipos.includes('postre_cuadrado'), tipos);
  check('sin sacar de ahí lo que ya estaba',
    ['pechuga', 'camaron', 'arroz', 'magia', 'azucar'].every(t => tipos.includes(t)), tipos);

  // ---------- 2) se cuentan, no se pesan ----------
  const como = await page.evaluate(() => ({
    redU: esUnidadTipo('postre_redondo'), redB: esBolsaTipo('postre_redondo'),
    cuaU: esUnidadTipo('postre_cuadrado'), cuaB: esBolsaTipo('postre_cuadrado'),
    nomRed: PRODUCTOS.postre_redondo.nombre, nomCua: PRODUCTOS.postre_cuadrado.nombre
  }));
  check('el redondo se cuenta en unidades', como.redU && !como.redB, como);
  check('el cuadrado también', como.cuaU && !como.cuaB, como);
  check('se llaman como los llama Alberto',
    como.nomRed === 'Postres redondos' && como.nomCua === 'Postres cuadrados', como);

  // ---------- 3) se puede recibir, y cada uno va por su lado ----------
  // la pestaña agrupa varios productos: pregunta cuál llega
  await page.click('#btn-new');
  await page.waitForTimeout(300);
  const opciones = await page.$$eval('#producto-btns button', bs => bs.map(b => b.textContent));
  check('al recibir, pregunta cuál de los insumos llega',
    opciones.some(o => o.includes('Postres redondos')) &&
    opciones.some(o => o.includes('Postres cuadrados')), opciones);
  await page.click('#producto-btns button:has-text("Postres redondos")');
  await page.waitForTimeout(400);
  check('se abre una recepción de postres redondos',
    (await page.textContent('#rec-title')).includes('Postres redondos'),
    await page.textContent('#rec-title'));
  check('y pide unidades, no kilos',
    !/kg/i.test(await page.getAttribute('#weight-input', 'placeholder')),
    await page.getAttribute('#weight-input', 'placeholder'));
  await page.fill('#weight-input', '24');
  await page.click('#btn-add');
  await page.waitForTimeout(300);
  await page.fill('#weight-input', '6');
  await page.click('#btn-add');
  await page.waitForTimeout(350);
  check('se anotan 30 postres redondos',
    (await page.evaluate(() => totals(current).neto)) === 30);
  check('y se dice en unidades, no en kilos',
    /30 unidades/.test(await page.textContent('#t-neto')), await page.textContent('#t-neto'));

  // ahora los cuadrados: tienen que quedar en otra recepción, no sumarse ahí
  await page.click('#btn-back');
  await page.waitForTimeout(300);
  await page.click('#btn-new');
  await page.waitForTimeout(300);
  await page.click('#producto-btns button:has-text("Postres cuadrados")');
  await page.waitForTimeout(400);
  await page.fill('#weight-input', '12');
  await page.click('#btn-add');
  await page.waitForTimeout(350);
  const separados = await page.evaluate(() => ({
    redondo: db.recepciones.filter(x => x.tipo === 'postre_redondo').reduce((s, x) => s + totals(x).neto, 0),
    cuadrado: db.recepciones.filter(x => x.tipo === 'postre_cuadrado').reduce((s, x) => s + totals(x).neto, 0)
  }));
  check('los redondos siguen siendo 30', separados.redondo === 30, separados);
  check('y los cuadrados van aparte: 12', separados.cuadrado === 12, separados);

  // ---------- 4) no se quedan fuera del inventario ----------
  const arts = await page.evaluate(() => ARTICULOS_TODOS.map(a => a.id));
  check('cada uno tiene su artículo', arts.includes('postre_redondo') && arts.includes('postre_cuadrado'), arts);
  const sinArt = await page.evaluate(() => Object.keys(PRODUCTOS).filter(p =>
    !ARTICULOS_TODOS.some(a => a.entrada && a.entrada.producto === p)));
  check('no queda ninguna recepción sin artículo', sinArt.length === 0, sinArt);

  /* ---------- 5) pero no entran en el control semanal ----------
     El inventario de la semana son bebidas, pollo, papas y lumpias. Meterlos
     ahí sin que nadie lo pida haría que salieran sin contar cada semana. */
  const enTramo = await page.evaluate(() => articulosDelTramo().map(a => a.id));
  check('no se cuelan en el inventario semanal',
    !enTramo.includes('postre_redondo') && !enTramo.includes('postre_cuadrado'), enTramo);

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errors.length ? errors : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errors.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
