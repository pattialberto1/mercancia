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
    pesadas: [{ peso: 476.2, cestas: 20, ts: 1 }] },
  // lo que llega contado: 25 bultos de refresco de 1L y 38 postres redondos
  { id: 'rr1', tipo: 'refresco_1l', fecha: lunes, creada: 1, mod: 1, cerrada: true,
    tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, cestasVacias: 0,
    pesadas: [{ peso: 150, cestas: 0, ts: 1 }] },
  { id: 'rpo', tipo: 'postre_redondo', fecha: lunes, creada: 1, mod: 1, cerrada: true,
    tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, cestasVacias: 0,
    pesadas: [{ peso: 38, cestas: 0, ts: 1 }] },
  // 5 bultos de Tenta té durazno: 5 × 12 = 60
  { id: 'rtt', tipo: 'tenta_te', fecha: lunes, creada: 1, mod: 1, cerrada: true,
    tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, cestasVacias: 0,
    pesadas: [{ peso: 60, cestas: 0, ts: 1, emp: 'bulto', cant: 5 }] }
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
  check('están los 48 renglones del conteo', n === 48, n);
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
  // agrupar un producto ya guardado no puede perder su inicial
  const doblado = await page.evaluate(() =>
    porClaveDeCuadre({ lipton_durazno: 22, lipton_limon: 15, lipton_verde: 27, malta: 111 }));
  check('un inicial guardado por sabor se dobla sobre su grupo', doblado.lipton === 64, doblado);
  check('y lo que no es de grupo se queda como está', doblado.malta === 111, doblado);

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

  // lo que faltó en el último conteo no se pierde al cambiar de semana
  const pend = await page.evaluate(() => calcular(currentInv).find(f => f.clave === 'ref_1l'));
  check('la semana anterior contó 60 y cuadraba, así que no arrastra nada', pend.pendiente === 0, pend.pendiente);
  await page.evaluate(() => {
    /* En la semana cerrada contaron 54 cuando el sistema decía 60, y se
       decidió seguir con los 60 porque los 6 podían estar en la nevera.
       Esos 6 tienen que seguir avisando. */
    const previa = db.inventarios.find(i => i.cerrado);
    previa.conteoDet.r1_cocacola = { b: '9', u: '' };
    currentInv.inicialManual = { ref_1l: 60 };
    touch(previa); touch(currentInv); save(false); renderInv();
  });
  await page.waitForTimeout(300);
  const pend2 = await page.evaluate(() => calcular(currentInv).find(f => f.clave === 'ref_1l'));
  check('si faltaban 6 la semana pasada, siguen a la vista', pend2.pendiente === 6, pend2);
  check('y la fila lo dice, con la fecha del conteo',
    /Del conteo del .* faltan/.test(await page.textContent('#inv-lista')));
  check('y cuenta como faltante en el resumen de arriba, aunque no se haya contado hoy',
    /1\s*faltan/.test((await page.textContent('#inv-resumen')).replace(/\s+/g, ' ')),
    (await page.textContent('#inv-resumen')).replace(/\s+/g, ' '));
  await page.evaluate(() => {
    const previa = db.inventarios.find(i => i.cerrado);
    previa.conteoDet.r1_cocacola = { b: '10', u: '' };
    currentInv.inicialManual = {};
    touch(previa); touch(currentInv); save(false); renderInv();
  });
  await page.waitForTimeout(300);

  // una corrección a mano manda sobre lo que se arrastra del cierre
  await page.evaluate(() => {
    currentInv.inicialManual = { ref_1l: 416 };
    touch(currentInv); save(false); renderInv();
  });
  await page.waitForTimeout(250);
  const rebase = await f('ref_1l');
  check('un inicial puesto a mano gana al arrastrado', rebase.inicial === 416, rebase.inicial);
  check('y la fila dice que es a mano',
    (await page.textContent('#inv-lista')).includes('puesto a mano'));
  const papasSigue = await f('papas');
  check('pero los demás renglones siguen con lo suyo', papasSigue.inicial === 80, papasSigue.inicial);
  await page.evaluate(() => { currentInv.inicialManual = {}; touch(currentInv); save(false); renderInv(); });
  await page.waitForTimeout(200);

  // ---------- 5) lo recibido entra solo ----------
  const pollo = await f('pollo');
  check('50 cestas recibidas son 7.200 piezas', pollo.recibido === 7200, pollo.recibido);
  const papas = await f('papas');
  check('las papas entran en neto, con la tara descontada', Math.abs(papas.recibido - 430.2) < 0.01, papas.recibido);
  const r1rec = await f('ref_1l');
  check('25 bultos de refresco de 1L son 150 unidades', r1rec.recibido === 150, r1rec.recibido);
  const postrec = await f('postre_paolo');
  check('los postres llegan contados, sin tara que descontar', postrec.recibido === 38, postrec.recibido);
  check('y se miden en unidades, no en kilos', postrec.unidad === 'unidades', postrec.unidad);
  check('lo que sí se pesa sigue en kilos', papas.unidad === 'kg', papas.unidad);
  // antes no había por dónde recibir estos cuatro y lo que llegaba salía como sobrante
  const tt = await f('tenta_te');
  check('5 bultos de Tenta té son 60 unidades en el cuadre', tt.recibido === 60, tt.recibido);
  const recibibles = await page.evaluate(() =>
    ['gatorade', 'jugo_barinas', 'lipton', 'tenta_te'].filter(t => TABS.unidades.tipos.includes(t)));
  check('y los cuatro tienen su botón en Bebidas y otros', recibibles.length === 4, recibibles);
  check('todos vienen en bultos de doce',
    await page.evaluate(() => ['gatorade', 'jugo_barinas', 'lipton', 'tenta_te']
      .every(t => empaqueDe(t, 'bulto').unidades === 12)));

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

  // ---------- 7b) lo de las neveras de abajo, que no viene por sabor ----------
  const nevera = async (clave, v) => {
    await page.fill(`.nev[data-c="${clave}"]`, String(v));
    await page.dispatchEvent(`.nev[data-c="${clave}"]`, 'change');
    await page.waitForTimeout(150);
  };
  await nevera('ref_1l', 68);
  const gn = await f('ref_1l');
  check('lo de la nevera se suma a lo contado arriba (694 + 68)', gn.conteo === 694 + 68, gn.conteo);
  check('y el total sale sumado en pantalla',
    (await page.textContent('#inv-lista')).includes('Contado en total: 762'));
  // algo que solo está en la nevera cuenta igual
  await nevera('jugo_barinas', 40);
  const jn = await f('jugo_barinas');
  // contar solo la nevera no es cuadrar: sirve para deducir cuánto hay arriba
  check('la nevera sola no da diferencia', jn.diferencia === null, jn.diferencia);
  check('y si no se sabe lo que había, sale negativo y lo dice',
    jn.arribaSistema === -40 && (await page.textContent('#inv-lista')).includes('falta cargar entradas'), jn);
  // las papas sí tienen de dónde: 80 que había + 430,2 recibidas − 52,5 vendidas
  await nevera('papas', 10);
  const pn = await f('papas');
  check('con la nevera contada, dice cuánto debería haber arriba (457,7 − 10)',
    Math.abs(pn.arribaSistema - 447.7) < 0.01, pn.arribaSistema);
  check('y lo pone en la pantalla, que es con lo que se pide',
    (await page.textContent('#inv-lista')).includes('arriba debería haber'));
  await nevera('papas', '');
  await nevera('jugo_barinas', '');
  const jn2 = await f('jugo_barinas');
  check('y borrarla lo deja otra vez sin contar', jn2.conteo === null, jn2.conteo);

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

  // ---------- 7c) el consumo interno de los vales ----------
  // Lo que se llevan los empleados no pasa por la caja, pero sale igual.
  const antesInt = await f('ref_1l');
  await page.evaluate(d => {
    currentInv.interno = [
      { fecha: d, nombre: 'Refresco de 1 litro', cantidad: 3 },
      { fecha: d, nombre: 'Combo 2 de pollo',    cantidad: 2 },   // lleva refresco
      { fecha: d, nombre: 'Desperdicios',        cantidad: 5 },   // no es mercancía
      { fecha: d, nombre: 'Pastelito de no sé qué', cantidad: 1 } // sin equivalencia
    ];
    touch(currentInv); save(false); renderInv();
  }, lunes);
  await page.waitForTimeout(250);
  const conInt = await f('ref_1l');
  check('los vales descuentan el refresco suelto y el del combo (5)',
    conInt.interno === 5 && conInt.esperado === antesInt.esperado - 5, [conInt.interno, antesInt.esperado, conInt.esperado]);
  const polloInt = await f('pollo');
  check('y el pollo de ese combo (2 × 4 piezas)', polloInt.interno === 8, polloInt.interno);
  check('«Desperdicios» no descuenta nada, que es un cobro',
    !(await page.textContent('#inv-msg')).includes('Desperdicios'));
  check('pero lo que no se reconoce sí se avisa',
    (await page.textContent('#inv-msg')).includes('Pastelito'));
  check('y la fila enseña el consumo interno aparte de lo vendido',
    (await page.textContent('#inv-lista')).includes('vales'));
  await page.evaluate(() => { currentInv.interno = []; touch(currentInv); save(false); renderInv(); });
  await page.waitForTimeout(200);

  // ---------- 8b) el día del conteo ----------
  // Contaron el martes; lo que se vendió el miércoles seguía en el estante
  // cuando contaron, así que no puede salir como sobrante.
  await page.evaluate(d => {
    currentInv.reportes = [
      { desde: d.mar, hasta: d.mar, renglones: [{ codigo: '1617', descripcion: 'MALTA BOTELLA', cantidad: 4 }] },
      { desde: d.mie, hasta: d.mie, renglones: [{ codigo: '1617', descripcion: 'MALTA BOTELLA', cantidad: 9 }] }
    ];
    recalcularVentas(currentInv); currentInv.fechaConteo = null;
    touch(currentInv); save(false); renderInv();
  }, { mar: mas(lunes, 1), mie: mas(lunes, 2) });
  await page.waitForTimeout(250);
  const m0 = await f('malta');
  check('sin decir el día, cuadra contra toda la semana', m0.alContar === m0.esperado, m0);

  await page.fill('#inv-fecha', mas(lunes, 1));
  await page.dispatchEvent('#inv-fecha', 'change');
  await page.waitForTimeout(250);
  const m1 = await f('malta');
  check('la semana sigue enseñando sus 13 vendidas, no 4', m1.vendido === 13, m1.vendido);
  check('pero se compara con lo que debía haber el martes', m1.alContar === m1.esperado + 9, m1);
  check('y el sobrante baja justo lo que se vendió el miércoles (9)',
    m0.diferencia - m1.diferencia === 9, [m0.diferencia, m1.diferencia]);
  check('la línea dice contra qué día compara',
    (await page.textContent('#inv-lista')).includes('cuando debía haber'));
  check('la pantalla dice a qué día está hecho el cuadre',
    /El cuadre de arriba está hecho al/.test(await page.textContent('#inv-msg')));
  check('pero lo que queda al cerrar sigue descontando el resto de la semana',
    m1.alCerrar === 111 - 9, m1.alCerrar);

  /* Contar el miércoles al abrir no es lo mismo que contarlo al cerrar: a
     un conteo de la mañana no se le pueden restar las ventas de ese día. */
  await page.fill('#inv-fecha', mas(lunes, 2));
  await page.dispatchEvent('#inv-fecha', 'change');
  await page.waitForTimeout(200);
  await page.click('#inv-momento button[data-m="abrir"]');
  await page.waitForTimeout(250);
  const mAbrir = await f('malta');
  check('contando al abrir, el miércoles no descuenta', mAbrir.alContar === m1.alContar, [mAbrir.alContar, m1.alContar]);
  check('y la línea lo dice', (await page.textContent('#inv-lista')).includes('al abrir'));
  await page.click('#inv-momento button[data-m="cerrar"]');
  await page.waitForTimeout(250);
  const mCerrar = await f('malta');
  check('al cerrar sí descuenta el día entero', mCerrar.alContar === mAbrir.alContar - 9, [mCerrar.alContar, mAbrir.alContar]);

  await page.fill('#inv-fecha', mas(lunes, 6));
  await page.dispatchEvent('#inv-fecha', 'change');
  await page.waitForTimeout(250);
  await page.evaluate(() => { currentInv.reportes = []; recalcularVentas(currentInv); touch(currentInv); save(false); renderInv(); });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    currentInv.ventas = [
      { codigo: '1523', descripcion: 'COMBO 3 POLLO', cantidad: 100 },
      { codigo: '1521', descripcion: 'COMBO 2 POLLO', cantidad: 50 },
      { codigo: '1535', descripcion: 'REF. 1L COCA COLA', cantidad: 30 },
      { codigo: '1617', descripcion: 'MALTA BOTELLA', cantidad: 12 },
      { codigo: '1562', descripcion: 'DELIVERY 1', cantidad: 40 }
    ];
    touch(currentInv); save(false); renderInv();
  });
  await page.waitForTimeout(250);

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

  // ---------- 12) el mensaje corto de lo que falta ----------
  await page.evaluate(() => { window.__wa = []; });
  await page.click('#inv-wa-faltan');
  await page.waitForTimeout(250);
  const falta = decodeURIComponent((await page.evaluate(() => window.__wa[0] || '')).replace('https://wa.me/?text=', ''));
  check('manda un mensaje aparte solo con lo que falta', /REVISAR EN EL NEGOCIO/.test(falta), falta.slice(0, 120));
  check('dice de qué día es el conteo', falta.includes('Conteo del'), falta.slice(0, 120));
  check('nombra el pollo, que es lo que falta', /Pollo \(piezas\).*faltan/.test(falta), falta);
  check('con lo que debía haber y lo contado', /debía haber .* · contado/.test(falta), falta);
  check('y no mete lo que cuadra ni lo que sobra',
    !falta.includes('Refrescos de 1L') && !falta.includes('Malta'), falta);

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errores.length ? errores : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errores.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
