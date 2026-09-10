// El ritual de Alberto: «cuando le doy a nuevo inventario me tiene que salir la
// nueva semana, del 7 al 13, y empezar desde el último inventario, que es del 1
// al 6; desde ahí, las piezas que quedaron son con las que empieza la nueva
// semana; se van cargando las recepciones y el domingo en la noche cargo los
// productos vendidos». O sea: las semanas se encadenan y lo que quedó pasa.
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
  await new Promise(r => server.listen(8987, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.addInitScript(() => localStorage.setItem('mercancia.pin', '7070'));
  await page.goto('http://localhost:8987/');
  await page.waitForTimeout(400);

  /* El montaje se hace con las fechas de la propia app para que la prueba valga
     cualquier día: un físico cerrado, y detrás un tramo que empieza a mitad de
     semana y termina el domingo pasado, como el del 1 al 6. */
  const fechas = await page.evaluate(() => {
    const hoy = todayISO();
    const lunes = lunesDe(hoy);
    const ini = masDias(lunes, -6), fin = masDias(lunes, -1);   // martes a domingo
    const fis = nuevoFisico(masDias(ini, -1));
    fis.fisico = { pollo_en_cestas_marinado: { b: '10', u: '' } };   // 1.600 piezas
    fis.cerrado = true;
    const tramo = nuevaSemana(ini, fin);
    tramo.id = 'previo';
    tramo.ventas = [{ codigo: '1519', descripcion: 'COMBO 1 POLLO', cantidad: 100 }];  // 400 piezas
    db.settings.articulosActivos = ['pollo_pieza'];
    save(false);
    return { hoy, lunes, ini, fin, domingo: masDias(lunes, 6) };
  });

  // ---------- 1) «Nueva semana» da la que sigue, no otra encima ----------
  await page.click('#home-tabs button[data-t="inventario"]');
  await page.waitForTimeout(200);
  await page.click('#btn-new');
  await page.waitForTimeout(400);
  let inv = await page.evaluate(() => ({ id: currentInv.id, ini: currentInv.semanaInicio, fin: currentInv.semanaFin }));
  check('la semana nueva empieza el día siguiente al que terminó la anterior',
    inv.ini === fechas.lunes, [inv, fechas]);
  check('y termina el domingo', inv.fin === fechas.domingo, [inv, fechas]);
  check('no es la anterior otra vez', inv.id !== 'previo', inv);
  check('no se creó ninguna encima de la vieja',
    (await page.evaluate(() => db.inventarios.filter(i => !esFisico(i)).length)) === 2);

  // volver a pulsarlo no duplica: la semana en curso ya existe
  await page.click('#inv-back');
  await page.waitForTimeout(200);
  await page.click('#btn-new');
  await page.waitForTimeout(400);
  check('pulsarlo otra vez abre la misma, no crea otra',
    (await page.evaluate(() => db.inventarios.filter(i => !esFisico(i)).length)) === 2);
  check('y es la del lunes',
    (await page.evaluate(() => currentInv.semanaInicio)) === fechas.lunes);

  // ---------- 2) mientras la anterior no se cierre, no hay de dónde partir ----------
  let ini0 = await page.evaluate(() => {
    const f = calcular(currentInv).find(x => x.art.id === 'pollo_pieza');
    return { inicial: f.inicial, origen: f.origenInicial };
  });
  /* Y no se salta la semana de en medio para tirar del físico: eso daría 1.600
     piezas como si esa semana no hubiera existido, y sin avisar. */
  check('sin cerrar la anterior, el inicial no se inventa',
    ini0.inicial === 0 && !ini0.origen, ini0);
  check('y se dice por qué, nombrando la semana que falta cerrar',
    /La semana del[\s\S]*todavía no está cerrada, así que esta no sabe con qué empieza/
      .test(await page.textContent('#inv-msg')), await page.textContent('#inv-msg'));

  // ---------- 3) al cerrarla, lo que quedó pasa a la nueva ----------
  /* Sin contar nada, la anterior deja 1.600 − 400 = 1.200 piezas: eso es lo que
     arrastra. Alberto no quiere tener que contar para seguir (10/9). */
  await page.evaluate(() => {
    const previo = db.inventarios.find(i => i.id === 'previo');
    previo.cerrado = true;
    save(false); renderInv();
  });
  await page.waitForTimeout(350);
  const arr = await page.evaluate(() => {
    const f = calcular(currentInv).find(x => x.art.id === 'pollo_pieza');
    return { inicial: f.inicial, origen: f.origenInicial };
  });
  check('cerrada sin contar, arrastra lo que debía quedar: 1.600 − 400 = 1.200',
    arr.inicial === 1200 && arr.origen === 'arrastre', arr);
  check('y se dice que ese número viene de la cuenta, no de la cava',
    /No se contó, así que viene de la cuenta, no de la cava/
      .test(await page.textContent('#inv-comparacion')));

  // y si sí se contó, manda el conteo
  await page.evaluate(() => {
    const previo = db.inventarios.find(i => i.id === 'previo');
    previo.conteo = { pollo_pieza: 1150 };   // lo que se contó de verdad al cerrar
    save(false); renderInv();
  });
  await page.waitForTimeout(350);
  const ini1 = await page.evaluate(() => {
    const f = calcular(currentInv).find(x => x.art.id === 'pollo_pieza');
    return { inicial: f.inicial, origen: f.origenInicial };
  });
  check('contado, la nueva arranca con lo contado: 1.150 y no 1.200',
    ini1.inicial === 1150, ini1);
  check('y dice que viene de la semana anterior, no del físico',
    ini1.origen === 'semana', ini1);
  check('en pantalla se explica de dónde sale',
    /lo que se contó al cerrar la semana anterior/.test(await page.textContent('#inv-comparacion')));

  // ---------- 4) las recepciones de estos días van a la semana nueva ----------
  const rec = await page.evaluate(() => {
    db.recepciones.push({ id: 'rhoy', tipo: 'pollo', fecha: todayISO(), creada: 1, mod: 1, cerrada: true,
      tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, cestasVacias: 0,
      pesadas: [{ peso: 100, cestas: 1, ts: 1 }] });          // 1 cesta = 144 piezas
    save(false); renderInv();
    const o = {};
    for (const inv of db.inventarios.filter(i => !esFisico(i)))
      o[inv.id === 'previo' ? 'previo' : 'nueva'] =
        calcular(inv).find(f => f.art.id === 'pollo_pieza').recibido;
    return o;
  });
  check('lo recibido hoy entra en la semana nueva', rec.nueva === 144, rec);
  check('y no en la vieja, que ya cerró', rec.previo === 0, rec);

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errors.length ? errors : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errors.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
