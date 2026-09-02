// El inventario físico arranca el tramo siguiente.
//
// Antes, un físico cerrado con fecha anterior al tramo se tomaba por «la semana
// anterior» y se le pedía su conteo — que un físico nunca tiene. El inicial
// salía en CERO y la casilla quedaba bloqueada. Aquí se comprueba que ahora la
// hoja del local se traduce a los artículos del control, que lo que la hoja no
// cubre se sigue tecleando, y que un renglón que no se puede convertir lo dice
// en vez de dar un número corto.
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

// la hoja del local del 31/08, tal como se llena: bultos y sueltas por renglón
const FISICO = {
  // 10 bultos de 6 + 2 sueltas = 62 · 5 bultos de 6 = 30 → 92 refrescos de 1L
  refresco_coca_cola_1l: { b: '10', u: '2' },
  refresco_7up_1l:       { b: '5',  u: '' },
  // 17 cestas marinadas × 160 = 2.720 piezas. Los kg de la 2ª columna son la
  // misma mercancía pesada, no algo que se sume aparte.
  pollo_en_cestas_marinado: { b: '17', u: '238,5' },
  agua_minalba_600ml:    { b: '8',  u: '11' },      // 8 × 24 + 11 = 203
  papas_cestas:          { b: '',   u: '387,72' },  // en kg, la unidad del artículo
  // 2 cestas de repollo, pero nadie ha dicho cuántos kg trae una cesta
  repollo_blanco:        { b: '2',  u: '50' }
};

const INVENTARIOS = [
  { id: 'f1', tipo: 'fisico', semanaInicio: '2026-08-31', semanaFin: '2026-08-31',
    creada: 1, mod: 1, cerrado: true, ventas: [], conteo: {}, inicialManual: {}, fisico: FISICO },
  { id: 't1', semanaInicio: '2026-09-01', semanaFin: '2026-09-05',
    creada: 2, mod: 2, cerrado: false, ventas: [], conteo: {},
    inicialManual: { cebollin: 54.45, repollo_blanco: 99 } },
  // una semana ya cerrada, para comprobar que manda sobre el físico
  { id: 's0', semanaInicio: '2026-09-01', semanaFin: '2026-09-05',
    creada: 3, mod: 3, cerrado: true, ventas: [], conteo: { pollo_pieza: 999 }, inicialManual: {} },
  { id: 't2', semanaInicio: '2026-09-06', semanaFin: '2026-09-12',
    creada: 4, mod: 4, cerrado: false, ventas: [], conteo: {}, inicialManual: {} }
];

// lo que llegó hoy, dentro del tramo: 2 cestas de pollo y 24 refrescos de 1L
const RECEPCIONES = [
  { id: 'r1', tipo: 'pollo', fecha: '2026-09-01', creada: 1, mod: 1, cerrada: true,
    tara: 2.3, cestasVacias: 0, pesadas: [{ peso: 70, cestas: 2, ts: 1 }] },
  { id: 'r2', tipo: 'refresco_1l', fecha: '2026-09-02', creada: 1, mod: 1, cerrada: true,
    tara: 0, cestasVacias: 0, pesadas: [{ peso: 24, cestas: 0, ts: 1 }] }
];

const ACTIVOS = ['pollo_pieza', 'ref_1l', 'ref_15l', 'agua', 'papas', 'cebollin', 'repollo_blanco'];

(async () => {
  await new Promise(r => server.listen(8981, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.addInitScript(([invs, recs, activos]) => {
    localStorage.setItem('mercancia.pin', '7070');
    localStorage.setItem('mercancia.v1', JSON.stringify({
      v: 2, settings: { tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, syncToken: '', apiKey: '',
        articulosActivos: JSON.parse(activos),
        porBulto: { ref_1l: 6, ref_15l: 12, ref_2l: 6, agua: 24, agua_glacier: 24, malta: 36, yuky: 24, huevos: 24 } },
      recepciones: JSON.parse(recs), facturas: [],
      inventarios: JSON.parse(invs), borradas: {}
    }));
  }, [JSON.stringify(INVENTARIOS), JSON.stringify(RECEPCIONES), JSON.stringify(ACTIVOS)]);

  await page.goto('http://localhost:8981/');
  await page.waitForTimeout(400);

  const f = await page.evaluate(() => {
    const t1 = db.inventarios.find(i => i.id === 't1');
    const filas = calcular(t1);
    const map = {};
    for (const x of filas) map[x.art.id] = { ini: x.inicial, de: x.origenInicial, rec: x.recibido, esp: x.esperado, aviso: x.avisoInicial };
    return { map, tipo: baseInicial(t1).tipo, fuente: baseInicial(t1).fuente.semanaInicio };
  });

  // ---------- 1) el físico es el punto de partida ----------
  check('el tramo reconoce que parte de un inventario físico', f.tipo === 'fisico', f.tipo);
  check('y sabe de qué día es esa hoja', f.fuente === '2026-08-31', f.fuente);
  check('el inicial YA NO sale en cero', f.map.pollo_pieza.ini !== 0, f.map.pollo_pieza.ini);

  // ---------- 2) la hoja se traduce a los artículos del control ----------
  check('17 cestas marinadas son 2.720 piezas de pollo',
    f.map.pollo_pieza.ini === 2720 && f.map.pollo_pieza.de === 'fisico', f.map.pollo_pieza);
  check('los kg de la 2ª columna no se suman a las piezas', f.map.pollo_pieza.ini === 2720);
  check('varios sabores de refresco suman un solo artículo (62 + 30 = 92)',
    f.map.ref_1l.ini === 92 && f.map.ref_1l.de === 'fisico', f.map.ref_1l);
  check('8 bultos de agua + 11 sueltas = 203',
    f.map.agua.ini === 203 && f.map.agua.de === 'fisico', f.map.agua);
  check('las papas entran en kg, que es su unidad',
    f.map.papas.ini === 387.72 && f.map.papas.de === 'fisico', f.map.papas);

  // ---------- 3) lo recibido se suma encima del inicial de la hoja ----------
  check('2 cestas recibidas son 288 piezas', f.map.pollo_pieza.rec === 288, f.map.pollo_pieza.rec);
  check('el pollo espera 2.720 + 288 = 3.008', f.map.pollo_pieza.esp === 3008, f.map.pollo_pieza.esp);
  check('los refrescos esperan 92 + 24 = 116', f.map.ref_1l.esp === 116, f.map.ref_1l.esp);

  // ---------- 4) lo que la hoja no cubre se sigue tecleando ----------
  check('el cebollín, que la hoja no vincula, mantiene lo escrito a mano',
    f.map.cebollin.ini === 54.45 && f.map.cebollin.de === 'manual', f.map.cebollin);
  check('el refresco de 1,5L no está en la hoja: se queda sin inicial',
    f.map.ref_15l.de === null, f.map.ref_15l);

  // ---------- 5) un renglón que no se puede convertir lo dice ----------
  check('2 cestas de repollo sin saber los kg por cesta no dan número',
    f.map.repollo_blanco.de === 'manual' && f.map.repollo_blanco.ini === 99, f.map.repollo_blanco);
  check('y la app explica por qué',
    /cu.ntas kg trae una cesta|no est. dicho/i.test(f.map.repollo_blanco.aviso || ''), f.map.repollo_blanco.aviso);

  // ---------- 6) una semana cerrada manda sobre el físico ----------
  const g = await page.evaluate(() => {
    const t2 = db.inventarios.find(i => i.id === 't2');
    const b = baseInicial(t2);
    return { tipo: b.tipo, pollo: b.valores.pollo_pieza, de: b.origen.pollo_pieza };
  });
  check('con una semana cerrada de por medio, el inicial sale de ella',
    g.tipo === 'semana' && g.pollo === 999 && g.de === 'semana', g);

  // ---------- 7) en pantalla: qué se teclea y qué no ----------
  await page.click('#home-tabs button[data-t="inventario"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => { currentInv = db.inventarios.find(i => i.id === 't1'); renderInv(); show('inv'); });
  await page.waitForTimeout(400);
  check('el inicial que viene de la hoja no se puede editar',
    !(await page.$('.inv-inicial[data-a="pollo_pieza"]')));
  check('el inicial que no cubre la hoja sí se puede escribir',
    !!(await page.$('.inv-inicial[data-a="cebollin"]')));
  const txt = await page.textContent('#inv-comparacion');
  check('la pantalla dice de dónde salió el inicial',
    txt.includes('Inicial tomado del inventario físico del'), txt.slice(0, 200));
  const avisos = await page.textContent('#inv-msg');
  check('y arriba resume cuántos artículos salen de la hoja',
    avisos.includes('arranca del inventario físico del'), avisos.slice(0, 300));
  check('nombrando los que hay que escribir a mano',
    /refrescos de 1,5l/i.test(avisos), avisos.slice(0, 300));

  // ---------- cierre ----------
  console.log('');
  for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.desc);
  console.log('\nerrores JS: ' + (errors.length ? errors.join(' | ') : 'ninguno'));
  const malos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (malos ? malos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(malos || errors.length ? 1 : 0);
})();
