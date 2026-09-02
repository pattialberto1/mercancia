// Nueva pestaña "Alitas": solo se anota el peso de cada bolsa, sin cestas ni
// tara. Se prueba contra el archivo real de la app clásica (sin servidor,
// solo file://) porque no tiene sincronización obligatoria para arrancar.
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
  await new Promise(r => server.listen(8970, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // sin token de sincronización: todas las llamadas a GitHub deben evitarse,
  // pero por si acaso no deben tumbar la página
  await page.route('https://api.github.com/**', route => route.fulfill({ status: 404, body: '{}' }));

  await page.goto('http://localhost:8970/');
  await page.fill('#pin-input', '7070');
  await page.click('#pin-btn');
  await page.waitForTimeout(200);

  // ---------- 1) la pestaña existe y no rompe las demás ----------
  const tabs = await page.$$eval('#home-tabs button', bs => bs.map(b => b.textContent.trim()));
  check('hay una pestaña «Alitas»', tabs.some(t => t.includes('Alitas')));
  check('las pestañas de siempre siguen: Pollo, Papas, Verduras, Tierra Santa',
    ['Pollo', 'Papas', 'Verduras', 'Tierra Santa'].every(n => tabs.some(t => t.includes(n))));

  await page.click('#home-tabs button[data-t="alitas"]');
  check('el botón principal dice "Nueva recepción de alitas"', (await page.textContent('#btn-new')).toLowerCase().includes('nueva recepción de alitas'));
  check('no ofrece el envío de verduras del día en esta pestaña', await page.isHidden('#btn-wa-dia'));
  check('lista vacía: avisa que no hay recepciones de alitas', (await page.textContent('#home-list')).toLowerCase().includes('alitas'));

  // ---------- 2) crear una recepción de alitas ----------
  await page.click('#btn-new');
  await page.waitForTimeout(150);
  check('abre la pantalla de recepción', await page.isVisible('#view-rec'));
  check('el título dice "Alitas"', (await page.textContent('#rec-title')).includes('Alitas'));
  check('el subtítulo no habla de tara ni de cestas', !/tara|cesta/i.test(await page.textContent('#rec-sub')));
  check('el subtítulo explica que se anota el peso de cada bolsa', (await page.textContent('#rec-sub')).includes('bolsa'));

  // ---------- 3) no hay selector de cestas ni de 2/1 cesta ----------
  check('no se ve el selector "2 cestas / 1 cesta suelta"', await page.isHidden('#seg-mode'));
  check('no se ve el selector de nº de cestas', await page.isHidden('#cestas-picker'));
  check('no hay botones rápidos', await page.isHidden('#quick-btns'));
  check('el campo de peso admite decimales', (await page.getAttribute('#weight-input', 'inputmode')) === 'decimal');
  check('el placeholder pide el peso de la bolsa', (await page.getAttribute('#weight-input', 'placeholder')).toLowerCase().includes('bolsa'));
  check('el texto de ayuda pide el peso de la bolsa', (await page.textContent('#range-hint')).toLowerCase().includes('bolsa'));

  // ---------- 4) totales: sin cestas ni tara visibles ----------
  check('no se ve la casilla de "Cestas"', await page.isHidden('#tot-cestas'));
  check('no se ve la casilla de "Tara cestas"', await page.isHidden('#tot-tara'));
  check('no se ve la tarjeta de cestas vacías', await page.isHidden('#card-vacias'));
  check('el resumen agrupado (solo para pollo) tampoco se ve', await page.isHidden('#summary-card'));

  // ---------- 5) anotar bolsas ----------
  await page.fill('#weight-input', '4,25');
  await page.click('#btn-add');
  await page.waitForTimeout(150);
  await page.fill('#weight-input', '3,8');
  await page.click('#btn-add');
  await page.waitForTimeout(150);
  await page.fill('#weight-input', '5');
  await page.click('#btn-add');
  await page.waitForTimeout(200);

  check('quedan 3 pesadas', (await page.textContent('#t-pesadas')).trim() === '3');
  check('el peso bruto es la suma exacta (13,05 kg)', (await page.textContent('#t-bruto')).includes('13,05'));
  check('el total neto es igual al bruto (sin tara)', (await page.textContent('#t-neto')).includes('13,05'));
  check('la etiqueta del total dice "ALITAS NETAS"', (await page.textContent('#t-neto-lbl')).trim() === 'ALITAS NETAS');

  // ---------- 6) la lista de pesadas no habla de cestas ----------
  const filas = await page.$$eval('#entries-list .entry', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  check('se ven las 3 bolsas', filas.length === 3);
  check('ninguna fila menciona "cesta"', !filas.some(f => /cesta/i.test(f)));
  check('cada fila numera la bolsa (#1, #2, #3)', filas.some(f => f.includes('#1')) && filas.some(f => f.includes('#3')));
  check('ninguna fila queda marcada "fuera de rango"', !filas.some(f => f.includes('fuera de rango')));

  // ---------- 7) borrar una bolsa recalcula el total ----------
  await page.click('#entries-list .entry:has-text("#2") .del');
  await page.waitForTimeout(200);
  check('borrar una bolsa la quita de la lista', (await page.$$('#entries-list .entry')).length === 2);
  check('el total baja a lo que queda (9,25 kg)', (await page.textContent('#t-neto')).includes('9,25'));

  // ---------- 8) mensaje de WhatsApp: sin cestas, sin tara ----------
  await page.evaluate(() => { window.__abiertas = []; window.open = u => { window.__abiertas.push(u); return null; }; });
  await page.click('#btn-wa');
  await page.waitForTimeout(200);
  const wa = decodeURIComponent((await page.evaluate(() => window.__abiertas[0])).replace('https://wa.me/?text=', ''));
  check('el mensaje lleva "ALITAS"', wa.includes('ALITAS'));
  check('el mensaje lista las bolsas con su peso', wa.includes('Bolsa 1: 4,25 kg') && wa.includes('Bolsa 2: 5 kg'));
  check('el mensaje cuenta las bolsas', wa.includes('2 bolsas'));
  check('el mensaje lleva el total', wa.includes('*ALITAS NETAS: 9,25 kg*'));
  check('el mensaje NO menciona cestas', !/cesta/i.test(wa));
  check('el mensaje NO menciona tara', !/tara/i.test(wa));

  // ---------- 9) terminar la recepción y volver a la lista ----------
  await page.click('#btn-close-rec');
  await page.click('#confirm-yes');
  await page.waitForTimeout(200);
  check('se puede terminar la recepción', (await page.textContent('#btn-close-rec')).includes('Reabrir'));
  await page.click('#btn-back');
  await page.waitForTimeout(200);
  const filaHome = await page.textContent('#home-list');
  check('en el inicio aparece con "bolsas" (no "cestas")', filaHome.includes('2 bolsas') && !filaHome.includes('cestas'));
  check('muestra el total correcto en la lista', filaHome.includes('9,25'));

  // ---------- 10) sobrevive a recargar (persistencia local) ----------
  await page.reload();
  await page.waitForTimeout(400);
  check('el PIN ya guardado no se vuelve a pedir', await page.isHidden('#lock'));
  await page.click('#home-tabs button[data-t="alitas"]');
  check('la recepción de alitas sigue ahí tras recargar', (await page.textContent('#home-list')).includes('9,25'));

  // ---------- 11) lo de siempre (pollo) sigue intacto ----------
  await page.click('#home-tabs button[data-t="pollo"]');
  await page.click('#btn-new');
  await page.waitForTimeout(200);
  check('pollo sigue mostrando el selector de 2/1 cesta', await page.isVisible('#seg-mode'));
  check('pollo sigue mostrando la casilla de Cestas', await page.isHidden('#tot-cestas') === false);
  check('pollo sigue mostrando la tarjeta de cestas vacías', await page.isHidden('#card-vacias') === false);
  await page.click('#quick-btns button:has-text("69")');
  await page.waitForTimeout(150);
  check('pollo sigue calculando bruto/tara/neto como siempre', (await page.textContent('#t-tara')).includes('4,6'));

  // ---------- 12) papas (granel con cestas) también sigue intacto ----------
  await page.click('#btn-back');
  await page.click('#home-tabs button[data-t="papas"]');
  await page.click('#btn-new');
  await page.waitForTimeout(200);
  check('papas sigue mostrando el selector de cestas (no es "bolsa")', await page.isVisible('#cestas-picker'));
  check('papas sigue mostrando la casilla de Cestas', await page.isHidden('#tot-cestas') === false);

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errors.length ? errors : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errors.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
