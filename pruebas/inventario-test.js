// El inventario, rehecho el 1 de octubre de 2026: una sola lista, la misma
// que la hoja del local, y el cuadre en la misma fila donde se cuenta.
// Se prueba con los números reales del conteo del 1 de octubre.
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

const hoy = new Date().toISOString().slice(0, 10);
const lunes = (() => { const d = new Date(hoy + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
const mas = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// una semana cerrada antes, para que la siguiente herede su conteo
const SEMANA_PREVIA = {
  id: 'iprev', semanaInicio: mas(lunes, -7), semanaFin: mas(lunes, -1),
  creada: 1, mod: 1, cerrado: true, ventas: [],
  conteoDet: { r1_cocacola: { b: '10', u: '' }, papas: { b: '', u: '80' } },
  inicialManual: {}
};
// 50 cestas de pollo y 20 de papas recibidas dentro de la semana
const RECEPCIONES = [
  { id: 'rp', tipo: 'pollo', fecha: lunes, creada: 1, mod: 1, cerrada: true,
    tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, cestasVacias: 0,
    pesadas: Array.from({ length: 25 }, () => ({ peso: 69, cestas: 2, ts: 1 })) },
  { id: 'rpa', tipo: 'papas', fecha: lunes, creada: 1, mod: 1, cerrada: true,
    tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, cestasVacias: 0,
    pesadas: [{ peso: 476.2, cestas: 20, ts: 1 }] }
];

(async () => {
  await new Promise(r => server.listen(8942, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.addInitScript(([prev, recs]) => {
    localStorage.setItem('mercancia.pin', '7070');
    if (localStorage.getItem('mercancia.v1')) return;
    localStorage.setItem('mercancia.v1', JSON.stringify({
      v: 2, settings: { tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, syncToken: '', apiKey: '' },
      recepciones: JSON.parse(recs), facturas: [], inventarios: [JSON.parse(prev)], borradas: {}
    }));
  }, [JSON.stringify(SEMANA_PREVIA), JSON.stringify(RECEPCIONES)]);

  await page.goto('http://localhost:8942/');
  await page.waitForTimeout(400);

  // ---------- 1) la lista es la hoja ----------
  const secciones = await page.evaluate(() => PRODUCTOS_INV.map(s => s.s));
  check('las cuatro secciones de la hoja',
    JSON.stringify(secciones) === JSON.stringify(['Bebidas', 'Pollo y carnes', 'Papas', 'Otros']), secciones);
  const n = await page.evaluate(() => INV.length);
  check('están los 47 renglones del conteo', n === 47, n);
  const nombres = await page.evaluate(() => INV.map(p => p.nombre));
  for (const x of ['Agua Minalba 1,5L', 'Refresco Chinoto 1L', 'Yukki pack durazno',
                   'Pollo en cestas marinado', 'Milanesa congelada', 'Papas', 'Lumpias', 'Postres tres leches'])
    check('está «' + x + '»', nombres.includes(x));
  check('los renglones vacíos de la hoja también están',
    nombres.includes('Refresco Naranja 1L') && nombres.includes('Tenta té limón 500ml'));

  // ---------- 2) ya no hay inventario físico aparte ----------
  check('se quitó el inventario físico', await page.evaluate(() => typeof CATALOGO_FISICO === 'undefined'));
  check('y su botón', !(await page.$('#btn-fisico')));
  check('tampoco queda el modelo viejo de artículos',
    await page.evaluate(() => typeof ARTICULOS_TODOS === 'undefined'));

  // ---------- 3) abre la semana que sigue a la última ----------
  await page.click('#home-tabs button[data-t="inventario"]');
  await page.waitForTimeout(200);
  await page.click('#btn-new');
  await page.waitForTimeout(500);
  const sem = await page.evaluate(() => ({ i: currentInv.semanaInicio, f: currentInv.semanaFin }));
  check('arranca el día siguiente al cierre de la anterior', sem.i === lunes, sem);
  check('y dura siete días, de lunes a domingo', sem.f === mas(lunes, 6), sem);

  // ---------- 4) lo que había sale del cierre anterior ----------
  const f = id => page.evaluate(k => calcular(currentInv).find(x => x.clave === k), id);
  const coca = await f('ref_1l');
  check('hereda el conteo de la semana cerrada (10 bultos = 60)', coca.inicial === 60, coca.inicial);
  const papas0 = await f('papas');
  check('y en lo que va por kilos también (80 kg)', papas0.inicial === 80, papas0.inicial);

  // ---------- 5) lo recibido entra solo ----------
  const pollo = await f('pollo');
  check('50 cestas recibidas son 7.200 piezas', pollo.recibido === 7200, pollo.recibido);
  const papas = await f('papas');
  check('las papas entran en neto, con la tara descontada', Math.abs(papas.recibido - 430.2) < 0.01, papas.recibido);

  // ---------- 6) lo vendido, por las recetas ----------
  await page.evaluate(() => {
    currentInv.ventas = [
      { codigo: '1523', descripcion: 'COMBO 3 POLLO', cantidad: 100 },  // 800 piezas + 35 kg papas
      { codigo: '1521', descripcion: 'COMBO 2 POLLO', cantidad: 50 },   // 200 piezas + 17,5 kg + 50 refrescos
      { codigo: '1535', descripcion: 'REF. 1L COCA COLA', cantidad: 30 },
      { codigo: '1617', descripcion: 'MALTA BOTELLA', cantidad: 12 },
      { codigo: '1562', descripcion: 'DELIVERY 1', cantidad: 40 }
    ];
    touch(currentInv); save(false); renderInv();
  });
  await page.waitForTimeout(350);
  const v = await f('pollo');
  check('los combos descuentan piezas de pollo (1.000)', v.vendido === 1000, v.vendido);
  const vp = await f('papas');
  check('y su ración de papas (52,5 kg)', Math.abs(vp.vendido - 52.5) < 0.01, vp.vendido);
  const vr = await f('ref_1l');
  check('el refresco del combo y el suelto van al mismo montón (80)', vr.vendido === 80, vr.vendido);
  check('el delivery no descuenta nada', (await page.textContent('#inv-msg')).indexOf('DELIVERY') === -1);

  // ---------- 7) el conteo se escribe como en la hoja ----------
  const poner = async (id, b, u) => {
    if (b !== null) { await page.fill(`.cnt[data-p="${id}"][data-k="b"]`, String(b)); await page.dispatchEvent(`.cnt[data-p="${id}"][data-k="b"]`, 'change'); }
    if (u !== null) { await page.fill(`.cnt[data-p="${id}"][data-k="u"]`, String(u)); await page.dispatchEvent(`.cnt[data-p="${id}"][data-k="u"]`, 'change'); }
    await page.waitForTimeout(120);
  };
  // los números de verdad de la hoja del 1 de octubre
  await poner('r1_manzanita', 35, 11);
  await poner('r1_pina', 57, 11);
  await poner('r1_cocacola', 20, null);
  const g = await f('ref_1l');
  check('el grupo suma lo contado de cada sabor (694)', g.conteo === 35 * 6 + 11 + 57 * 6 + 11 + 20 * 6, g.conteo);
  check('y la cuenta se muestra hecha',
    (await page.textContent('#inv-lista')).includes('35 bultos × 6 + 11 = 221'));

  // ---------- 8) la diferencia ----------
  await poner('malta', 3, 3);
  const m = await f('malta');
  check('la malta: 3 bultos + 3 = 111', m.conteo === 111, m.conteo);
  check('debería quedar −12 vendidas', m.esperado === -12, m.esperado);
  const txt = await page.textContent('#inv-lista');
  check('un esperado negativo no se presenta como merma', txt.includes('se vendió más de lo que la app tiene registrado'));

  await poner('pollo_marinado', 19, null);
  const pm = await f('pollo');
  check('19 cestas marinadas son 3.040 piezas', pm.conteo === 3040, pm.conteo);
  check('y dice cuántas faltan contra lo esperado',
    pm.diferencia === pm.conteo - pm.esperado && pm.diferencia < 0, pm);

  // ---------- 9) el resumen de arriba ----------
  const res = await page.textContent('#inv-resumen');
  check('el resumen cuenta lo que no cuadra', /no cuadran|no cuadra/.test(res), res);
  check('y lo que falta por contar', res.includes('por contar'));

  // ---------- 10) se puede cerrar, diciendo qué queda a medias ----------
  await page.click('#inv-cerrar');
  await page.waitForTimeout(250);
  const conf = await page.textContent('#confirm-msg');
  check('el aviso nombra lo que se cierra sin contar', /sin contar/.test(conf), conf);
  check('y avisa de lo que queda en negativo', /negativo/.test(conf), conf);
  await page.click('#confirm-yes');
  await page.waitForTimeout(300);
  check('la semana queda cerrada', await page.evaluate(() => currentInv.cerrado === true));
  check('cerrada, ya no deja escribir', await page.isDisabled('.cnt[data-p="malta"][data-k="b"]'));

  // ---------- 11) el mensaje de WhatsApp ----------
  await page.evaluate(() => { window.__wa = []; window.open = u => { window.__wa.push(u); return null; }; });
  await page.click('#inv-wa');
  await page.waitForTimeout(250);
  const wa = decodeURIComponent((await page.evaluate(() => window.__wa[0])).replace('https://wa.me/?text=', ''));
  check('el mensaje va por secciones', wa.includes('*BEBIDAS*') && wa.includes('*POLLO Y CARNES*'));
  check('con lo que debería quedar y lo contado', /Refrescos de 1L: debería quedar .* · contado/.test(wa), wa.slice(0, 200));
  check('no lista lo que no se tocó', !wa.includes('Tenta té limón 500ml'));

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errores.length ? errores : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errores.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
