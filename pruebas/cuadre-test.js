// El cuadre: el panel que resume cómo va la semana. Lo importante no es que se
// vea bonito sino que diga lo mismo que la pantalla del tramo — si las dos
// contaran por su cuenta, tarde o temprano dirían cosas distintas del mismo
// producto — y que lo que no se puede calcular salga dicho, no escondido.
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
    db.settings.articulosActivos = ['pollo_pieza', 'ref_1l', 'lumpias'];
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
    // el pollo cuadra clavado, las lumpias faltan, el refresco sobra
    currentInv.conteo = { pollo_pieza: 1200, lumpias: 75, ref_1l: 60 };
    touch(currentInv); save(false); renderInv();
  });
  await page.waitForTimeout(350);

  // ---------- se llega desde el tramo ----------
  check('el tramo ofrece ver el cuadre',
    !(await page.getAttribute('#inv-dash', 'class')).includes('hidden'));
  await page.click('#inv-dash');
  await page.waitForTimeout(400);
  check('y se abre el cuadre', await page.isVisible('#view-dash'));

  // ---------- dice lo mismo que el tramo ----------
  const real = await page.evaluate(() => {
    const o = { cuadra: 0, falta: 0, sobra: 0, 'sin-contar': 0, imposible: 0 };
    for (const f of calcular(currentInv)) { const e = estadoCuadre(f); if (e.estado in o) o[e.estado]++; }
    return o;
  });
  const kpis = await page.$$eval('.dash-kpi', els => els.map(e => ({
    v: e.querySelector('.v').textContent, t: e.querySelector('.t').textContent })));
  const kpi = n => Number((kpis.find(k => k.t.includes(n)) || {}).v);
  check('el KPI de «cuadran» es el que sale de calcular', kpi('Cuadran') === real.cuadra, [kpis, real]);
  check('el de «faltan» también', kpi('Faltan') === real.falta, [kpis, real]);
  check('el de «sobran» también', kpi('Sobran') === real.sobra, [kpis, real]);
  check('y el de «por contar»', kpi('Por contar') === real['sin-contar'], [kpis, real]);
  check('el pollo cuadra clavado', real.cuadra >= 1, real);
  check('las lumpias faltan y el refresco sobra', real.falta === 1 && real.sobra === 1, real);

  // ---------- la cifra grande es la que decide si hay que hacer algo ----------
  const hero = await page.textContent('.dash-hero .n');
  check('la cifra grande son los que no cuadran',
    Number(hero) === real.falta + real.sobra, hero);

  const body = await page.textContent('#dash-body');
  // ---------- la cuenta a la vista, no solo el resultado ----------
  check('enseña la cuenta entera de las lumpias',
    /Inicial 100 \+ recibido 0 − vendido 20/.test(body), body.slice(0, 400));
  check('y lo que debería quedar contra lo contado',
    /Debería quedar 80 unidades · contados 75/.test(body));
  check('con el porcentaje al lado', /Faltan 5 unidades · 6,25%/.test(body), body);

  // ---------- la barra va al lado que le toca y no se sale ----------
  const barras = await page.$$eval('.dash-bar i', els => els.map(e => ({
    cls: e.className, w: parseFloat(e.style.width) })));
  check('hay una barra por cada producto que no cuadra', barras.length === real.falta + real.sobra, barras);
  check('ninguna pasa de la mitad del carril (el cero está en medio)',
    barras.every(b => b.w <= 50 + 0.001), barras);
  check('la de las lumpias mide el 6,25% / 2', barras.some(b => b.cls === 'mal' && Math.abs(b.w - 3.125) < 0.01), barras);

  // ---------- lo que no se puede cuadrar sale dicho, no escondido ----------
  check('el agua de 1,5L sale como que no se puede cuadrar',
    /Sin datos para cuadrar[\s\S]*Agua Minalba 1,5L/.test(body));
  check('y dice por qué', /se vendieron 4 unidades más de lo registrado/i.test(body), body);
  check('avisa de los códigos que no descuentan nada',
    /1 códigos? del reporte no descuentan nada|no descuentan nada/.test(body) && /VASO DE REFRESCO/.test(body));
  check('y de que el reporte sí cubre la semana', /El reporte cubre la semana entera/.test(body));
  check('los de solo conteo se explican aparte',
    /solo se cuentan: no tienen entradas ni receta/.test(body));

  // ---------- sin conteo no se inventa un cuadre ----------
  await page.click('#dash-back');
  await page.waitForTimeout(300);
  await page.evaluate(() => { currentInv.conteo = {}; touch(currentInv); save(false); });
  await page.click('#inv-dash');
  await page.waitForTimeout(400);
  const vacio = await page.textContent('#dash-body');
  check('sin un solo conteo, la cifra grande es lo que falta por contar',
    /productos por contar/.test(vacio), vacio.slice(0, 300));
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
