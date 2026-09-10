// El cuadre. Desde el 10/9 no es una pantalla aparte: es LA pantalla del
// inventario, con las casillas del conteo en la misma fila. Lo que importa es
// que la cuenta esté a la vista y que lo que no se puede calcular salga dicho,
// no escondido.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  fs.readFile(path.join('/home/user/mercancia', p), (e, d) => {
    if (e) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(d);
  });
});
const results = [];
function check(desc, cond, extra) { results.push({ desc, ok: !!cond }); if (!cond) console.log('   (falló)', desc, extra ?? ''); }

(async () => {
  await new Promise(r => server.listen(8985, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));

  await page.goto('http://localhost:8985/');
  await page.fill('#pin-input', '7070'); await page.click('#pin-btn');
  await page.waitForTimeout(250);

  await page.evaluate(() => {
    // el inventario es una lista fija: ya no hay nada que marcar
    db.settings.porBulto = Object.assign({}, db.settings.porBulto, { lumpias: 0 });
    save(false);
  });
  await page.click('#home-tabs button[data-t="inventario"]');
  await page.click('#btn-new');
  await page.waitForTimeout(400);
  // el físico va una semana antes, para que el tramo tenga de dónde partir
  await page.evaluate(() => {
    const fis = nuevoFisico(masDias(currentInv.semanaInicio, -7));
    fis.fisico = {
      pollo_en_cestas_marinado: { b: '10', u: '' },       // 10 × 160 = 1.600 piezas
      lumpias: { b: '', u: '100' },
      refresco_coca_cola_1l: { b: '', u: '50' }
    };
    fis.cerrado = true;
    currentInv.ventas = [
      { codigo: '1519', descripcion: 'COMBO 1 POLLO', cantidad: 100 },   // 400 piezas
      { codigo: '1598', descripcion: 'LUMPIAS', cantidad: 10 },          // 20 lumpias
      { codigo: '1620', descripcion: 'MINALBA 1.5L', cantidad: 4 },      // sin inicial: imposible
      { codigo: '1551', descripcion: '1 VASO DE REFRESCO', cantidad: 7 } // sin equivalencia
    ];
    currentInv.rangoReporte = { desde: currentInv.semanaInicio, hasta: currentInv.semanaFin };
    /* El caso de Alberto: recibe refresco DESPUÉS de que terminó la semana que
       está cuadrando. No tiene que sumar aquí, y la app tiene que decirlo. */
    db.recepciones.push({ id: 'rposterior', tipo: 'refresco_1l', fecha: masDias(currentInv.semanaFin, 1),
      creada: 1, mod: 1, cerrada: true, tara: 2.3, min: 65, max: 75, min1: 32, max1: 37,
      cestasVacias: 0, pesadas: [{ peso: 90, cestas: 0, ts: 1 }] });
    // el pollo cuadra clavado, las lumpias faltan, el refresco sobra
    currentInv.conteo = { pollo_pieza: 1200, lumpias: 75, ref_1l: 60 };
    touch(currentInv); save(false); renderInv();
  });
  await page.waitForTimeout(350);

  // ---------- el cuadre ES el inventario ----------
  check('el cuadre sale en la propia pantalla del inventario',
    await page.isVisible('#inv-comparacion'));
  check('con la cabecera de la cuenta', await page.isVisible('.dash-cab'));

  // ---------- dice lo mismo que el tramo ----------
  /* Las cifras de arriba son SOLO del control de la semana. Contar los 50 y pico
     que tienen fórmula daba un «51 productos por contar» que no significaba nada:
     casi todos son renglones de la hoja que él no eligió llevar. */
  const real = await page.evaluate(() => {
    const o = { cuadra: 0, falta: 0, sobra: 0, 'sin-contar': 0, imposible: 0 };
    const todos = { 'sin-contar': 0 };
    for (const f of calcular(currentInv)) {
      const e = estadoCuadre(f);
      if (e.estado in todos) todos[e.estado]++;
      if (f.activo && e.estado in o) o[e.estado]++;
    }
    return { control: o, todosSinContar: todos['sin-contar'] };
  });
  const kpis = await page.$$eval('.dash-kpi', els => els.map(e => ({
    v: e.querySelector('.v').textContent, t: e.querySelector('.t').textContent })));
  const kpi = n => Number((kpis.find(k => k.t.includes(n)) || {}).v);
  check('el KPI de «cuadran» es el que sale de calcular', kpi('Cuadran') === real.control.cuadra, [kpis, real]);
  check('el de «faltan» también', kpi('Faltan') === real.control.falta, [kpis, real]);
  check('el de «sobran» también', kpi('Sobran') === real.control.sobra, [kpis, real]);
  check('y el de «por contar»', kpi('Por contar') === real.control['sin-contar'], [kpis, real]);
  check('y se dice de cuántos son esas cifras',
    /De los 17 que se llevan: bebidas, pollo, papas y lumpias/.test(
      await page.textContent('.dash-kpis + .sub')));
  check('el pollo cuadra clavado', real.control.cuadra >= 1, real);
  check('las lumpias faltan y el refresco sobra', real.control.falta === 1 && real.control.sobra === 1, real);

  // ---------- la cifra grande es la que decide si hay que hacer algo ----------
  const hero = await page.textContent('.dash-hero .n');
  check('la cifra grande son los que no cuadran',
    Number(hero) === real.control.falta + real.control.sobra, hero);

  const body = await page.textContent('#inv-comparacion');
  /* ---------- la frase entera, producto por producto ----------
     «tenías esto, recibiste esto, vendiste esto, te queda tanto»: es lo que
     Alberto pidió ver, y no hace falta haber contado para poder enseñarlo. */
  const cab = await page.evaluate(() => [...document.querySelector('.dash-cab').children].map(e => e.textContent));
  check('la tabla se encabeza con la frase', cab.join('|') === 'Tenías|Recibiste|Vendiste|Te queda', cab);
  check('y dice de dónde sale el «tenías»',
    /«Tenías» es lo que se contó en el inventario físico del/.test(body), body.slice(0, 400));
  const fila = async nombre => page.evaluate(n => {
    const r = [...document.querySelectorAll('.dash-row')].find(x => x.textContent.includes(n));
    return r ? { cifras: [...r.querySelectorAll('.dash-cifras b')].map(b => b.textContent),
                 uni: r.querySelector('.dash-uni').textContent, txt: r.textContent } : null;
  }, nombre);
  const lum = await fila('Lumpias');
  check('las lumpias: tenías 100, recibiste 0, vendiste 20, te quedan 80',
    lum && lum.cifras.join('|') === '100|0|20|80', lum && lum.cifras);
  check('con su unidad', lum && lum.uni === 'unidades', lum && lum.uni);
  check('y debajo lo contado y la diferencia',
    lum && /Contaste 75/.test(lum.txt) && /Faltan 5 unidades · 6,25%/.test(lum.txt), lum && lum.txt);

  // ---------- la barra va al lado que le toca y no se sale ----------
  const barras = await page.$$eval('.dash-bar i', els => els.map(e => ({
    cls: e.className, w: parseFloat(e.style.width) })));
  check('hay una barra por cada producto que no cuadra, y ninguna en los que cuadran',
    barras.length === real.control.falta + real.control.sobra, barras);
  check('ninguna pasa de la mitad del carril (el cero está en medio)',
    barras.every(b => b.w <= 50 + 0.001), barras);
  check('la de las lumpias mide el 6,25% / 2', barras.some(b => b.cls === 'mal' && Math.abs(b.w - 3.125) < 0.01), barras);

  // ---------- lo que no se puede cuadrar sale dicho, no escondido ----------
  const agua = await fila('Agua Minalba 1,5L');
  check('el agua de 1,5L también sale, aunque no se pueda cuadrar', !!agua);
  check('y dice por qué en vez de dar un número falso',
    agua && /Se vendieron 4 unidades más de lo registrado: faltan entradas por cargar/.test(agua.txt),
    agua && agua.txt);
  const malta = await fila('Maltas');
  check('lo que no se movió sale igual, con sus ceros y sin inventar nada',
    malta && malta.cifras.join('|') === '0|0|0|0' && /Falta contarlo/.test(malta.txt), malta);
  check('avisa de los códigos que no descuentan nada',
    /1 códigos? del reporte no descuentan nada|no descuentan nada/.test(body) && /VASO DE REFRESCO/.test(body));
  check('y de que el reporte sí cubre la semana', /El reporte cubre la semana entera/.test(body));
  // lo que más le costaba entender: qué entra y qué no entra en la semana
  check('dice qué recepciones y facturas entran', /recepciones y \d+ facturas con fecha de esos días/.test(body), body);
  check('y avisa de las entradas posteriores, que NO entran',
    /1 entradas posteriores quedan fuera/.test(body), body);
  // y de verdad no suman: el refresco sobra 5, no 95
  check('los 90 refrescos de después no se cuelan en el recibido',
    (await page.evaluate(() => calcular(currentInv).find(f => f.art.id === 'ref_1l').recibido)) === 0);
  /* En el panel solo van bebidas, pollo, papas y lumpias. Lo demás del control
     no se pinta, pero tampoco se calla: ni lo que falta contar para cerrar, ni
     lo que está descuadrado. */
  check('las verduras no salen por ningún lado', !/Zanahoria|Cebollín|Tomate/.test(
    await page.evaluate(() => document.querySelector('#inv-comparacion').textContent)));
  check('y no se cuelan los cientos de renglones que solo se cuentan',
    !/Coleto|Teipe|Servilletas/.test(body));
  // «5.276 piezas» no se ve en la cava; «33 cestas» sí
  const pollo = await fila('Piezas de pollo');
  check('el pollo dice también cuántas cestas de 20 pollos son',
    pollo && /≈ 7,5 cestas de 20 pollos · 150 pollos/.test(pollo.txt), pollo && pollo.txt);
  /* Y en lo que va por peso, el promedio real de kg por cesta: en la cava se
     miran cestas, no kilos. El promedio sale de todo lo recibido, no de una
     cifra puesta a mano. */
  const kgc = await page.evaluate(() => {
    db.recepciones.push({ id: 'rp1', tipo: 'papas', fecha: currentInv.semanaInicio, creada: 1, mod: 1,
      cerrada: true, tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, cestasVacias: 0,
      pesadas: [{ peso: 106.5, cestas: 5, ts: 1 }] });        // neto 95 kg en 5 cestas = 19 kg/cesta
    save(false); renderComparacion();
    return kgPorCesta('papas');
  });
  check('el kg por cesta sale de lo recibido: 95 kg en 5 cestas = 19',
    kgc && kgc.kg === 19 && kgc.cestas === 5, kgc);
  const pap = await fila('Papas');
  check('y con eso dice cuántas cestas quedan',
    pap && /cestas.*19 kg por cesta, el promedio de las 5 recibidas/.test(pap.txt), pap && pap.txt);
  check('y los kilos de papas a cestas, con el promedio de todo lo recibido',
    /19 kg por cesta, el promedio de las 5 recibidas/.test(await page.textContent('#inv-comparacion')));

  // ---------- sin conteo no se inventa un cuadre ----------
  await page.evaluate(() => { currentInv.conteo = {}; touch(currentInv); save(false); renderInv(); });
  await page.waitForTimeout(400);
  const vacio = await page.textContent('#inv-comparacion');
  check('sin un solo conteo, la cifra grande es lo que falta por contar',
    /productos por contar/.test(vacio), vacio.slice(0, 300));
  // pero la frase entera se sigue viendo: contar no hace falta para saber
  // lo que debería haber
  const lum2 = await fila('Lumpias');
  check('y aun sin contar nada se ve tenías/recibiste/vendiste/te queda',
    lum2 && lum2.cifras.join('|') === '100|0|20|80', lum2 && lum2.cifras);
  check('con un «falta contarlo» en vez de una diferencia inventada',
    lum2 && /Falta contarlo para saber si cuadra/.test(lum2.txt), lum2 && lum2.txt);
  check('y no dice «0 no cuadran», que sería mentir por omisión',
    !/no cuadran/.test(await page.textContent('.dash-hero')));

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errors.length ? errors : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errors.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
