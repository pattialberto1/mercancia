// El «pollo rojo» del chino y el de los tenders son la misma pechuga: un solo
// artículo que suma las dos recetas. Y lo que se hubiera guardado con el
// nombre viejo tiene que reaparecer en la pechuga, no perderse.
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
function check(desc, cond) { results.push({ desc, ok: !!cond }); if (!cond) console.log('   (falló)', desc); }

const hoy = new Date().toISOString().slice(0, 10);
// datos guardados con el nombre VIEJO, como los tendría un teléfono ya usado
const VIEJO = {
  v: 2,
  settings: { tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, syncToken: '', apiKey: '',
              articulosActivos: ['pollo_rojo', 'pechuga', 'camaron'] },
  recepciones: [{ id: 'r1', tipo: 'pollo_rojo', fecha: hoy, creada: 1, mod: 1, cerrada: true,
                  tara: 0, cestasVacias: 0, pesadas: [{ peso: 40, cestas: 0, ts: 1 }] }],
  facturas: [],
  inventarios: [{ id: 'i1', creada: 1, mod: 1, semanaInicio: hoy, semanaFin: hoy,
                  ventas: [], conteo: { pollo_rojo: 12, pechuga: 8 }, inicialManual: { pollo_rojo: 5 },
                  conteoDet: { pollo_rojo: { b: '', u: '12' } }, cerrado: false }],
  borradas: {}
};

(async () => {
  await new Promise(r => server.listen(8960, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.addInitScript(([v]) => {
    localStorage.setItem('mercancia.pin', '7070');
    localStorage.setItem('mercancia.v1', v);
  }, [JSON.stringify(VIEJO)]);

  await page.goto('http://localhost:8960/');
  await page.waitForTimeout(400);

  // ---------- 1) ya no existe el pollo rojo como artículo aparte ----------
  const ids = await page.evaluate(() => ARTICULOS_TODOS.map(a => a.id));
  check('el pollo rojo desaparece como artículo', !ids.includes('pollo_rojo'));
  check('y queda la pechuga', ids.includes('pechuga'));
  check('tampoco está como producto que se recibe',
    await page.evaluate(() => PRODUCTOS.pollo_rojo === undefined));

  // ---------- 2) la migración no pierde nada ----------
  const m = await page.evaluate(() => ({
    tipoRec: db.recepciones[0].tipo,
    conteo: db.inventarios[0].conteo,
    inicial: db.inventarios[0].inicialManual,
    det: db.inventarios[0].conteoDet,
    activos: db.settings.articulosActivos
  }));
  check('la recepción vieja pasa a ser de pechuga', m.tipoRec === 'pechuga');
  check('los kilos contados se suman (12 + 8 = 20)', m.conteo.pechuga === 20 && m.conteo.pollo_rojo === undefined);
  check('el inicial también se muda', m.inicial.pechuga === 5 && m.inicial.pollo_rojo === undefined);
  check('lo tecleado se conserva', m.det.pechuga && m.det.pechuga.u === '12');
  check('no queda el artículo viejo activado, ni repetido',
    !m.activos.includes('pollo_rojo') && m.activos.filter(x => x === 'pechuga').length === 1);

  // ---------- 3) la pechuga suma chino Y tenders ----------
  await page.click('#home-tabs button[data-t="inventario"]');
  await page.evaluate(() => { abrirInv(db.inventarios[0].id); });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    currentInv.ventas = [
      { codigo: '1516', descripcion: 'ARROZ CHINO POLLO', cantidad: 10 },   // 10 potes → 1 kg
      { codigo: '1518', descripcion: 'COMBO 1 CHINO POLLO', cantidad: 5 },  // 10 potes → 1 kg
      { codigo: '1606', descripcion: 'TENDER DE POLLO', cantidad: 25 }      // 25 × 160 g → 4 kg
    ];
    touch(currentInv); save(false); renderInv();
  });
  await page.waitForTimeout(300);
  const v = await page.evaluate(() => calcular(currentInv).find(f => f.art.id === 'pechuga').vendido);
  check('el chino y los tenders descuentan de la misma pechuga (6 kg)', v === 6);

  // ---------- 4) la recepción sigue sumando en la pestaña Insumos ----------
  const rec = await page.evaluate(() => calcular(currentInv).find(f => f.art.id === 'pechuga').recibido);
  check('los 40 kg recibidos siguen contando', rec === 40);

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errors.length ? errors : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errors.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
