// Inventario semanal de extremo a extremo, con el PDF real de Alberto.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const PDF = '/root/.claude/uploads/9495015d-441f-5e68-af2d-9fb7c6c8f7c3/e28e80ae-LSTPROVE.PDF';

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  fs.readFile(path.join('/home/user/mercancia', p), (e, d) => {
    if (e) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : 'text/html' }); res.end(d);
  });
});
const results = [];
function check(desc, cond) { results.push({ desc, ok: !!cond }); if (!cond) console.log('   (falló)', desc); }

// recepciones reales de la semana del PDF (16→21 ago): 65 cestas el 20/08
const RECEPCIONES = [{
  id: 'r-pollo-2008', tipo: 'pollo', fecha: '2026-08-20', creada: 1, mod: 1, cerrada: true,
  tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, cestasVacias: 0,
  pesadas: Array.from({ length: 32 }, () => ({ peso: 69, cestas: 2, ts: 1 })).concat([{ peso: 35, cestas: 1, ts: 1 }])
}];

(async () => {
  await new Promise(r => server.listen(8982, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.addInitScript(([recs]) => {
    localStorage.setItem('mercancia.pin', '7070');
    localStorage.setItem('mercancia.v1', JSON.stringify({
      v: 2, settings: { tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, syncToken: '', apiKey: '' },
      recepciones: JSON.parse(recs), facturas: [], inventarios: [], borradas: {}
    }));
  }, [JSON.stringify(RECEPCIONES)]);

  await page.goto('http://localhost:8982/');
  await page.waitForTimeout(300);
  check('las 65 cestas reales se cargaron', await page.evaluate(() =>
    db.recepciones[0].pesadas.reduce((s,p)=>s+p.cestas,0) === 65));

  // ---------- 1) pestaña y semana nueva ----------
  const tabs = await page.$$eval('#home-tabs button', bs => bs.map(b => b.textContent.trim()));
  check('hay una pestaña de Inventario', tabs.some(t => t.includes('Inventario')));
  await page.click('#home-tabs button[data-t="inventario"]');
  check('el botón dice «Nueva semana»', (await page.textContent('#btn-new')).includes('Nueva semana'));
  // crear la semana del PDF a mano, para que coincida con el reporte real
  await page.evaluate(() => { abrirInv(nuevaSemana('2026-08-16','2026-08-22').id); });
  await page.waitForTimeout(250);
  check('abre la pantalla de la semana', await page.isVisible('#view-inv'));
  check('la primera semana avisa que hay que poner el inicial',
    (await page.textContent('#inv-msg')).includes('primer tramo'));
  check('y dice el día del que tiene que ser ese conteo',
    /lo que contaste al cerrar el .*15 ago/.test(await page.textContent('#inv-msg')));

  // ---------- 2) subir el PDF real ----------
  await page.setInputFiles('#inv-file', PDF);
  await page.waitForTimeout(1200);
  check('lee el reporte real sin errores', (await page.textContent('#inv-ventas-resumen')).includes('55 productos'));

  // ---------- 3) EL AVISO CLAVE: el rango no coincide ----------
  const aviso = await page.textContent('#inv-msg');
  check('avisa que el reporte no cubre la misma semana', aviso.includes('El reporte va del'));
  check('el aviso dice el rango del reporte', aviso.includes('16 ago') && aviso.includes('21 ago'));
  check('explica la consecuencia (faltarían ventas)', aviso.includes('faltarán ventas'));

  // ajustar la semana al rango real del reporte
  await page.evaluate(() => { currentInv.semanaFin = '2026-08-21'; touch(currentInv); save(); renderInv(); });
  await page.waitForTimeout(300);
  check('al cuadrar el rango, el aviso desaparece', !(await page.textContent('#inv-msg')).includes('El reporte va del'));

  // por defecto solo se controla el pollo: activar algo sin registrar sus
  // entradas dejaría las cuentas en negativo para siempre
  const soloPollo = await page.evaluate(() => calcular(currentInv).map(f => f.art.id));
  check('de arranque solo se controla el pollo', soloPollo.length === 1 && soloPollo[0] === 'pollo_pieza');
  await page.evaluate(() => { db.settings.articulosActivos = ['pollo_pieza','ref_1l','agua']; save(false); renderInv(); });
  await page.waitForTimeout(250);
  check('se pueden activar más artículos', (await page.evaluate(() => calcular(currentInv).length)) === 3);

  // ---------- 4) los cálculos, contra lo que saqué a mano ----------
  const filas = await page.evaluate(() => calcular(currentInv).map(f => ({
    id: f.art.id, inicial: f.inicial, recibido: f.recibido, vendido: f.vendido, esperado: f.esperado
  })));
  const pollo = filas.find(f => f.id === 'pollo_pieza');
  const ref = filas.find(f => f.id === 'ref_1l');
  check('el pollo vendido son 11.272 piezas (calculado a mano)', pollo.vendido === 11272);
  check('65 cestas de 18 pollos = 9.360 piezas recibidas', pollo.recibido === 9360);
  check('los refrescos vendidos son 937 (747 en combos + 190 sueltos)', ref.vendido === 937);
  check('sin inicial, el esperado del pollo sale negativo (−1.912)', pollo.esperado === -1912);

  // un esperado negativo no es merma: hay que decirlo, no dar una cifra falsa
  const txtNeg = await page.textContent('#inv-comparacion');
  check('con esperado negativo no dice "sobran"', !txtNeg.includes('Sobran'));
  check('explica que falta cargar entradas', txtNeg.includes('se vendió más de lo que la app tiene registrado'));

  // ---------- 5) el arrastre arregla el número ----------
  await page.evaluate(() => {
    currentInv.inicialManual = { pollo_pieza: 2540, ref_1l: 1000, agua: 100 };
    touch(currentInv); save(); renderInv();
  });
  await page.waitForTimeout(300);
  const conInicial = await page.evaluate(() => calcular(currentInv).find(f => f.art.id === 'pollo_pieza').esperado);
  check('con inicial de 2.540, deberían quedar 628 piezas', conInicial === 628);

  // ---------- 6) conteo físico y merma ----------
  await page.evaluate(() => {
    currentInv.conteo = { pollo_pieza: 600, ref_1l: 200, agua: 50 };
    touch(currentInv); save(); renderComparacion();
  });
  await page.waitForTimeout(300);
  const texto = await page.textContent('#inv-comparacion');
  check('detecta que faltan 28 piezas', texto.includes('Faltan 28'));
  check('muestra el porcentaje de merma', /4,46%|4,5%/.test(texto));
  const difs = await page.evaluate(() => calcular(currentInv).map(f => f.diferencia));
  check('las diferencias se calculan por artículo', difs[0] === -28);

  // ---------- 7) equivalencias: lo que no está asignado se ve ----------
  const avisoEq = await page.textContent('#inv-msg');
  check('avisa solo de lo que puede consumir pollo o bebidas', avisoEq.includes('no tienen equivalencia'));
  check('el aviso nombra productos concretos', /ARROZ CHINO|TENDER|COMBO|MALTA|JUGO/i.test(avisoEq));
  check('no alarma por los 39 que no consumen nada controlado', !avisoEq.includes('39 productos'));
  await page.click('#inv-equivalencias');
  await page.waitForTimeout(300);
  const eqTexto = await page.textContent('#eq-list');
  check('el COMBO 3 muestra su equivalencia', eqTexto.includes('COMBO 3 POLLO') && eqTexto.includes('8 × piezas de pollo'));
  check('el COMBO 2 muestra que lleva refresco', eqTexto.includes('4 × piezas de pollo + 1 × refrescos de 1l'));
  check('lo no asignado sale marcado', eqTexto.includes('sin asignar'));
  check('se ve cuánto se vendió de cada uno', eqTexto.includes('730 vendidos'));
  const artTexto = await page.textContent('#eq-articulos');
  check('se puede elegir qué controlar', artTexto.includes('Piezas de pollo') && artTexto.includes('Se controla'));
  check('distingue la cesta que se cuenta de la que llega',
    artTexto.includes('cestas marinadas de 20 pollos (160 piezas)') && artTexto.includes('proveedor trae 18 pollos (144 piezas)'));
  check('lo no activado se ve como tal', artTexto.includes('No se controla'));
  await page.click('#eq-back');
  await page.waitForTimeout(200);

  // ---------- 8) no deja cerrar con las cuentas en negativo ----------
  await page.evaluate(() => { const g = currentInv.inicialManual.ref_1l; currentInv.inicialManual.ref_1l = 0;
    touch(currentInv); save(); renderInv(); window.__g = g; });
  await page.waitForTimeout(250);
  await page.click('#inv-cerrar');
  await page.waitForTimeout(250);
  check('no deja cerrar si a un artículo le faltan entradas', (await page.textContent('#toast')).includes('falta cargar entradas'));
  check('y no la marca como cerrada', !(await page.textContent('#inv-sub')).includes('cerrada'));
  await page.evaluate(() => { currentInv.inicialManual.ref_1l = window.__g; touch(currentInv); save(); renderInv(); });
  await page.waitForTimeout(250);

  // ---------- 9) cerrar la semana y que arrastre ----------
  await page.click('#inv-cerrar');
  await page.waitForTimeout(200);
  await page.click('#confirm-yes');
  await page.waitForTimeout(300);
  check('la semana queda cerrada', (await page.textContent('#inv-sub')).includes('cerrada'));
  check('cerrada, ya no deja subir otro reporte', await page.isHidden('#inv-subir'));

  const arrastre = await page.evaluate(() => {
    const nueva = nuevaSemana('2026-08-24','2026-08-30');
    return inicialDe(nueva);
  });
  check('el conteo de la semana pasa como inicial de la siguiente', arrastre.pollo_pieza === 600);
  check('arrastra todos los artículos', arrastre.ref_1l === 200 && arrastre.agua === 50);

  // ---------- 9) WhatsApp ----------
  await page.evaluate(() => { window.__abiertas = []; window.open = u => { window.__abiertas.push(u); return null; }; });
  await page.click('#inv-wa');
  await page.waitForTimeout(200);
  const wa = decodeURIComponent((await page.evaluate(() => window.__abiertas[0])).replace('https://wa.me/?text=',''));
  check("el mensaje muestra la fórmula completa", /Inicial 2\.?540 \+ recibido 9\.?360 − vendido 11\.?272/.test(wa));
  check('el mensaje dice lo que debería quedar', wa.includes('Debería quedar: 628'));
  check('el mensaje reporta la merma', wa.includes('Faltan 28'));

  // ---------- 10) nada de lo anterior se rompió ----------
  await page.click('#inv-back');
  await page.click('#home-tabs button[data-t="pollo"]');
  await page.waitForTimeout(250);
  check('las recepciones de pollo siguen ahí', (await page.textContent('#home-list')).includes('Pollo'));

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errors.length ? errors : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errors.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
