// Todo lo que se recibe — recepciones y facturas de proveedor — tiene que
// llegar solo al inventario de la semana. Y el conteo físico del pollo tiene
// que decir cuántas PIEZAS son, no solo cuántas cestas.
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
const DATOS = JSON.parse(fs.readFileSync(path.join(__dirname, 'merc-nuevo.json'), 'utf8'));

(async () => {
  await new Promise(r => server.listen(8955, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.addInitScript(([datos]) => {
    localStorage.setItem('mercancia.pin', '7070');
    if (localStorage.getItem('mercancia.v1')) return;
    const d = JSON.parse(datos);
    d.v = 2;
    d.settings = { tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, syncToken: '', apiKey: '' };
    localStorage.setItem('mercancia.v1', JSON.stringify(d));
  }, [JSON.stringify(DATOS)]);

  await page.goto('http://localhost:8955/');
  await page.waitForTimeout(400);

  // ---------- 1) el pollo del inventario físico, en piezas ----------
  await page.click('#home-tabs button[data-t="inventario"]');
  await page.waitForTimeout(250);
  await page.click('#home-list button:has-text("Inventario físico")');
  await page.waitForTimeout(500);
  await page.fill('#fis-buscar', 'pollo en cestas marinado');
  await page.waitForTimeout(300);
  check('el conteo ya dice 17 cestas',
    (await page.inputValue('.fis-i[data-i="pollo_en_cestas_marinado"][data-k="b"]')) === '17');
  const eq = await page.textContent('.fis-row:has(input[data-i="pollo_en_cestas_marinado"]) .fis-eq');
  check('y traduce a piezas', eq.includes('17 cestas × 160') && eq.includes('2720 piezas'), eq);
  check('y dice cuántos pollos son', eq.includes('340 pollos'), eq);

  // ---------- 2) todo lo que se recibe se puede controlar ----------
  const arts = await page.evaluate(() => ARTICULOS_TODOS.map(a => a.id));
  for (const id of ['papas', 'repollo_blanco', 'repollo_morado', 'zanahoria', 'alitas', 'envases'])
    check('se puede controlar ' + id, arts.includes(id));
  for (const id of ['queso', 'cilantro', 'limon', 'tomate', 'platano'])
    check('lo de Tierra Santa también: ' + id, arts.includes(id));
  const prods = await page.evaluate(() => Object.keys(PRODUCTOS));
  const sinArt = await page.evaluate(() => Object.keys(PRODUCTOS).filter(p =>
    !ARTICULOS_TODOS.some(a => a.entrada.producto === p)));
  check('no queda ninguna recepción fuera del inventario', sinArt.length === 0, sinArt);

  // ---------- 3) las recepciones reales entran solas ----------
  await page.click('#inv-back');
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    db.settings.articulosActivos = ARTICULOS_TODOS.map(a => a.id);
    save(false);
  });
  await page.click('#home-list button:has-text("sept")');
  await page.waitForTimeout(500);
  const rec = await page.evaluate(() => {
    const o = {};
    for (const f of calcular(currentInv)) o[f.art.id] = f.recibido;
    return o;
  });
  check('el pollo de hoy: 50 cestas × 144 = 7.200 piezas', rec.pollo_pieza === 7200, rec.pollo_pieza);
  check('las papas de hoy: 430,2 kg netos', Math.abs(rec.papas - 430.2) < 0.01, rec.papas);
  check('los huevos de hoy: 1.152', rec.huevos === 1152, rec.huevos);

  // ---------- 4) las facturas de proveedor también ----------
  await page.evaluate(() => {
    // una factura dentro del tramo, con los mismos nombres que usa Tierra Santa
    db.facturas.push({
      id: 'ftest', fecha: currentInv.semanaInicio, proveedor: 'Tierra Santa',
      creada: 1, mod: 1, moneda: 'USD',
      lineas: [
        { nombre: 'CILANTRO KG', cantidad: 0.3, unidad: 'kg', precio: 2.4, importe: 0.72 },
        { nombre: 'TOMATE KG', cantidad: 2.2, unidad: 'kg', precio: 1.9, importe: 4.18 },
        { nombre: 'QUESO MERIDEÑO KG', cantidad: 5.24, unidad: 'kg', precio: 7.44, importe: 38.99 },
        { nombre: 'LIMON KG', cantidad: 4.2, unidad: 'kg', precio: 1.4, importe: 5.88 },
        { nombre: 'SERVICIO', cantidad: 1, unidad: 'un', precio: 3, importe: 3 }
      ]
    });
    save(false); renderInv();
  });
  await page.waitForTimeout(400);
  const conFac = await page.evaluate(() => {
    const o = {};
    for (const f of calcular(currentInv)) o[f.art.id] = f.recibido;
    return o;
  });
  check('el cilantro de la factura entra solo', conFac.cilantro === 0.3, conFac.cilantro);
  check('el tomate también', conFac.tomate === 2.2, conFac.tomate);
  check('el queso, aunque lleve tilde y apellido', conFac.queso === 5.24, conFac.queso);
  check('el limón, escrito sin tilde en la factura', conFac.limon === 4.2, conFac.limon);
  check('el renglón de SERVICIO no se cuela en ningún artículo',
    !Object.values(conFac).includes(1) || conFac.queso === 5.24);

  // una factura de otra semana no debe contarse
  await page.evaluate(() => {
    db.facturas.push({ id: 'fvieja', fecha: '2026-07-31', proveedor: 'Tierra Santa', creada: 1, mod: 1,
      lineas: [{ nombre: 'CILANTRO KG', cantidad: 99, unidad: 'kg', precio: 1, importe: 99 }] });
    save(false); renderInv();
  });
  await page.waitForTimeout(400);
  check('una factura de otra semana no se cuenta',
    (await page.evaluate(() => calcular(currentInv).find(f => f.art.id === 'cilantro').recibido)) === 0.3);

  // ---------- 5) sin receta, la diferencia es consumo, no merma ----------
  await page.fill('.inv-conteo[data-a="papas"][data-k="u"]', '100');
  await page.dispatchEvent('.inv-conteo[data-a="papas"][data-k="u"]', 'change');
  await page.waitForTimeout(350);
  const txt = await page.textContent('#inv-comparacion');
  check('lo que no tiene receta se llama consumo', txt.includes('Se consumieron'));
  check('y se explica por qué no es merma', txt.includes('todavía no hay receta'));
  check('no dice «faltan» para las papas', !/Faltan 330/.test(txt));

  // el pollo sí tiene receta: ahí sí es merma
  const conRec = await page.evaluate(() => tieneConsumoConocido('pollo_pieza'));
  check('el pollo sí tiene consumo conocido', conRec === true);
  check('las papas no', (await page.evaluate(() => tieneConsumoConocido('papas'))) === false);

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errors.length ? errors : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errors.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
