// El tramo semanal lleva TODOS los productos de la hoja del local, agrupados
// por las mismas categorías del papel y plegados, para que no sea una lista
// infinita. Lo que ya recoge un artículo del control no se repite (contarías
// dos veces el mismo refresco), y solo lo marcado en Ajustes obliga a cerrar.
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

const FISICO = {
  refresco_coca_cola_1l: { b: '10', u: '2' },        // 62 refrescos de 1L
  aceite_vatel_pro:      { b: '38', u: '' },          // solo bultos: falta el tamaño
  harina_pan:            { b: '1',  u: '3' },         // bultos y sueltas: falta el tamaño
  sal_refinada_monte_blanca: { b: '', u: '9' },       // solo unidades: entra tal cual
  mostaza:               { b: '',  u: '4' }
};
const INVENTARIOS = [
  { id: 'f1', tipo: 'fisico', semanaInicio: '2026-08-31', semanaFin: '2026-08-31',
    creada: 1, mod: 1, cerrado: true, ventas: [], conteo: {}, inicialManual: {}, fisico: FISICO },
  // con una venta cargada, que es lo que habilita el botón de cerrar la semana
  { id: 't1', semanaInicio: '2026-09-01', semanaFin: '2026-09-05',
    creada: 2, mod: 2, cerrado: false, conteo: {}, inicialManual: {},
    ventas: [{ codigo: '1519', descripcion: 'COMBO 1 POLLO', cantidad: 1 }] }
];
const ACTIVOS = ['pollo_pieza', 'ref_1l'];

(async () => {
  await new Promise(r => server.listen(8995, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.addInitScript(([invs, activos]) => {
    localStorage.setItem('mercancia.pin', '7070');
    localStorage.setItem('mercancia.v1', JSON.stringify({
      v: 2, settings: { tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, syncToken: '', apiKey: '',
        articulosActivos: JSON.parse(activos),
        porBulto: { ref_1l: 6, ref_15l: 12, ref_2l: 6, agua: 24, agua_glacier: 24, malta: 36, yuky: 24, huevos: 24 } },
      recepciones: [], facturas: [], inventarios: JSON.parse(invs), borradas: {}
    }));
  }, [JSON.stringify(INVENTARIOS), JSON.stringify(ACTIVOS)]);

  await page.goto('http://localhost:8995/');
  await page.waitForTimeout(400);
  await page.evaluate(() => abrirInv('t1'));
  await page.waitForTimeout(500);

  // ---------- 1) no falta ningún producto de la hoja ----------
  const cob = await page.evaluate(() => {
    const filas = calcular(currentInv);
    const ids = new Set(filas.map(f => f.art.id));
    const sinSitio = [];
    for (const g of catalogoFisico())
      for (const it of g.items) if (!ids.has(it.art)) sinSitio.push(it.nombre);
    return { total: filas.length, renglones: catalogoFisico().reduce((s, g) => s + g.items.length, 0), sinSitio };
  });
  check('los 242 renglones de la hoja tienen su sitio en el tramo',
    cob.sinSitio.length === 0, cob.sinSitio.slice(0, 5));
  check('y el tramo no es una copia de la hoja: los sabores se agrupan',
    cob.total < cob.renglones, cob);

  // ---------- 2) nada se cuenta dos veces ----------
  const dobles = await page.evaluate(() => {
    const filas = calcular(currentInv);
    const vistos = {}, rep = [];
    for (const f of filas) { if (vistos[f.art.id]) rep.push(f.art.id); vistos[f.art.id] = 1; }
    return { rep, cocaSuelta: filas.some(f => /Coca-Cola 1L/.test(f.art.nombre)) };
  });
  check('ningún artículo sale repetido', dobles.rep.length === 0, dobles.rep);
  check('la Coca-Cola de 1L no sale aparte: la lleva «Refrescos de 1L»', !dobles.cocaSuelta);

  /* Lo que ya tenía artículo propio alimentado por el nombre del renglón de la
     factura (el aguacate, el tomate, el limón… de Tierra Santa) no puede salir
     además como producto de la hoja: uno se llevaría el inicial y el otro lo
     recibido, y el control diría cualquier cosa. */
  const dup = await page.evaluate(() => {
    const porNombre = ARTICULOS_TODOS.filter(a => a.entrada && a.entrada.tipo === 'factura');
    const ids = new Set(calcular(currentInv).map(f => f.art.id));
    return {
      cuantos: porNombre.length,
      // ninguno de ellos debe tener un gemelo generado desde la hoja
      gemelos: porNombre.map(a => 'f_' + a.id).filter(id => articulo(id) || ids.has(id)),
      // y los que sí recogen un renglón tienen que estar en el tramo
      fuera: porNombre.filter(a => Object.values(VINCULO_FISICO).includes(a.id) && !ids.has(a.id))
                      .map(a => a.id)
    };
  });
  check('hay artículos que se alimentan del nombre del renglón de la factura', dup.cuantos > 10, dup.cuantos);
  check('y ninguno tiene un gemelo generado desde la hoja', dup.gemelos.length === 0, dup.gemelos);
  check('los que recogen un renglón de la hoja están en el tramo', dup.fuera.length === 0, dup.fuera);

  // ---------- 3) el inicial de la hoja llega a todos, no solo al control ----------
  const ini = await page.evaluate(() => {
    const g = n => calcular(currentInv).find(f => f.art.nombre === n) || null;
    const r = {};
    for (const n of ['Refrescos de 1L', 'Sal refinada Monte Blanca', 'Mostaza', 'Aceite Vatel Pro', 'Harina Pan'])
      { const f = g(n); r[n] = f && { ini: f.inicial, de: f.origenInicial, aviso: !!f.avisoInicial, control: f.esControl }; }
    return r;
  });
  check('el refresco del control suma sus sabores (10 × 6 + 2 = 62)',
    ini['Refrescos de 1L'].ini === 62 && ini['Refrescos de 1L'].de === 'fisico', ini['Refrescos de 1L']);
  check('un producto de solo conteo también trae su inicial de la hoja',
    ini['Sal refinada Monte Blanca'].ini === 9 && ini['Sal refinada Monte Blanca'].de === 'fisico',
    ini['Sal refinada Monte Blanca']);
  check('y no lleva fórmula: es de solo conteo', ini['Mostaza'].control === false);
  check('un renglón en bultos sin saber qué trae el bulto no da número',
    ini['Aceite Vatel Pro'].de !== 'fisico' && ini['Aceite Vatel Pro'].aviso, ini['Aceite Vatel Pro']);

  // ---------- 4) decir el tamaño del bulto lo resuelve ahí mismo ----------
  await page.fill('#inv-buscar', 'harina pan');
  await page.waitForTimeout(300);
  const inp = await page.$('.inv-porbulto');
  check('la fila pide el dato que falta, en vez de quedarse muerta', !!inp);
  await inp.fill('12');
  await inp.dispatchEvent('change');
  await page.waitForTimeout(400);
  check('1 bulto = 12 → 1 × 12 + 3 = 15', await page.evaluate(() =>
    (calcular(currentInv).find(f => f.art.nombre === 'Harina Pan') || {}).inicial === 15));

  // ---------- 5) agrupado y plegado, no un scroll infinito ----------
  await page.fill('#inv-buscar', '');
  await page.waitForTimeout(300);
  const vista = await page.evaluate(() => ({
    grupos: [...document.querySelectorAll('.inv-grupo')].map(h => h.dataset.g),
    filas: document.querySelectorAll('.inv-art').length,
    total: calcular(currentInv).length
  }));
  check('sale un puñado de grupos, no cientos de filas',
    vista.grupos.length <= 12 && vista.filas < 30, vista);
  check('el control va primero y abierto', vista.grupos[0] === '⭐ Control de la semana');
  check('las categorías van en el orden del papel',
    vista.grupos[1] === 'Alimentos procesados y otros', vista.grupos.slice(0, 3));
  check('solo se pintan las filas del grupo abierto', vista.filas === 2, vista.filas);

  // abrir una categoría
  await page.click('.inv-grupo[data-g="Alimentos procesados y otros"]');
  await page.waitForTimeout(300);
  check('al tocar una categoría se abre y pinta sus filas',
    (await page.evaluate(() => document.querySelectorAll('.inv-art').length)) > 30);
  await page.click('.inv-grupo[data-g="Alimentos procesados y otros"]');
  await page.waitForTimeout(300);
  check('y al volver a tocarla se cierra',
    (await page.evaluate(() => document.querySelectorAll('.inv-art').length)) === 2);

  // ---------- 6) el buscador cruza todas las categorías ----------
  await page.fill('#inv-buscar', 'servilleta');
  await page.waitForTimeout(300);
  const busq = await page.evaluate(() => ({
    grupos: [...document.querySelectorAll('.inv-grupo')].map(h => h.dataset.g),
    filas: [...document.querySelectorAll('.inv-nom')].map(n => n.textContent.trim())
  }));
  check('buscando aparece lo que coincide, abierto y sin abrir nada a mano',
    busq.filas.length > 0 && busq.filas.every(n => /servilleta/i.test(n)), busq);
  await page.fill('#inv-buscar', 'zzzz');
  await page.waitForTimeout(300);
  check('si no hay nada que se llame así, lo dice',
    /Ningún producto se llama así/.test(await page.textContent('#inv-comparacion')));

  // ---------- 7) solo lo marcado en Ajustes obliga a cerrar ----------
  await page.fill('#inv-buscar', '');
  await page.waitForTimeout(200);
  await page.click('#inv-cerrar');
  await page.waitForTimeout(300);
  const toast1 = await page.textContent('#toast');
  check('para cerrar pide el conteo del control, no el de los 242',
    /Falta el conteo de/.test(toast1) && !/mostaza|aceite/i.test(toast1), toast1);
  check('y nombra justo lo marcado en Ajustes',
    /piezas de pollo/i.test(toast1) && /refrescos de 1l/i.test(toast1), toast1);

  // ---------- cierre ----------
  console.log('');
  for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.desc);
  console.log('\nerrores JS: ' + (errors.length ? errors.join(' | ') : 'ninguno'));
  const malos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (malos ? malos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(malos || errors.length ? 1 : 0);
})();
