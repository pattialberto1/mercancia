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
      refresco_coca_cola_1l: { b: '10', u: '2' },        // 10 × 6 + 2 = 62
      malta_botella: { b: '2', u: '31' },                // 2 × 36 + 31 = 103
      agua_glacier_550ml: { b: '4', u: '20' },           // 4 × 24 + 20 = 116
      agua_minalba_1_5l: { b: '', u: '6' }
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
        articulosActivos: ['pollo_pieza'], controlSimplificado: 1,
        proveedores: ['Tierra Santa', 'Alimentos Natropic'] },
      recepciones: [], facturas: [], inventarios: JSON.parse(invs), borradas: {}
    }));
  }, [JSON.stringify(INVENTARIOS)]);

  await page.goto('http://localhost:8997/');
  await page.waitForTimeout(400);

  /* ---------- 1) los tamaños de bulto vienen puestos de fábrica ----------
     La hoja se estrechó el 10/9 a bebidas, pollo, papas y lumpias, así que los
     bultos que se comprueban son los de lo que quedó. */
  const pb = await page.evaluate(() => ({
    ref1l: porBultoDe(articulo('ref_1l')),
    ref15l: porBultoDe(articulo('ref_15l')),
    agua: porBultoDe(articulo('agua')),
    glacier: porBultoDe(articulo('agua_glacier')),
    malta: porBultoDe(articulo('malta')),
    yuky: porBultoDe(articulo('yuky')),
    gatorade: porBultoDe(articulo('gatorade')),
    pollo: porBultoDe(articulo('pollo_pieza'))
  }));
  check('refresco de 1L: 1 bulto = 6', pb.ref1l === 6, pb);
  check('el de 1,5L: 12', pb.ref15l === 12, pb);
  check('las dos aguas: 24', pb.agua === 24 && pb.glacier === 24, pb);
  check('malta 36 y yuky-pack 24', pb.malta === 36 && pb.yuky === 24, pb);
  check('Gatorade 12', pb.gatorade === 12, pb);
  check('y el del pollo sale del rendimiento de la cesta: 160 piezas', pb.pollo === 160, pb);

  /* El tamaño del bulto se pregunta por RENGLÓN de la hoja y solo después por
     artículo: varios renglones pueden ir al mismo artículo con bultos
     distintos, como el Lipton (12 por caja) frente al Tenta té, que nadie ha
     dicho qué trae. */
  const obs = await page.evaluate(() => {
    const g = id => {
      const it = catalogoFisico().flatMap(g => g.items).find(x => x.id === id);
      return porBultoFisico(it, articulo(it.art));
    };
    return { durazno: g('te_lipton_durazno'), limon: g('te_lipton_limon'), verde: g('te_verde_lipton'),
             minalba15: g('agua_minalba_1_5l'), tropical: g('gatorade_de_tropical'),
             // este NO debe estar puesto: nadie ha dicho qué trae su bulto
             tenta: g('tenta_te_durazno_1l') };
  });
  check('los tres Lipton salen de la factura de Yaru: 12 por caja',
    obs.durazno === 12 && obs.limon === 12 && obs.verde === 12, obs);
  check('el agua Minalba de 1,5L: 12', obs.minalba15 === 12, obs);
  check('el Gatorade tropical conserva el suyo aunque vaya al montón', obs.tropical === 12, obs);
  check('el Tenta té sigue sin ponerse: nadie ha dicho qué trae su bulto', !obs.tenta, obs.tenta);

  // ---------- 2) y ya traducen la hoja sin preguntar nada ----------
  const ini = await page.evaluate(() => {
    const b = baseInicial(db.inventarios.find(i => i.id === 't1'));
    return { ref: b.valores.ref_1l, malta: b.valores.malta, glacier: b.valores.agua_glacier,
             avisos: Object.keys(b.avisos) };
  });
  check('10 bultos y 2 sueltas de Coca-Cola son 62 refrescos', ini.ref === 62, ini.ref);
  check('2 bultos y 31 sueltas de malta son 103', ini.malta === 103, ini.malta);
  check('4 bultos y 20 sueltas de Glacier son 116', ini.glacier === 116, ini.glacier);
  check('ninguno sigue pidiendo el tamaño del bulto',
    !ini.avisos.some(k => /ref_1l|malta|glacier/.test(k)), ini.avisos);

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
  check('se puede elegir cualquier producto del inventario', opciones > 15, opciones);
  check('y por defecto no entra a ninguno', (await page.inputValue('#ln-art')) === '');

  await page.selectOption('#ln-art', 'f_agua_minalba_1_5l');
  await page.waitForTimeout(250);
  check('como ya se sabe su bulto, ofrece meter la cantidad en bultos',
    await page.isVisible('#ln-bultos-campo'));
  check('y recuerda cuánto trae un bulto',
    /1 bulto = 12 unidades/i.test(await page.textContent('#ln-bultos-lbl')),
    await page.textContent('#ln-bultos-lbl'));

  await page.click('#ln-save');
  await page.waitForTimeout(300);
  check('el renglón queda guardado apuntando a su producto', await page.evaluate(() =>
    currentFac.lineas[0].art === 'f_agua_minalba_1_5l' && currentFac.lineas[0].cantidad === 8));

  // ---------- 4) entra al inventario ----------
  let rec = await page.evaluate(() => {
    const t = db.inventarios.find(i => i.id === 't1');
    const f = calcular(t).find(x => x.art.id === 'f_agua_minalba_1_5l');
    return { recibido: f.recibido, inicial: f.inicial, esperado: f.esperado };
  });
  check('marcado en unidades entran las 8 cajas tal cual', rec.recibido === 8, rec);

  // ---------- 5) diciendo que un bulto trae 4 paquetes ----------
  await page.evaluate(() => { currentFac.lineas[0].enBultos = true; touch(currentFac); save(); });
  rec = await page.evaluate(() => {
    const t = db.inventarios.find(i => i.id === 't1');
    const f = calcular(t).find(x => x.art.id === 'f_agua_minalba_1_5l');
    return { recibido: f.recibido, inicial: f.inicial, esperado: f.esperado };
  });
  check('8 bultos de 12 son 96 unidades', rec.recibido === 96, rec);
  check('el inicial de la hoja sigue siendo 6', rec.inicial === 6, rec);
  check('y debería quedar 6 + 96 = 102', rec.esperado === 102, rec);

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
                           precio: 25.08, importe: 200.64, art: 'f_agua_minalba_1_5l', enBultos: true }];
    touch(currentFac); save();
  });

  // ---------- 7) nada se cuenta dos veces ----------
  const dob = await page.evaluate(() => {
    // un renglón apuntado a mano no debe volver a contarse por su nombre
    db.facturas[0].lineas.push({ nombre: 'CILANTRO', cantidad: 3, unidad: 'kg', precio: 1, importe: 3 });
    save();
    const t = db.inventarios.find(i => i.id === 't1');
    const f = calcular(t).find(x => x.art.id === 'f_agua_minalba_1_5l');
    return f.recibido;
  });
  check('el renglón apuntado no se suma otra vez por el nombre', dob === 96, dob);

  // ---------- cierre ----------
  console.log('');
  for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.desc);
  console.log('\nerrores JS: ' + (errors.length ? errors.join(' | ') : 'ninguno'));
  const malos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (malos ? malos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(malos || errors.length ? 1 : 0);
})();
