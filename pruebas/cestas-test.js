// La cesta que llega del proveedor (18 pollos) NO es la cesta que se cuenta en
// la cava (20 pollos, ya picada). Confundirlas infla lo recibido un 11%.
// Caso real: 50 cestas recibidas se vuelven 45 marinadas, y las piezas cuadran.
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
const hoy = iso(new Date());

// 50 cestas recibidas hoy, como las que llegaron de verdad
const RECEPCIONES = [{
  id: 'r50', tipo: 'pollo', fecha: hoy, creada: 1, mod: 1, cerrada: true,
  tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, cestasVacias: 0,
  pesadas: Array.from({ length: 25 }, () => ({ peso: 69, cestas: 2, ts: 1 }))
}];

(async () => {
  await new Promise(r => server.listen(8964, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.addInitScript(([recs]) => {
    localStorage.setItem('mercancia.pin', '7070');
    localStorage.setItem('mercancia.v1', JSON.stringify({
      v: 2, settings: { tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, syncToken: '', apiKey: '' },
      recepciones: JSON.parse(recs), facturas: [], inventarios: [], borradas: {}
    }));
  }, [JSON.stringify(RECEPCIONES)]);

  await page.goto('http://localhost:8964/');
  await page.waitForTimeout(350);

  // ---------- 1) las dos cestas, cada una con su tamaño ----------
  const n = await page.evaluate(() => ({
    rec: piezasPorCestaRecibida(), mar: piezasPorCestaMarinada(),
    pb: porBultoDe(articulo('pollo_pieza'))
  }));
  check('la cesta del proveedor son 18 pollos = 144 piezas', n.rec === 144);
  check('la cesta marinada son 20 pollos = 160 piezas', n.mar === 160);
  check('lo que se cuenta es la marinada', n.pb === 160);

  // ---------- 2) 50 recibidas = 45 marinadas, y las piezas cuadran ----------
  check('50 cestas recibidas son 7.200 piezas', 50 * n.rec === 7200);
  check('y eso son 45 cestas marinadas, no 50', 7200 / n.mar === 45);

  // ---------- 3) el recibido de la semana usa la cesta del proveedor ----------
  await page.click('#home-tabs button[data-t="inventario"]');
  await page.click('#btn-new');
  await page.waitForTimeout(350);
  const rec = await page.evaluate(() => calcular(currentInv)[0].recibido);
  check('la app cuenta 7.200 piezas recibidas, no 8.000', rec === 7200);

  // ---------- 4) contar 45 cestas deja el inventario cuadrado ----------
  await page.fill('.inv-conteo[data-a="pollo_pieza"][data-k="b"]', '45');
  await page.dispatchEvent('.inv-conteo[data-a="pollo_pieza"][data-k="b"]', 'change');
  await page.waitForTimeout(250);
  check('45 cestas contadas son 7.200 piezas',
    (await page.evaluate(() => currentInv.conteo.pollo_pieza)) === 7200);
  check('sin ventas ni inicial, cuadra exacto',
    (await page.textContent('#inv-comparacion')).includes('Cuadra exacto'));

  // ---------- 5) se explica en pantalla, para no confundirlas ----------
  await page.click('#inv-equivalencias');
  await page.waitForTimeout(300);
  const art = await page.textContent('#eq-articulos');
  check('la pantalla distingue las dos cestas',
    art.includes('cestas marinadas de 20 pollos (160 piezas)') && art.includes('proveedor trae 18 pollos (144 piezas)'));

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errors.length ? errors : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errors.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
