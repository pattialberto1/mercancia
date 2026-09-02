// Módulo 1: productos que se cuentan, varios proveedores, y las dos
// validaciones que faltaban (neto negativo y recepciones vacías).
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
  await new Promise(r => server.listen(8980, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.goto('http://localhost:8980/');
  await page.fill('#pin-input', '7070'); await page.click('#pin-btn'); await page.waitForTimeout(200);
  await page.evaluate(() => { window.__abiertas = []; window.open = u => { window.__abiertas.push(u); return null; }; });

  // ---------- 1) pestaña de bebidas ----------
  const tabs = await page.$$eval('#home-tabs button', bs => bs.map(b => b.textContent.trim()));
  check('hay una pestaña de Bebidas', tabs.some(t => t.includes('Bebidas')));
  check('las pestañas de siempre siguen', ['Pollo','Papas','Verduras','Alitas','Tierra Santa'].every(n => tabs.some(t => t.includes(n))));

  await page.click('#home-tabs button[data-t="unidades"]');
  await page.click('#btn-new');
  await page.waitForTimeout(250);
  check('al agrupar varios productos pregunta cuál llega', await page.isVisible('#modal-producto.show'));
  await page.click('#producto-btns button:has-text("Refresco 1L")');
  await page.waitForTimeout(250);

  // ---------- 2) la pantalla cuenta, no pesa ----------
  check('el título es del producto', (await page.textContent('#rec-title')).includes('Refresco 1L'));
  check('el subtítulo habla de unidades', (await page.textContent('#rec-sub')).includes('unidades'));
  check('el campo pide unidades', (await page.getAttribute('#weight-input','placeholder')).includes('unidades'));
  check('el teclado es numérico entero', (await page.getAttribute('#weight-input','inputmode')) === 'numeric');
  check('no hay selector de cestas', await page.isHidden('#cestas-picker'));
  check('no hay casilla de cestas', await page.isHidden('#tot-cestas'));
  check('no hay casilla de tara', await page.isHidden('#tot-tara'));
  check('no hay tarjeta de cestas vacías', await page.isHidden('#card-vacias'));
  check('la etiqueta dice Entradas, no Pesadas', (await page.textContent('#tot-pesadas-lbl')).trim() === 'Entradas');

  // ---------- 3) contar unidades ----------
  await page.fill('#weight-input', '2,5');
  await page.click('#btn-add');
  await page.waitForTimeout(200);
  check('rechaza media unidad', (await page.textContent('#toast')).includes('entero'));
  await page.fill('#weight-input', '120'); await page.click('#btn-add'); await page.waitForTimeout(150);
  await page.fill('#weight-input', '48');  await page.click('#btn-add'); await page.waitForTimeout(200);
  check('suma las unidades sin restar tara', (await page.textContent('#t-neto')).includes('168'));
  check('el total dice unidades, no kg', (await page.textContent('#t-neto')).includes('unidades'));
  check('la etiqueta del total es la del producto', (await page.textContent('#t-neto-lbl')).trim() === 'REFRESCOS 1L');
  const filas = await page.$$eval('#entries-list .entry', els => els.map(e => e.textContent));
  check('las entradas no mencionan cestas', !filas.some(f => /cesta/i.test(f)));
  check('las entradas no dicen kg', !filas.some(f => /\bkg\b/.test(f)));

  // ---------- 4) WhatsApp de un producto contado ----------
  await page.click('#btn-wa'); await page.waitForTimeout(200);
  const wa = decodeURIComponent((await page.evaluate(() => window.__abiertas[0])).replace('https://wa.me/?text=',''));
  check('el mensaje lleva el nombre del producto', wa.includes('REFRESCO 1L'));
  check('el mensaje lleva el total en unidades', wa.includes('168 unidades'));
  check('el mensaje no menciona kg', !/\bkg\b/.test(wa));
  check('el mensaje no menciona tara ni cestas', !/tara|cesta/i.test(wa));

  // ---------- 5) validación de neto negativo (el bug real) ----------
  await page.click('#btn-back');
  await page.click('#home-tabs button[data-t="verduras"]');
  await page.click('#btn-new'); await page.waitForTimeout(200);
  await page.click('#producto-btns button:has-text("Repollo morado")');
  await page.waitForTimeout(250);
  await page.click('#seg-cestas button:has-text("5")');
  await page.fill('#weight-input', '8,6');
  await page.click('#btn-add');
  await page.waitForTimeout(250);
  check('avisa cuando la tara se come el peso', await page.isVisible('#modal-confirm.show'));
  const aviso = await page.textContent('#confirm-msg');
  check('el aviso dice el neto negativo que saldría', aviso.includes('-2,9') || aviso.includes('−2,9'));
  check('el aviso explica que solo la tara pesa más', aviso.includes('11,5'));
  await page.click('#confirm-no'); await page.waitForTimeout(200);
  check('si cancelas, no se anota', (await page.textContent('#t-pesadas')).trim() === '0');
  // pero se puede forzar, por si de verdad fue así
  await page.click('#btn-add'); await page.waitForTimeout(200);
  await page.click('#confirm-yes'); await page.waitForTimeout(250);
  check('se puede anotar igual si insistes', (await page.textContent('#t-pesadas')).trim() === '1');

  // ---------- 6) recepciones vacías ----------
  await page.click('#btn-back');
  await page.click('#home-tabs button[data-t="papas"]');
  await page.click('#btn-new'); await page.waitForTimeout(250);
  await page.click('#btn-back'); await page.waitForTimeout(250);
  const lista = await page.textContent('#home-list');
  check('una recepción sin pesadas sale como «sin usar»', lista.includes('sin usar'));
  check('y no como «abierta»', !lista.includes('abierta'));

  // ---------- 7) varios proveedores ----------
  await page.click('#home-tabs button[data-t="tierrasanta"]');
  await page.click('#btn-new'); await page.waitForTimeout(250);
  check('la factura nueva trae un proveedor por defecto', (await page.inputValue('#fac-proveedor')) === 'Tierra Santa');
  const opciones = await page.$$eval('#lista-proveedores option', os => os.map(o => o.value));
  check('sugiere los proveedores conocidos', opciones.includes('Tierra Santa'));
  await page.fill('#fac-proveedor', 'Distribuidora Coca-Cola');
  await page.dispatchEvent('#fac-proveedor', 'change');
  await page.waitForTimeout(250);
  check('acepta un proveedor nuevo', (await page.textContent('#fac-title')).includes('Distribuidora Coca-Cola'));
  const opciones2 = await page.$$eval('#lista-proveedores option', os => os.map(o => o.value));
  check('el proveedor nuevo queda guardado para la próxima', opciones2.includes('Distribuidora Coca-Cola'));
  await page.click('#fac-back'); await page.waitForTimeout(250);
  check('la lista dice de qué proveedor es cada factura', (await page.textContent('#home-list')).includes('Distribuidora Coca-Cola'));
  await page.click('#btn-new'); await page.waitForTimeout(250);
  check('la siguiente factura recuerda el último proveedor', (await page.inputValue('#fac-proveedor')) === 'Distribuidora Coca-Cola');

  // ---------- 8) nada de lo viejo se rompió ----------
  await page.click('#fac-back');
  await page.click('#home-tabs button[data-t="pollo"]');
  await page.click('#btn-new'); await page.waitForTimeout(250);
  check('pollo sigue con su selector de 2/1 cesta', await page.isVisible('#seg-mode'));
  check('pollo sigue mostrando cestas', await page.isHidden('#tot-cestas') === false);
  await page.click('#quick-btns button:has-text("69")'); await page.waitForTimeout(200);
  check('pollo sigue descontando tara (2 cestas = 4,6)', (await page.textContent('#t-tara')).includes('4,6'));
  check('pollo sigue en kg', (await page.textContent('#t-neto')).includes('kg'));
  await page.click('#btn-back');
  await page.click('#home-tabs button[data-t="alitas"]');
  await page.click('#btn-new'); await page.waitForTimeout(250);
  await page.fill('#weight-input','4,25'); await page.click('#btn-add'); await page.waitForTimeout(200);
  check('alitas sigue aceptando decimales en kg', (await page.textContent('#t-neto')).includes('4,25'));

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errors.length ? errors : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errors.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
