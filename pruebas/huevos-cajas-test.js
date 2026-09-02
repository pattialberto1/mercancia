// Los huevos entran por CAJAS: cada caja trae 12 cartones de 24 huevos (288).
// Se sigue guardando todo contado en huevos; la caja y el cartón son solo la
// forma de teclearlo, y el cartón y el huevo suelto quedan para cuando no
// llega caja completa.
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
function check(desc, cond, extra) {
  results.push({ desc, ok: !!cond });
  if (!cond) console.log('   (falló)', desc, extra === undefined ? '' : extra);
}

const hoy = new Date().toISOString().slice(0, 10);
// una recepción vieja, de cuando se tecleaban huevos sueltos: no se toca
const RECEPCIONES = [
  { id: 'r-vieja', tipo: 'huevos', fecha: '2026-08-20', creada: 1, mod: 1, cerrada: true,
    tara: 0, cestasVacias: 0, pesadas: [{ peso: 300, cestas: 0, ts: 1 }] }
];

(async () => {
  await new Promise(r => server.listen(8971, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.addInitScript(([recs]) => {
    window.__abiertas = [];
    localStorage.setItem('mercancia.pin', '7070');
    localStorage.setItem('mercancia.v1', JSON.stringify({
      v: 2, settings: { tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, syncToken: '', apiKey: '',
                        articulosActivos: ['huevos'] },
      recepciones: JSON.parse(recs), facturas: [], inventarios: [], borradas: {}
    }));
  }, [JSON.stringify(RECEPCIONES)]);

  await page.goto('http://localhost:8971/');
  await page.waitForTimeout(350);
  await page.evaluate(() => { window.__abiertas = []; window.open = u => { window.__abiertas.push(u); return null; }; });

  // ---------- 1) la caja es lo que trae el proveedor ----------
  const caja = await page.evaluate(() => ({
    porCarton: HUEVOS_POR_CARTON, cartones: CARTONES_POR_CAJA, porCaja: HUEVOS_POR_CAJA
  }));
  check('un cartón son 24 huevos', caja.porCarton === 24, caja.porCarton);
  check('una caja trae 12 cartones', caja.cartones === 12, caja.cartones);
  check('una caja son 288 huevos', caja.porCaja === 288, caja.porCaja);

  // ---------- 2) la pantalla de recepción arranca en cajas ----------
  await page.click('#home-tabs button[data-t="unidades"]');
  await page.click('#btn-new');
  await page.waitForTimeout(250);
  await page.click('#producto-btns button:has-text("Huevos")');
  await page.waitForTimeout(250);

  check('hay selector de empaque', await page.isVisible('#empaque-picker'));
  const opciones = await page.$$eval('#seg-empaque button', bs => bs.map(b => b.textContent.trim()));
  check('se puede teclear en cajas, cartones o huevos',
    opciones.join('|') === 'Cajas|Cartones|Huevos', opciones.join('|'));
  check('la caja viene marcada por defecto',
    (await page.textContent('#seg-empaque button.on')).trim() === 'Cajas');
  check('el campo pide cajas',
    (await page.getAttribute('#weight-input', 'placeholder')) === 'Cuántas cajas');
  const sub = await page.textContent('#rec-sub');
  check('el subtítulo explica la caja', sub.includes('12 cartones') && sub.includes('288'), sub);
  check('la pista dice cuántos huevos trae una caja',
    (await page.textContent('#range-hint')).includes('288'));

  // ---------- 3) 2 cajas son 576 huevos ----------
  await page.fill('#weight-input', '2'); await page.click('#btn-add');
  await page.waitForTimeout(200);
  check('2 cajas se guardan como 576 huevos',
    (await page.evaluate(() => current.pesadas[0].peso)) === 576,
    await page.evaluate(() => current.pesadas[0].peso));
  check('queda anotado que se tecleó en cajas',
    await page.evaluate(() => current.pesadas[0].emp === 'caja' && current.pesadas[0].cant === 2));
  check('el total va en huevos', (await page.textContent('#t-neto')).includes('576 huevos'));
  check('la entrada se lee como se escribió',
    (await page.textContent('#entries-list .entry')).includes('2 cajas · 576 huevos'));

  // ---------- 4) cartones y huevos sueltos, para lo que no es caja entera ----------
  await page.click('#seg-empaque button:has-text("Cartones")');
  await page.waitForTimeout(150);
  check('al cambiar a cartones el campo lo dice',
    (await page.getAttribute('#weight-input', 'placeholder')) === 'Cuántos cartones');
  await page.fill('#weight-input', '3'); await page.click('#btn-add');
  await page.waitForTimeout(200);
  check('3 cartones son 72 huevos',
    (await page.evaluate(() => current.pesadas[1].peso)) === 72,
    await page.evaluate(() => current.pesadas[1].peso));

  await page.click('#seg-empaque button:has-text("Huevos")');
  await page.waitForTimeout(150);
  await page.fill('#weight-input', '7'); await page.click('#btn-add');
  await page.waitForTimeout(200);
  check('7 huevos sueltos son 7 huevos',
    (await page.evaluate(() => current.pesadas[2].peso)) === 7);
  check('el suelto no se anota con empaque',
    (await page.evaluate(() => current.pesadas[2].emp)) === undefined);
  check('el total suma 655 huevos', (await page.textContent('#t-neto')).includes('655 huevos'));

  // ---------- 5) no se aceptan medias cajas ----------
  await page.click('#seg-empaque button:has-text("Cajas")');
  await page.waitForTimeout(150);
  await page.fill('#weight-input', '1,5'); await page.click('#btn-add');
  await page.waitForTimeout(200);
  check('rechaza media caja', (await page.textContent('#toast')).includes('entero'));
  check('y no la guarda', (await page.evaluate(() => current.pesadas.length)) === 3);

  // ---------- 6) el mensaje de WhatsApp lleva las cajas ----------
  await page.click('#btn-wa'); await page.waitForTimeout(250);
  const wa = decodeURIComponent((await page.evaluate(() => window.__abiertas[0] || '')).replace('https://wa.me/?text=', ''));
  check('el mensaje detalla las 2 cajas', wa.includes('2 cajas · 576 huevos'), wa);
  check('el mensaje lleva el total en huevos', wa.includes('655 huevos'));

  // ---------- 7) el inventario recibe huevos, no cajas ----------
  await page.click('#btn-back'); await page.waitForTimeout(200);
  await page.click('#home-tabs button[data-t="inventario"]');
  await page.click('#btn-new');
  await page.waitForTimeout(400);
  const recibido = await page.evaluate(() =>
    calcular(currentInv).find(x => x.art.id === 'huevos').recibido);
  check('al inventario entran los 655 huevos de hoy', recibido === 655, recibido);
  check('el conteo sigue siendo por cartones de 24',
    await page.evaluate(() => porBultoDe(articulo('huevos')) === 24 &&
                              nombreBulto(articulo('huevos')) === 'cartones'));

  // ---------- 8) lo viejo no se reescribe ----------
  await page.evaluate(() => { openRec('r-vieja'); });
  await page.waitForTimeout(250);
  check('una entrada vieja sin empaque se sigue leyendo en huevos',
    (await page.textContent('#entries-list .entry')).includes('300 huevos'));
  check('y no se le inventa un número de cajas',
    !/caja/i.test(await page.textContent('#entries-list .entry')));

  // ---------- cierre ----------
  console.log('');
  for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.desc);
  console.log('\nerrores JS: ' + (errors.length ? errors.join(' | ') : 'ninguno'));
  const malos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (malos ? malos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(malos || errors.length ? 1 : 0);
})();
