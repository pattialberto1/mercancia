// Lo que está en cestas sueltas, aparte del conteo de arriba y del de la
// nevera. Existe igual —así que suma—, pero se anota en su propio apartado
// para no mezclarlo con el conteo ni perderlo de vista.
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

const hoy = new Date().toISOString().slice(0, 10);
const mas = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

const SEMANA = {
  id: 'isem', semanaInicio: mas(hoy, -2), semanaFin: mas(hoy, 4),
  creada: 1, mod: 1, cerrado: false, ventas: [], reportes: [],
  conteoDet: {}, conteoNevera: {},
  inicialManual: { ref_1l: 520, ref_2l: 17, gatorade: 6, lipton: 9 }
};

(async () => {
  await new Promise(r => server.listen(8939, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.addInitScript(sem => {
    localStorage.setItem('mercancia.pin', '7070');
    if (localStorage.getItem('mercancia.v1')) return;
    localStorage.setItem('mercancia.v1', JSON.stringify({
      v: 2, settings: { tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, syncToken: '', apiKey: '' },
      recepciones: [], facturas: [], inventarios: [JSON.parse(sem)], borradas: {}
    }));
  }, JSON.stringify(SEMANA));
  await page.goto('http://localhost:8939/');
  await page.waitForTimeout(400);
  await page.click('#home-tabs button[data-t="inventario"]');
  await page.waitForTimeout(200);
  await page.click('#home-list button');
  await page.waitForTimeout(400);

  const fila = k => page.evaluate(c => calcular(currentInv).find(f => f.clave === c), k);

  // ---------- 1) el apartado está, y vacío lo dice ----------
  check('hay un apartado para las cestas sueltas', await page.isVisible('#inv-extra-card'));
  check('se explica que va aparte del conteo',
    /no entró en el conteo/.test(await page.textContent('#inv-extra-card')));
  check('vacío, lo dice en vez de enseñar casillas sueltas',
    /No hay nada anotado/.test(await page.textContent('#inv-extra-lista')));
  check('no se cuela en el conteo de arriba ni en el de la nevera',
    (await fila('ref_1l')).extra === 0);

  // ---------- 2) agregar una cosa ----------
  await page.selectOption('#inv-extra-add', 'ref_1l');
  await page.waitForTimeout(300);
  check('al elegir el producto aparece su casilla',
    await page.isVisible('#inv-extra-lista .ext[data-c="ref_1l"]'));
  check('y arranca vacía de verdad, en cero', (await fila('ref_1l')).extra === 0);
  check('el inicial todavía no se ha movido', (await fila('ref_1l')).inicial === 520);
  check('ya no se ofrece dos veces el mismo producto',
    !(await page.$('#inv-extra-add option[value="ref_1l"]')));

  await page.fill('#inv-extra-lista .ext[data-c="ref_1l"]', '20');
  await page.dispatchEvent('#inv-extra-lista .ext[data-c="ref_1l"]', 'change');
  await page.waitForTimeout(350);
  const r1 = await fila('ref_1l');
  check('lo de las cestas se suma a lo que había', r1.inicial === 540, r1.inicial);
  check('y queda guardado aparte, no dentro del inicial', r1.extra === 20, r1.extra);
  check('el inicial escrito a mano no se toca',
    await page.evaluate(() => currentInv.inicialManual.ref_1l === 520));
  check('«te queda» también lo lleva', r1.esperado === 540, r1.esperado);

  // ---------- 3) se ve de dónde sale ----------
  const bloque = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.inv-bloque')]
      .find(x => x.querySelector('.inv-nom').textContent.includes('Refrescos de 1L'));
    return b ? b.textContent : '';
  });
  check('la fila avisa de que ahí van las cestas sueltas',
    /20 en cestas sueltas/.test(bloque), bloque.slice(0, 200));
  check('el apartado dice cuántos productos tienen',
    /1 producto tiene/.test(await page.textContent('#inv-extra-total')));

  // ---------- 4) varias cosas a la vez ----------
  for (const [clave, n] of [['gatorade', '20'], ['lipton', '16']]) {
    await page.selectOption('#inv-extra-add', clave);
    await page.waitForTimeout(250);
    await page.fill('#inv-extra-lista .ext[data-c="' + clave + '"]', n);
    await page.dispatchEvent('#inv-extra-lista .ext[data-c="' + clave + '"]', 'change');
    await page.waitForTimeout(300);
  }
  check('el gatorade suma los suyos', (await fila('gatorade')).inicial === 26);
  check('el lipton los suyos', (await fila('lipton')).inicial === 25);
  check('y lo que no tiene cestas se queda igual', (await fila('ref_2l')).inicial === 17);
  check('ahora son tres', /3 productos tienen/.test(await page.textContent('#inv-extra-total')));

  // ---------- 5) borrar ----------
  await page.fill('#inv-extra-lista .ext[data-c="lipton"]', '');
  await page.dispatchEvent('#inv-extra-lista .ext[data-c="lipton"]', 'change');
  await page.waitForTimeout(350);
  check('vaciar la casilla la quita', (await fila('lipton')).inicial === 9);
  check('y desaparece del apartado',
    !(await page.$('#inv-extra-lista .ext[data-c="lipton"]')));
  check('se puede volver a elegir', !!(await page.$('#inv-extra-add option[value="lipton"]')));

  // ---------- 6) un número es un número ----------
  await page.fill('#inv-extra-lista .ext[data-c="gatorade"]', 'diez');
  await page.dispatchEvent('#inv-extra-lista .ext[data-c="gatorade"]', 'change');
  await page.waitForTimeout(350);
  check('no acepta letras', (await page.textContent('#toast')).includes('número'));
  check('y no pierde lo que había', (await fila('gatorade')).inicial === 26);

  // ---------- 7) viaja con la semana y se arrastra al cerrar ----------
  check('se guarda en la semana, para que viaje a los otros teléfonos',
    await page.evaluate(() => JSON.parse(localStorage.getItem('mercancia.v1'))
      .inventarios[0].extra.ref_1l === '20'));
  const arrastre = await page.evaluate(() => {
    const prox = { id: 'iprox', semanaInicio: '2099-01-04', semanaFin: '2099-01-10',
      creada: 2, mod: 2, cerrado: false, ventas: [], conteoDet: {}, inicialManual: {} };
    currentInv.cerrado = true;
    db.inventarios.push(prox);
    const f = calcular(prox).find(x => x.clave === 'ref_1l');
    currentInv.cerrado = false;
    db.inventarios.pop();
    return f.inicial;
  });
  check('al cerrar, lo de las cestas sigue contando en la semana siguiente',
    arrastre === 540, arrastre);

  // ---------- 8) no inventa faltantes de un conteo viejo ----------
  /* Una semana cerrada donde se contaron 100 gatorades, y la siguiente
     rebasada a mano en 110 con 20 más en cestas sueltas: lo que falta del
     conteo viejo son 10, no 30. Las cestas no estaban en aquel conteo. */
  const pend = await page.evaluate(() => {
    const vieja = { id: 'ivieja', semanaInicio: '2098-01-04', semanaFin: '2098-01-10',
      creada: 1, mod: 1, cerrado: true, ventas: [], conteoNevera: {},
      conteoDet: { gat_mandarina: { b: '', u: '100' } },
      inicialManual: { gatorade: 100 } };
    const nueva = { id: 'inueva', semanaInicio: '2098-01-11', semanaFin: '2098-01-17',
      creada: 2, mod: 2, cerrado: false, ventas: [], conteoDet: {}, conteoNevera: {},
      inicialManual: { gatorade: 110 }, extra: { gatorade: '20' } };
    currentInv.cerrado = true;   // si no, «falta cerrar la anterior» vacía el inicial
    db.inventarios.push(vieja, nueva);
    const con = calcular(nueva).find(f => f.clave === 'gatorade');
    delete nueva.extra;
    const sin = calcular(nueva).find(f => f.clave === 'gatorade');
    db.inventarios.pop(); db.inventarios.pop();
    currentInv.cerrado = false;
    return { inicial: con.inicial, extra: con.extra, pendiente: con.pendiente, sinExtra: sin.pendiente };
  });
  check('con cestas, el inicial son 130', pend.inicial === 130, pend);
  check('pero lo que falta del conteo viejo son 10, no 30', pend.pendiente === 10, pend);
  check('sin cestas de por medio, el faltante es el mismo de siempre', pend.sinExtra === 10, pend);
  const f0 = await fila('ref_1l');
  check('y sin conteo anterior no hay faltante ninguno', f0.pendiente === 0, f0.pendiente);

  // ---------- 9) una semana cerrada no se edita ----------
  await page.evaluate(() => { currentInv.cerrado = true; save(); renderInv(); });
  await page.waitForTimeout(300);
  check('cerrada, las casillas quedan bloqueadas',
    await page.evaluate(() => [...document.querySelectorAll('#inv-extra-lista .ext')].every(i => i.disabled)));
  check('y no se puede agregar nada más', !(await page.$('#inv-extra-add')));

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errores.length ? errores : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errores.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
