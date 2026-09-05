// Un renglón de factura puede apuntarse a un producto del inventario.
//
// Es la única vía de entrada de lo que solo está en la hoja del local: esos
// productos no se pesan ni se cuentan en una recepción. El caso real es la
// nota de entrega de Alimentos Natropic del 1/9/2026: «Base de Salsa de Tomate
// 3,80 Kg», 8 cajas de 4 paquetes cada una = 32 paquetes.
//
// También se comprueban los tamaños de bulto que confirmó Alberto el 2/9.
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

const INVENTARIOS = [
  { id: 'f1', tipo: 'fisico', semanaInicio: '2026-08-31', semanaFin: '2026-08-31',
    creada: 1, mod: 1, cerrado: true, ventas: [], conteo: {}, inicialManual: {},
    fisico: {
      arroz_mary: { b: '70', u: '' },                    // 70 × 24 sacos
      ajinomoto: { b: '2', u: '0,5' },                   // 2 × 25 kg + 0,5
      tina_salsera_1oz_occidente: { b: '8', u: '' },     // 8 × 1.000
      vasos_v67: { b: '2', u: '8' },                     // 2 × 25 + 8 paquetes
      salsa_de_tomate_mayo_3_8kg: { b: '', u: '6' }
    } },
  { id: 't1', semanaInicio: '2026-09-01', semanaFin: '2026-09-05',
    creada: 2, mod: 2, cerrado: false, conteo: {}, inicialManual: {},
    ventas: [{ codigo: '1519', descripcion: 'COMBO 1 POLLO', cantidad: 1 }] }
];

(async () => {
  await new Promise(r => server.listen(8997, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.addInitScript(([invs]) => {
    localStorage.setItem('mercancia.pin', '7070');
    localStorage.setItem('mercancia.v1', JSON.stringify({
      v: 2, settings: { tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, syncToken: '', apiKey: '',
        articulosActivos: ['pollo_pieza'], proveedores: ['Tierra Santa', 'Alimentos Natropic'] },
      recepciones: [], facturas: [], inventarios: JSON.parse(invs), borradas: {}
    }));
  }, [JSON.stringify(INVENTARIOS)]);

  await page.goto('http://localhost:8997/');
  await page.waitForTimeout(400);

  // ---------- 1) los tamaños de bulto vienen puestos de fábrica ----------
  const pb = await page.evaluate(() => ({
    arroz: porBultoDe(articulo('f_arroz_mary')),
    ajinomoto: porBultoDe(articulo('f_ajinomoto')),
    salsera: porBultoDe(articulo('f_tina_salsera_1oz_occidente')),
    vasos: porBultoDe(articulo('f_vasos_v67')),
    uArroz: articulo('f_arroz_mary').unidad,
    uVasos: articulo('f_vasos_v67').unidad,
    uAji: articulo('f_ajinomoto').unidad
  }));
  check('arroz Mary: 1 bulto = 24 sacos', pb.arroz === 24 && pb.uArroz === 'sacos', pb);
  check('ajinomoto: 1 bulto = 25 kg', pb.ajinomoto === 25 && pb.uAji === 'kg', pb);
  check('tina salsera 1oz: 1 bulto = 1.000 unidades', pb.salsera === 1000, pb);
  check('vasos V67: 1 bulto = 25 paquetes', pb.vasos === 25 && pb.uVasos === 'paquetes', pb);

  // los que estaban escritos en las observaciones de la hoja de agosto
  const obs = await page.evaluate(() => {
    const g = id => porBultoDe(articulo('f_' + id));
    return { ct1: g('ct1_envases'), ct2: g('ct2_envases'), ct3: g('ct3_envases'),
             bbq: g('salsa_bbq'), vinagre: g('vinagre_sansone'), portumesa: g('aceite_portumesa'),
             sesamo: g('aceite_humo_sesamo_5l'), azucar: g('azucar_dulceria_blanca'),
             salsa: g('salsa_de_tomate_mayo_3_8kg'),
             // estos NO deben estar puestos: no se sabe o hay conflicto
             platosN10: g('platos_n10'), tapa: g('tapa_de_tina_de_ensalada'),
             platosN9: g('platos_n9'), harina: g('harina_pan') };
  });
  check('CT1, CT2 y CT3 salen de la hoja: 88, 105 y 90',
    obs.ct1 === 88 && obs.ct2 === 105 && obs.ct3 === 90, obs);
  check('salsa BBQ 24, vinagre 4, Portumesa 12, sésamo 4, azúcar dulcería 15 kg',
    obs.bbq === 24 && obs.vinagre === 4 && obs.portumesa === 12 && obs.sesamo === 4 && obs.azucar === 15, obs);
  check('la salsa de tomate de 3,8kg: 1 bulto = 4 paquetes', obs.salsa === 4, obs);
  check('los dos platos van a 200 por bulto, como confirmó Alberto',
    obs.platosN10 === 200 && obs.platosN9 === 200, obs);
  check('la tapa de tina sigue sin ponerse: nadie ha dicho qué trae su bulto',
    !obs.tapa, obs.tapa);
  check('ni la Harina Pan: «de 2 kg» es lo que pesa, no cuántas trae la caja', !obs.harina, obs.harina);

  // ---------- 2) y ya traducen la hoja sin preguntar nada ----------
  const ini = await page.evaluate(() => {
    const b = baseInicial(db.inventarios.find(i => i.id === 't1'));
    return { arroz: b.valores.f_arroz_mary, aji: b.valores.f_ajinomoto,
             salsera: b.valores.f_tina_salsera_1oz_occidente, vasos: b.valores.f_vasos_v67,
             avisos: Object.keys(b.avisos) };
  });
  check('70 bultos de arroz Mary son 1.680 sacos', ini.arroz === 1680, ini.arroz);
  check('2 bultos y medio kilo de ajinomoto son 50,5 kg', ini.aji === 50.5, ini.aji);
  check('8 bultos de tina salsera son 8.000', ini.salsera === 8000, ini.salsera);
  check('2 bultos y 8 paquetes de vasos V67 son 58 paquetes', ini.vasos === 58, ini.vasos);
  check('ninguno de los cuatro sigue pidiendo el tamaño del bulto',
    !ini.avisos.some(k => /arroz_mary|ajinomoto|salsera|vasos_v67/.test(k)), ini.avisos);

  // ---------- 3) la nota de entrega de Natropic, tal cual ----------
  await page.click('#home-tabs button[data-t="tierrasanta"]');
  await page.click('#btn-new');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    currentFac.proveedor = 'Alimentos Natropic';
    currentFac.fecha = '2026-09-01';
    currentFac.numero = '8483';
    currentFac.moneda = '$';
    touch(currentFac); save(); renderFac();
  });
  await page.click('#fac-add');
  await page.waitForTimeout(300);
  await page.fill('#ln-nombre', 'Base de Salsa de Tomate 3,80 Kg');
  await page.fill('#ln-cant', '8');
  await page.fill('#ln-unidad', 'Cajas');
  await page.fill('#ln-precio', '25,08');
  await page.waitForTimeout(150);
  check('el importe se calcula solo: 8 × 25,08 = 200,64',
    (await page.inputValue('#ln-importe')) === '200,64', await page.inputValue('#ln-importe'));

  // el selector de producto
  const opciones = await page.$$eval('#ln-art option', os => os.length);
  check('se puede elegir cualquier producto del inventario', opciones > 200, opciones);
  check('y por defecto no entra a ninguno', (await page.inputValue('#ln-art')) === '');

  await page.selectOption('#ln-art', 'f_salsa_de_tomate_mayo_3_8kg');
  await page.waitForTimeout(250);
  check('como ya se sabe su bulto, ofrece meter la cantidad en bultos',
    await page.isVisible('#ln-bultos-campo'));
  check('y recuerda cuánto trae un bulto',
    /1 bulto = 4 unidades/i.test(await page.textContent('#ln-bultos-lbl')),
    await page.textContent('#ln-bultos-lbl'));

  await page.click('#ln-save');
  await page.waitForTimeout(300);
  check('el renglón queda guardado apuntando a su producto', await page.evaluate(() =>
    currentFac.lineas[0].art === 'f_salsa_de_tomate_mayo_3_8kg' && currentFac.lineas[0].cantidad === 8));

  // ---------- 4) entra al inventario ----------
  let rec = await page.evaluate(() => {
    const t = db.inventarios.find(i => i.id === 't1');
    const f = calcular(t).find(x => x.art.id === 'f_salsa_de_tomate_mayo_3_8kg');
    return { recibido: f.recibido, inicial: f.inicial, esperado: f.esperado };
  });
  check('marcado en unidades entran las 8 cajas tal cual', rec.recibido === 8, rec);

  // ---------- 5) diciendo que un bulto trae 4 paquetes ----------
  await page.evaluate(() => { currentFac.lineas[0].enBultos = true; touch(currentFac); save(); });
  rec = await page.evaluate(() => {
    const t = db.inventarios.find(i => i.id === 't1');
    const f = calcular(t).find(x => x.art.id === 'f_salsa_de_tomate_mayo_3_8kg');
    return { recibido: f.recibido, inicial: f.inicial, esperado: f.esperado };
  });
  check('8 bultos de 4 paquetes son 32 paquetes', rec.recibido === 32, rec);
  check('el inicial de la hoja sigue siendo 6', rec.inicial === 6, rec);
  check('y debería quedar 6 + 32 = 38', rec.esperado === 38, rec);

  // ---------- 6) el IVA, que la app no tenía ----------
  // la factura de Yaru del 3/9: 230,39 de renglones + 36,86 de IVA = 267,25
  await page.evaluate(() => {
    currentFac.iva = 36.86; currentFac.totalFactura = 267.25;
    currentFac.lineas = [
      { nombre: 'GATORADE TROPICAL PET 500ML', cantidad: 3, unidad: 'CJ', precio: 18.3103, importe: 54.93 },
      { nombre: 'LIPTON DURAZNO PET 500MLX12UN', cantidad: 3, unidad: 'CJ', precio: 17.0517, importe: 51.16 },
      { nombre: 'LIPTON TE VERDE PET 500MLX12UN', cantidad: 2, unidad: 'CJ', precio: 17.0517, importe: 34.10 },
      { nombre: 'LIPTON LIMON PET 500MLX12UN', cantidad: 2, unidad: 'CJ', precio: 17.0517, importe: 34.10 },
      { nombre: 'YUKYPAK DURAZNO LD250 X 24UND', cantidad: 2, unidad: 'CJ', precio: 18.6983, importe: 37.40 },
      { nombre: 'YUKYPAK MANZANA LD250 X 24UND', cantidad: 1, unidad: 'CJ', precio: 18.6983, importe: 18.70 }
    ];
    touch(currentFac); save(); renderFac();
  });
  await page.waitForTimeout(300);
  const iva = await page.evaluate(() => ({
    base: facBase(currentFac), total: facTotal(currentFac),
    aviso: document.getElementById('fac-aviso').textContent.trim()
  }));
  check('los renglones suman la base: 230,39', iva.base === 230.39, iva);
  check('el total a pagar lleva el IVA: 267,25', iva.total === 267.25, iva);
  check('y no avisa de nada, porque cuadra', iva.aviso === '', iva.aviso);
  check('la pantalla enseña base, IVA y total a pagar',
    (await page.textContent('#fac-t-base')).includes('230,39') &&
    (await page.textContent('#fac-t-iva')).includes('36,86') &&
    (await page.textContent('#fac-t-total')).includes('267,25'));

  // los céntimos de redondeo del propio papel no son un error
  await page.evaluate(() => { currentFac.totalFactura = 267.28; touch(currentFac); save(); renderFac(); });
  await page.waitForTimeout(250);
  check('3 céntimos en 6 renglones se admiten: es el redondeo del papel',
    (await page.textContent('#fac-aviso')).trim() === '');
  await page.evaluate(() => { currentFac.totalFactura = 300; touch(currentFac); save(); renderFac(); });
  await page.waitForTimeout(250);
  check('una diferencia de verdad sí avisa',
    /renglones más el IVA dan/.test(await page.textContent('#fac-aviso')),
    await page.textContent('#fac-aviso'));

  // se deja como estaba para lo que viene
  await page.evaluate(() => {
    currentFac.iva = null; currentFac.totalFactura = null;
    currentFac.lineas = [{ nombre: 'Base de Salsa de Tomate 3,80 Kg', cantidad: 8, unidad: 'Cajas',
                           precio: 25.08, importe: 200.64, art: 'f_salsa_de_tomate_mayo_3_8kg', enBultos: true }];
    touch(currentFac); save();
  });

  // ---------- 7) nada se cuenta dos veces ----------
  const dob = await page.evaluate(() => {
    // un renglón apuntado a mano no debe volver a contarse por su nombre
    db.facturas[0].lineas.push({ nombre: 'CILANTRO', cantidad: 3, unidad: 'kg', precio: 1, importe: 3 });
    save();
    const t = db.inventarios.find(i => i.id === 't1');
    const f = calcular(t).find(x => x.art.id === 'f_salsa_de_tomate_mayo_3_8kg');
    return f.recibido;
  });
  check('el renglón apuntado no se suma otra vez por el nombre', dob === 32, dob);

  // ---------- cierre ----------
  console.log('');
  for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.desc);
  console.log('\nerrores JS: ' + (errors.length ? errors.join(' | ') : 'ninguno'));
  const malos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (malos ? malos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(malos || errors.length ? 1 : 0);
})();
