// El control de la semana, simplificado (9/9/2026). Alberto: «vamos a llevar
// semanalmente pollo, papas, refrescos de todo tipo, agua de todo tipo,
// postres, gatorade, yukipack, jugo barinas, Lipton, té verde, malta, tenta té,
// ensaladas, verduras y todo lo que se recibe en la app. Porque no me está
// funcionando el inventario entero». O sea: lo que de verdad se mueve, no los
// 245 renglones de la hoja.
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
  await new Promise(r => server.listen(8986, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));

  // un teléfono que venía con el control viejo, solo el pollo
  await page.addInitScript(() => {
    localStorage.setItem('mercancia.pin', '7070');
    // solo la primera vez: al recargar hay que ver lo que quedó guardado
    if (localStorage.getItem('mercancia.v1')) return;
    localStorage.setItem('mercancia.v1', JSON.stringify({
      v: 2, recepciones: [], facturas: [], inventarios: [], borradas: {},
      settings: { tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, syncToken: '', apiKey: '',
                  articulosActivos: ['pollo_pieza'] }
    }));
  });
  await page.goto('http://localhost:8986/');
  await page.waitForTimeout(400);

  const act = () => page.evaluate(() => db.settings.articulosActivos);
  let activos = await act();
  check('al abrir la versión nueva se lleva todo lo que entra por la app',
    activos.length > 40, activos.length);
  check('y no los 245 renglones de la hoja', activos.length < 80, activos.length);

  // lo que nombró, uno por uno
  const debe = {
    'pollo': 'pollo_pieza', 'papas': 'papas', 'alitas': 'alitas', 'pechuga': 'pechuga',
    'refresco 1L': 'ref_1l', 'refresco 1,5L': 'ref_15l', 'refresco 2L': 'ref_2l',
    'agua Minalba': 'agua', 'agua Glacier': 'agua_glacier', 'agua Minalba 1,5L': 'f_agua_minalba_1_5l',
    'postres Paolo': 'f_postres_paolo', 'postres tres leches': 'f_postres_tres_leches',
    'gatorade': 'gatorade', 'yuky-pack': 'yuky', 'jugos Barinas': 'jugo_barinas',
    'Lipton durazno': 'f_te_lipton_durazno', 'Lipton limón': 'f_te_lipton_limon',
    'té verde Lipton': 'f_te_verde_lipton', 'malta': 'malta', 'tenta té': 'tenta_te',
    'ensalada': 'f_ensalada', 'repollo blanco': 'repollo_blanco', 'zanahoria': 'zanahoria',
    'huevos': 'huevos', 'lumpias': 'lumpias', 'envases': 'envases',
    'tomate': 'tomate', 'cilantro': 'cilantro', 'limón': 'limon', 'plátano': 'platano'
  };
  for (const [nombre, id] of Object.entries(debe))
    check('se lleva ' + nombre, activos.includes(id), id);

  // y lo que NO: los cientos de renglones que solo se cuentan en el físico
  for (const id of ['f_coleto', 'f_teipe', 'f_gorros_tela_sencilla', 'f_bolsas_de_2_kilos'])
    check('no obliga a contar ' + id + ' cada semana', !activos.includes(id));

  // ---------- un renglón de la hoja que se lleva, lleva la fórmula entera ----------
  await page.click('#home-tabs button[data-t="inventario"]');
  await page.click('#btn-new');
  await page.waitForTimeout(400);
  const postre = await page.evaluate(() => {
    const f = calcular(currentInv).find(x => x.art.id === 'f_postres_paolo');
    return { activo: f.activo, estado: estadoCuadre(f).estado, formula: estadoCuadre(f).conFormula };
  });
  check('los postres entran en el control aunque solo estén en la hoja', postre.activo, postre);
  check('y llevan la fórmula, no solo el conteo', postre.formula === true, postre);
  check('así que salen como «falta contarlos», no desaparecen',
    postre.estado === 'sin-contar', postre);

  // ---------- después se puede tocar a mano sin que se vuelva a pisar ----------
  await page.evaluate(() => { db.settings.articulosActivos = ['pollo_pieza', 'papas']; save(false); });
  await page.reload();
  await page.waitForTimeout(400);
  activos = await act();
  check('lo que se quita a mano se queda quitado al recargar',
    activos.length === 2 && activos.includes('papas'), activos);

  // ---------- y hay un botón para volver a ponerlo todo ----------
  await page.evaluate(() => abrirInv(db.inventarios[0].id));
  await page.waitForTimeout(400);
  await page.click('#inv-equivalencias');
  await page.waitForTimeout(300);
  await page.click('#eq-simple');
  await page.waitForTimeout(300);
  activos = await act();
  check('el botón vuelve a llevar todo lo que entra por la app', activos.length > 40, activos.length);
  const lista = await page.textContent('#eq-articulos');
  check('y los renglones de la hoja que se llevan se pueden ver y quitar',
    /Postres Paolo/.test(lista) && /Té verde Lipton/.test(lista));
  check('sin arrastrar los otros 200 renglones a esa lista', !/Coleto|Teipe/.test(lista));

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errors.length ? errors : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errors.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
