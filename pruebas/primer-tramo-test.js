// El control arranca el día que se contó, aunque caiga a mitad de semana:
// es el único momento del que se sabe con certeza qué había.
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

const iso = d => d.toISOString().slice(0, 10);
const mas = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const hoy = new Date();
const hoyISO = iso(hoy);
const domingo = iso(mas(hoy, -hoy.getDay()));
const sabado = iso(mas(new Date(domingo + 'T12:00:00'), 6));
const esSabado = hoy.getDay() === 6;

(async () => {
  await new Promise(r => server.listen(8967, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));

  await page.goto('http://localhost:8967/');
  await page.fill('#pin-input', '7070'); await page.click('#pin-btn');
  await page.waitForTimeout(250);
  await page.click('#home-tabs button[data-t="inventario"]');
  await page.click('#btn-new');
  await page.waitForTimeout(350);

  // ---------- 1) el primer tramo empieza hoy ----------
  const inv = await page.evaluate(() => ({ ini: currentInv.semanaInicio, fin: currentInv.semanaFin }));
  if (esSabado) {
    check('contado un sábado, arranca el domingo siguiente', inv.ini > sabado);
  } else {
    check('el primer tramo arranca hoy, no el domingo pasado', inv.ini === hoyISO);
    check('y termina el sábado de esta semana', inv.fin === sabado);
  }

  // ---------- 2) se explica por qué, y qué rango exportar ----------
  const msg = await page.textContent('#inv-msg');
  check('pide el conteo del día en que se contó', msg.includes('lo que contaste al cerrar el'));
  if (!esSabado && hoyISO !== domingo) {
    check('explica que el tramo arranca el día del conteo', msg.includes('porque contaste al cerrar el'));
    check('y avisa de exportar el reporte con ese mismo rango', msg.includes('mismo rango'));
    check('el título no lo llama «semana»', (await page.textContent('#inv-title')).startsWith('Desde el'));
  }

  // ---------- 3) el conteo se anota en cestas ----------
  await page.fill('.inv-inicial[data-a="pollo_pieza"][data-k="b"]', '17');
  await page.dispatchEvent('.inv-inicial[data-a="pollo_pieza"][data-k="b"]', 'change');
  await page.waitForTimeout(250);
  check('17 cestas son 2.720 piezas',
    (await page.evaluate(() => currentInv.inicialManual.pollo_pieza)) === 2720);
  check('y se ve la cuenta hecha',
    (await page.textContent('#inv-comparacion')).includes('17 cestas × 160 = 2720 piezas'));
  check('con el inicial puesto, deja de pedirlo',
    !(await page.textContent('#inv-msg')).includes('lo que contaste al cerrar el'));
  check('el inicial entra en el «debería quedar»',
    (await page.evaluate(() => calcular(currentInv)[0].esperado)) === 2720);

  // ---------- 3b) el arranque no depende del día en que se abrió la app ----------
  check('se puede decir qué día se contó', await page.isVisible('#inv-arranque-card'));
  check('por defecto propone el día anterior al tramo',
    (await page.inputValue('#inv-arranque')) === iso(mas(hoy, -1)));
  const anteayer = iso(mas(hoy, -2));
  await page.fill('#inv-arranque', anteayer);
  await page.dispatchEvent('#inv-arranque', 'change');
  await page.waitForTimeout(250);
  check('mover la fecha del conteo mueve el arranque del tramo',
    (await page.evaluate(() => currentInv.semanaInicio)) === iso(mas(hoy, -1)));
  check('y lo dice en pantalla', (await page.textContent('#inv-arranque-hint')).includes('Se contará del'));
  check('el inicial que ya se escribió no se pierde',
    (await page.evaluate(() => currentInv.inicialManual.pollo_pieza)) === 2720);
  // no se puede haber contado en el futuro
  await page.fill('#inv-arranque', iso(mas(hoy, 3)));
  await page.dispatchEvent('#inv-arranque', 'change');
  await page.waitForTimeout(250);
  check('no acepta una fecha que todavía no llegó',
    (await page.evaluate(() => currentInv.semanaInicio)) === iso(mas(hoy, -1)));

  // ---------- 4) el SEGUNDO tramo ya es una semana completa ----------
  await page.evaluate(() => { currentInv.cerrado = true; save(false); });
  await page.click('#inv-back');
  await page.waitForTimeout(200);
  await page.click('#btn-new');
  await page.waitForTimeout(300);
  const seg = await page.evaluate(() => ({ ini: currentInv.semanaInicio, fin: currentInv.semanaFin }));
  check('el siguiente ya va de domingo a sábado',
    new Date(seg.ini + 'T12:00:00').getDay() === 0 && new Date(seg.fin + 'T12:00:00').getDay() === 6);
  check('y se llama «Semana»', (await page.textContent('#inv-title')).startsWith('Semana'));

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errors.length ? errors : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errors.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
