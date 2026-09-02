// El inventario físico: la hoja completa del local, tal cual se llena a mano.
// Se prueba con el archivo que se va a subir de verdad.
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
  await new Promise(r => server.listen(8958, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.addInitScript(([datos]) => {
    localStorage.setItem('mercancia.pin', '7070');
    // solo la primera vez: si no, al recargar se pisaría lo que se escribió
    if (localStorage.getItem('mercancia.v1')) return;
    const d = JSON.parse(datos);
    d.v = 2;
    d.settings = { tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, syncToken: '', apiKey: '' };
    localStorage.setItem('mercancia.v1', JSON.stringify(d));
  }, [JSON.stringify(DATOS)]);

  await page.goto('http://localhost:8958/');
  await page.waitForTimeout(400);
  await page.click('#home-tabs button[data-t="inventario"]');
  await page.waitForTimeout(250);

  // ---------- 1) se distingue de las semanas ----------
  const home = await page.textContent('#home-list');
  check('en el inicio se ve el inventario físico', home.includes('Inventario físico'));
  check('dice cuántos productos se contaron', home.includes('173 productos contados'));
  check('y la semana de control sigue apareciendo aparte', home.includes('sept'));
  check('hay un botón para crear uno nuevo', await page.isVisible('#btn-fisico'));

  // ---------- 2) la pantalla es la hoja, no la fórmula ----------
  await page.click('#home-list button:has-text("Inventario físico")');
  await page.waitForTimeout(500);
  check('abre el inventario físico', (await page.textContent('#inv-title')) === 'Inventario físico');
  check('no pide reporte de ventas', await page.isHidden('#inv-reporte-card'));
  check('no muestra la comparación con merma', await page.isHidden('#inv-comparacion-card'));
  check('no ofrece equivalencias', await page.isHidden('#inv-equivalencias'));
  check('muestra el conteo', await page.isVisible('#inv-fisico-card'));
  check('dice cuántos van de cuántos', (await page.textContent('#fis-resumen')).includes('173 de 242'));

  // ---------- 3) las categorías de la hoja ----------
  const cats = await page.$$eval('.fis-cat', els => els.map(e => e.textContent));
  check('están las 10 categorías de la hoja', cats.length === 10, cats.length);
  check('en el mismo orden que el papel',
    cats[0] === 'Alimentos procesados y otros' && cats[2] === 'Bebidas' && cats[9] === 'Otros', cats);

  // ---------- 4) los valores reales de la hoja ----------
  const val = async (id, k) => page.inputValue('.fis-i[data-i="' + id + '"][data-k="' + k + '"]');
  check('Aceite Vatel Pro: 38 bultos', (await val('aceite_vatel_pro', 'b')) === '38');
  check('Pollo en cestas marinado: 17 cestas', (await val('pollo_en_cestas_marinado', 'b')) === '17');
  check('Coca-Cola 1L: 57 bultos', (await val('refresco_coca_cola_1l', 'b')) === '57');
  check('Malta: 2 bultos y 31 sueltas',
    (await val('malta_botella', 'b')) === '2' && (await val('malta_botella', 'u')) === '31');
  check('Repollo blanco: 145,7 kg', (await val('repollo_blanco', 'u')) === '145,7');
  check('la observación se conserva',
    (await page.inputValue('.fis-obs[data-i="papas_cestas"]')) === '21,51 × 18 cestas');
  check('las dos columnas NO se suman entre sí',
    (await val('harina_pan', 'b')) === '1' && (await val('harina_pan', 'u')) === '3');
  check('lo que no se contó queda vacío',
    (await val('aguacate', 'b')) === '' && (await val('aguacate', 'u')) === '');
  check('la unidad de cada renglón se ve',
    (await page.textContent('.fis-row:has(input[data-i="repollo_blanco"]) label:last-child em')) === 'kg');

  // ---------- 5) cerrado: no se puede tocar ----------
  check('estando cerrado, los campos se bloquean',
    await page.isDisabled('.fis-i[data-i="aceite_vatel_pro"][data-k="b"]'));
  check('y lo dice', (await page.textContent('#inv-msg')).includes('cerrado'));

  // ---------- 6) el buscador ----------
  await page.fill('#fis-buscar', 'pollo');
  await page.waitForTimeout(250);
  const filas = await page.$$eval('.fis-row .fis-nom', els => els.map(e => e.textContent));
  check('el buscador filtra', filas.length > 0 && filas.length < 20, filas.length);
  check('encuentra sin importar acentos ni mayúsculas', filas.some(f => f.includes('Pollo en cestas marinado')));
  await page.fill('#fis-buscar', 'cebollin');
  await page.waitForTimeout(250);
  const f2 = await page.$$eval('.fis-row .fis-nom', els => els.map(e => e.textContent));
  check('busca sin acentos', f2.some(f => f.includes('Cebollín picado')));
  await page.fill('#fis-buscar', '');
  await page.waitForTimeout(250);

  // ---------- 7) el mensaje de WhatsApp ----------
  await page.evaluate(() => { window.__wa = []; window.open = u => { window.__wa.push(u); return null; }; });
  await page.click('#inv-wa');
  await page.waitForTimeout(300);
  const wa = decodeURIComponent((await page.evaluate(() => window.__wa[0])).replace('https://wa.me/?text=', ''));
  check('el mensaje lleva el título y la fecha', wa.includes('INVENTARIO FÍSICO') && wa.includes('31 ago'));
  check('va por categorías', wa.includes('*BEBIDAS*') && wa.includes('*LEGUMBRES Y FRUTAS*'));
  check('con bultos y unidades separados', wa.includes('Malta botella: 2 bultos + 31 und'));
  check('y con la observación', wa.includes('Papas cestas: 387,72 kg (21,51 × 18 cestas)'));
  check('no lista lo que no se contó', !wa.includes('Aguacate'));
  check('cierra con el total', wa.includes('173 productos contados'));
  check('el pollo va con sus cestas y su peso',
    wa.includes('Pollo en cestas marinado: 17 bultos + 541,79 kg'));

  // ---------- 8) uno nuevo se puede llenar ----------
  await page.click('#inv-back');
  await page.waitForTimeout(250);
  await page.click('#btn-fisico');
  await page.waitForTimeout(500);
  check('el nuevo arranca vacío', (await page.textContent('#fis-resumen')).includes('0 de 242'));
  await page.fill('.fis-i[data-i="aceite_vatel_pro"][data-k="b"]', '40');
  await page.dispatchEvent('.fis-i[data-i="aceite_vatel_pro"][data-k="b"]', 'change');
  await page.fill('.fis-obs[data-i="aceite_vatel_pro"]', 'llegó ayer');
  await page.dispatchEvent('.fis-obs[data-i="aceite_vatel_pro"]', 'change');
  await page.waitForTimeout(250);
  check('lo escrito se guarda', await page.evaluate(() =>
    currentInv.fisico.aceite_vatel_pro.b === '40' && currentInv.fisico.aceite_vatel_pro.obs === 'llegó ayer'));
  check('y el contador sube', (await page.textContent('#fis-resumen')).includes('1 de 242'));
  check('no se mezcla con el inventario de agosto', await page.evaluate(() =>
    db.inventarios.find(i => i.id === 'xfisico3108').fisico.aceite_vatel_pro.b === '38'));

  // borrar lo escrito lo quita
  await page.fill('.fis-i[data-i="aceite_vatel_pro"][data-k="b"]', '');
  await page.dispatchEvent('.fis-i[data-i="aceite_vatel_pro"][data-k="b"]', 'change');
  await page.fill('.fis-obs[data-i="aceite_vatel_pro"]', '');
  await page.dispatchEvent('.fis-obs[data-i="aceite_vatel_pro"]', 'change');
  await page.waitForTimeout(250);
  check('vaciarlo lo quita del conteo', (await page.textContent('#fis-resumen')).includes('0 de 242'));

  // ---------- 9) sobrevive a recargar ----------
  await page.fill('.fis-i[data-i="tenedores"][data-k="b"]', '22');
  await page.dispatchEvent('.fis-i[data-i="tenedores"][data-k="b"]', 'change');
  await page.waitForTimeout(250);
  await page.reload();
  await page.waitForTimeout(500);
  await page.click('#home-tabs button[data-t="inventario"]');
  await page.waitForTimeout(250);
  check('sigue ahí tras recargar', (await page.textContent('#home-list')).includes('1 producto contado'));

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errors.length ? errors : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errors.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
