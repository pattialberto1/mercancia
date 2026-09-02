// Huevos y cebollín entran al inventario con la receta del pote de chino.
// Los COMBOS de chino se dejan sin asignar a propósito: la app tiene que
// avisarlo, no contarlos por su cuenta.
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

const hoy = new Date().toISOString().slice(0, 10);
// lo que llegó de verdad: 8 cajas de 6 cartones de 24 = 1.152 huevos, y cebollín en cestas
const RECEPCIONES = [
  { id: 'r-huevos', tipo: 'huevos', fecha: hoy, creada: 1, mod: 1, cerrada: true,
    tara: 0, cestasVacias: 0,
    pesadas: Array.from({ length: 8 }, () => ({ peso: 144, cestas: 0, ts: 1, emp: 'caja', cant: 1 })) },
  // 3 cestas de cebollín: 30 kg brutos menos 2,3 de tara por cesta = 23,1 netos
  { id: 'r-cebollin', tipo: 'cebollin', fecha: hoy, creada: 1, mod: 1, cerrada: true,
    tara: 2.3, cestasVacias: 0, pesadas: [{ peso: 30, cestas: 3, ts: 1 }] }
];

(async () => {
  await new Promise(r => server.listen(8963, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.addInitScript(([recs]) => {
    localStorage.setItem('mercancia.pin', '7070');
    localStorage.setItem('mercancia.v1', JSON.stringify({
      v: 2, settings: { tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, syncToken: '', apiKey: '',
                        articulosActivos: ['huevos', 'cebollin', 'camaron', 'pechuga', 'arroz'] },
      recepciones: JSON.parse(recs), facturas: [], inventarios: [], borradas: {}
    }));
  }, [JSON.stringify(RECEPCIONES)]);

  await page.goto('http://localhost:8963/');
  await page.waitForTimeout(350);

  // ---------- 1) los huevos se pueden recibir ----------
  const tabs = await page.$$eval('#home-tabs button', bs => bs.map(b => b.textContent.trim()));
  check('la pestaña de bebidas ahora es «Bebidas y otros»', tabs.some(t => t.includes('Bebidas y otros')));

  // ---------- 2) lo recibido: 4 cajas = 1.152 huevos, cebollín en NETO ----------
  await page.click('#home-tabs button[data-t="inventario"]');
  await page.click('#btn-new');
  await page.waitForTimeout(350);
  const rec = await page.evaluate(() => {
    const f = calcular(currentInv);
    return { huevos: f.find(x => x.art.id === 'huevos').recibido,
             cebollin: f.find(x => x.art.id === 'cebollin').recibido };
  });
  check('8 cajas de 144 huevos son 1.152 huevos', rec.huevos === 1152);
  check('el cebollín entra en neto, con la tara descontada', rec.cebollin === 23.1);

  // ---------- 3) la receta del pote de chino ----------
  await page.evaluate(() => {
    currentInv.ventas = [
      { codigo: '1516', descripcion: 'ARROZ CHINO POLLO', cantidad: 92 },
      { codigo: '1517', descripcion: 'ARROZ CHINO P & C', cantidad: 173 },
      { codigo: '1518', descripcion: 'COMBO 1 CHINO POLLO', cantidad: 91 },
      { codigo: '1520', descripcion: 'COMBO 2 CHINO P&C', cantidad: 197 }
    ];
    touch(currentInv); save(false); renderInv();
  });
  await page.waitForTimeout(300);
  const ven = await page.evaluate(() => {
    const f = calcular(currentInv);
    const g = id => f.find(x => x.art.id === id).vendido;
    return { huevos: g('huevos'), cebollin: g('cebollin'), camaron: g('camaron'),
             pollo: g('pechuga'), arroz: g('arroz') };
  });
  // los combos traen 2 potes: 92 + 173 + 91×2 + 197×2 = 841 potes
  check('los combos cuentan como dos potes cada uno (841 potes)', ven.huevos === 841 * 2);
  check('841 potes × 50 g = 42,05 kg de cebollín', ven.cebollin === 42.05);
  check('841 potes × 100 g = 84,1 kg de pechuga', ven.pollo === 84.1);
  check('841 potes × 400 g = 336,4 kg de arroz', ven.arroz === 336.4);

  // ---------- 4) el camarón SOLO va en los potes de pollo y camarón ----------
  // 173 + 197×2 = 567 potes P&C
  check('el camarón solo cuenta en los P&C (567 potes × 120 g)', ven.camaron === 68.04);
  check('y no en los de solo pollo', ven.camaron !== 841 * 0.12);

  // ---------- 5) el conteo de huevos se hace en cartones ----------
  await page.fill('.inv-conteo[data-a="huevos"][data-k="b"]', '10');
  await page.dispatchEvent('.inv-conteo[data-a="huevos"][data-k="b"]', 'change');
  await page.fill('.inv-conteo[data-a="huevos"][data-k="u"]', '7');
  await page.dispatchEvent('.inv-conteo[data-a="huevos"][data-k="u"]', 'change');
  await page.waitForTimeout(250);
  check('10 cartones + 7 sueltos = 247 huevos',
    (await page.evaluate(() => currentInv.conteo.huevos)) === 247);
  const t = await page.textContent('#inv-comparacion');
  check('la casilla dice «cartones», no «bultos»', t.includes('cartones'));
  check('y muestra la cuenta', t.includes('10 cartones × 24 + 7 = 247 unidades'));

  await page.click('#inv-equivalencias');
  await page.waitForTimeout(300);
  check('en los artículos dice 1 cartón = 24',
    (await page.textContent('#eq-articulos')).includes('1 cartón = 24 unidades'));

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errors.length ? errors : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errors.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
