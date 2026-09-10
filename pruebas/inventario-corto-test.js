// El inventario, después de estrecharlo (Alberto, 10/9: «quita todos los
// productos menos los que tenemos en el dashboard… del inventario físico
// igual»). El tramo ES el cuadre: la misma pantalla enseña la cuenta y recoge
// el conteo, y lleva 17 productos en vez de 245.
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
  await new Promise(r => server.listen(8975, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.addInitScript(() => localStorage.setItem('mercancia.pin', '7070'));
  await page.goto('http://localhost:8975/');
  await page.waitForTimeout(400);

  // ---------- 1) lo que se lleva, y nada más ----------
  const lista = await page.evaluate(() => articulosDelTramo().map(a => a.nombre));
  check('el tramo lleva 17 productos', lista.length === 17, lista.length);
  for (const n of ['Piezas de pollo', 'Papas', 'Lumpias', 'Refrescos de 1L', 'Refrescos de 1,5L',
                   'Refrescos de 2L', 'Agua Minalba 600ml', 'Agua Glacier 550ml', 'Agua Minalba 1,5L',
                   'Maltas', 'Yuky-packs', 'Gatorade', 'Jugos Barinas 400ml', 'Tenta té',
                   'Té Lipton durazno', 'Té Lipton limón', 'Té verde Lipton'])
    check('se lleva ' + n, lista.includes(n), lista);
  for (const n of ['Tomate', 'Cilantro', 'Repollo blanco', 'Zanahoria', 'Huevos', 'Cebollín', 'Envases'])
    check('ya no se lleva ' + n, !lista.includes(n));

  // ---------- 2) el físico, igual de corto ----------
  const fis = await page.evaluate(() => ({
    grupos: catalogoFisico().map(g => g.cat),
    renglones: catalogoFisico().reduce((s, g) => s + g.items.length, 0),
    nombres: catalogoFisico().flatMap(g => g.items).map(i => i.nombre)
  }));
  check('la hoja del físico baja a 39 renglones', fis.renglones === 39, fis.renglones);
  check('en tres grupos', fis.grupos.join('|') === 'Bebidas|Pollo y papas|Otros', fis.grupos);
  check('están los sabores de refresco, que es como se cuentan',
    fis.nombres.includes('Refresco Coca-Cola 1L') && fis.nombres.includes('Refresco Pepsi 2L'));
  check('está el pollo en cestas y las papas',
    fis.nombres.includes('Pollo en cestas marinado') && fis.nombres.includes('Papas cestas'));
  for (const n of ['Coleto', 'Teipe', 'Mostaza', 'Servilletas Euro', 'Tomate'])
    check('ya no está en la hoja: ' + n, !fis.nombres.includes(n));
  // y ningún renglón se queda sin su artículo del tramo
  const huerfanos = await page.evaluate(() => {
    const ids = new Set(articulosDelTramo().map(a => a.id));
    return catalogoFisico().flatMap(g => g.items).filter(i => !ids.has(i.art)).map(i => i.nombre);
  });
  check('cada renglón de la hoja va a parar a un producto del tramo',
    huerfanos.length === 0, huerfanos);

  // ---------- 3) el tramo ES el cuadre: una sola pantalla ----------
  await page.click('#home-tabs button[data-t="inventario"]');
  await page.click('#btn-new');
  await page.waitForTimeout(500);
  check('no hay pantalla de cuadre aparte', !(await page.$('#view-dash')));
  check('ni botón para ir a ella', !(await page.$('#inv-dash')));
  check('ni buscador: con 17 no hace falta', !(await page.$('#inv-buscar')));
  const filas = await page.evaluate(() => document.querySelectorAll('.dash-row').length);
  check('salen las 17 filas de una vez, sin plegar nada', filas === 17, filas);
  check('con la cuenta entera', await page.isVisible('.dash-cab'));
  check('y con la casilla del conteo en la misma fila',
    (await page.evaluate(() => document.querySelectorAll('.dash-row .inv-conteo').length)) > 0);

  // ---------- 4) contar ahí mismo cambia el cuadre ----------
  await page.evaluate(() => {
    const fis = nuevoFisico(masDias(currentInv.semanaInicio, -7));
    fis.fisico = { pollo_en_cestas_marinado: { b: '10', u: '' } };   // 1.600 piezas
    fis.cerrado = true; save(false); renderInv();
  });
  await page.waitForTimeout(400);
  await page.fill('.inv-conteo[data-a="pollo_pieza"][data-k="b"]', '9');
  await page.dispatchEvent('.inv-conteo[data-a="pollo_pieza"][data-k="b"]', 'change');
  await page.waitForTimeout(400);
  const pollo = await page.evaluate(() => {
    const f = calcular(currentInv).find(x => x.art.id === 'pollo_pieza');
    const r = [...document.querySelectorAll('.dash-row')].find(x => x.textContent.includes('Piezas de pollo'));
    return { conteo: f.conteo, dif: f.diferencia, txt: r.textContent };
  });
  check('9 cestas se guardan como 1.440 piezas', pollo.conteo === 1440, pollo.conteo);
  check('y el cuadre lo dice ahí mismo: faltan 160',
    pollo.dif === -160 && /Faltan 160 piezas/.test(pollo.txt), pollo);

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errors.length ? errors : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errors.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
