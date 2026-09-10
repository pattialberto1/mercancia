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

/* El primer tramo arranca HOY, salvo que hoy sea sábado —el último día de la
   semana—: entonces arranca el domingo, porque lo de hoy ya entró en el conteo.
   Las recepciones de la prueba tienen que caer dentro del tramo, o los sábados
   la prueba falla sola sin que nada esté roto. */
function diaDelTramo() {
  const d = new Date();
  if (d.getDay() === 6) d.setDate(d.getDate() + 1);   // sábado → domingo
  return d.toISOString().slice(0, 10);
}
const hoy = diaDelTramo();
// lo que llegó de verdad: 4 cajas de 12 cartones de 24 = 1.152 huevos, y cebollín en cestas
const RECEPCIONES = [
  { id: 'r-huevos', tipo: 'huevos', fecha: hoy, creada: 1, mod: 1, cerrada: true,
    tara: 0, cestasVacias: 0,
    pesadas: Array.from({ length: 4 }, () => ({ peso: 288, cestas: 0, ts: 1, emp: 'caja', cant: 1 })) },
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
                        articulosActivos: ['huevos', 'cebollin', 'camaron', 'pechuga', 'arroz'],
                        controlSimplificado: 1 },
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
  // el huevo y el cebollín ya no van al control semanal, pero recibirlos sí
  // tiene que seguir dando lo mismo: la caja son 288 y el cebollín va en neto
  const rec = await page.evaluate(() => {
    const suma = tipo => db.recepciones.filter(r => r.tipo === tipo)
      .reduce((s, r) => s + totals(r).neto, 0);
    return { huevos: suma('huevos'), cebollin: Math.round(suma('cebollin') * 100) / 100 };
  });
  check('4 cajas de 288 huevos son 1.152 huevos', rec.huevos === 1152);
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
  /* Estos productos ya no están en el control semanal —el inventario se
     estrechó a bebidas, pollo, papas y lumpias el 10/9— pero su receta sigue
     guardada y tiene que seguir siendo correcta, así que se lee de las
     equivalencias en vez de del tramo. */
  const ven = await page.evaluate(() => {
    const eq = equivalencias(), o = {};
    for (const v of currentInv.ventas)
      for (const [a, n] of Object.entries((eq[v.codigo] || {}).consume || {}))
        o[a] = Math.round(((o[a] || 0) + n * v.cantidad) * 1e6) / 1e6;
    return { huevos: o.huevos, cebollin: o.cebollin, camaron: o.camaron,
             pollo: o.pechuga, arroz: o.arroz };
  });
  // los combos traen 2 potes: 92 + 173 + 91×2 + 197×2 = 841 potes
  // y cada pote lleva medio huevo, el «medio cucharón» de Alberto
  check('los combos cuentan como dos potes cada uno (841 potes)', ven.huevos === 841 * 0.5);
  check('841 potes × 50 g = 42,05 kg de cebollín', ven.cebollin === 42.05);
  check('841 potes × 100 g = 84,1 kg de pechuga', ven.pollo === 84.1);
  check('841 potes × 400 g = 336,4 kg de arroz', ven.arroz === 336.4);

  // ---------- 4) el camarón SOLO va en los potes de pollo y camarón ----------
  // 173 + 197×2 = 567 potes P&C
  check('el camarón solo cuenta en los P&C (567 potes × 120 g)', ven.camaron === 68.04);
  check('y no en los de solo pollo', ven.camaron !== 841 * 0.12);

  /* ---------- 5) el huevo se cuenta en cartones ----------
     Ya no está en el control semanal, pero cuando vuelva tiene que volver
     contándose igual: la caja son 288 y el cartón 24. */
  const cuenta = await page.evaluate(() => ({
    porBulto: porBultoDe(articulo('huevos')),
    nombre: nombreBulto(articulo('huevos')),
    diez: totalDe(articulo('huevos'), { b: '10', u: '7' }),
    caja: HUEVOS_POR_CAJA
  }));
  check('1 cartón son 24 huevos', cuenta.porBulto === 24, cuenta);
  check('y la casilla dice «cartones», no «bultos»', cuenta.nombre === 'cartones', cuenta);
  check('10 cartones + 7 sueltos = 247 huevos', cuenta.diez === 247, cuenta);
  check('y la caja sigue siendo de 288', cuenta.caja === 288, cuenta);

  // en la pantalla de equivalencias solo salen los 17 que se llevan
  await page.click('#inv-equivalencias');
  await page.waitForTimeout(300);
  const eqTxt = await page.textContent('#eq-articulos');
  check('ahí se dice cuántas unidades trae un bulto', eqTxt.includes('1 bulto = 6 unidades'));
  check('y ya no salen los que no se llevan', !eqTxt.includes('Huevos'));

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errors.length ? errors : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errors.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
