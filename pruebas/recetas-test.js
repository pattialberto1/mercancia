// Recetas y códigos del POS que se aclararon: tender, LITRO Y MEDIO, y los dos
// códigos de agua de 600 (uno es Glacier, el otro Minalba).
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

(async () => {
  await new Promise(r => server.listen(8962, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));

  await page.goto('http://localhost:8962/');
  await page.fill('#pin-input', '7070'); await page.click('#pin-btn');
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    db.settings.articulosActivos = ['pechuga', 'yuky', 'ref_15l', 'agua', 'agua_glacier'];
    save(false);
  });
  await page.click('#home-tabs button[data-t="inventario"]');
  await page.click('#btn-new');
  await page.waitForTimeout(350);

  await page.evaluate(() => {
    currentInv.ventas = [
      { codigo: '1606', descripcion: 'TENDER DE POLLO', cantidad: 145 },
      { codigo: '1602', descripcion: 'TENDER+REF./ YUKY PACK', cantidad: 20 },
      { codigo: '1630', descripcion: 'LITRO Y MEDIO', cantidad: 36 },
      { codigo: '1513', descripcion: 'AGUA 600ML', cantidad: 18 },
      { codigo: '1621', descripcion: 'MINALBA 600ML', cantidad: 34 }
    ];
    touch(currentInv); save(false); renderInv();
  });
  await page.waitForTimeout(300);
  const v = await page.evaluate(() => {
    const f = calcular(currentInv);
    const g = id => f.find(x => x.art.id === id).vendido;
    return { pechuga: g('pechuga'), yuky: g('yuky'), ref15: g('ref_15l'),
             agua: g('agua'), glacier: g('agua_glacier') };
  });

  // ---------- tenders ----------
  check('165 tenders × 160 g = 26,4 kg de pechuga', v.pechuga === 26.4);
  check('el TENDER+REF sigue descontando su yuky-pack', v.yuky === 20);

  // ---------- LITRO Y MEDIO ----------
  check('«LITRO Y MEDIO» descuenta refrescos de 1,5L', v.ref15 === 36);

  // ---------- las dos aguas de 600 ----------
  check('«AGUA 600ML» es la Glacier', v.glacier === 18);
  check('«MINALBA 600ML» es la Minalba', v.agua === 34);
  check('no se mezclan entre sí', v.agua !== 52 && v.glacier !== 52);

  // ---------- tamaños de bulto ----------
  const pb = await page.evaluate(() => ({
    glacier: porBultoDe(articulo('agua_glacier')), ref15: porBultoDe(articulo('ref_15l'))
  }));
  check('el agua Glacier trae 24 por bulto', pb.glacier === 24);
  check('el refresco de 1,5L trae 12', pb.ref15 === 12);

  // ---------- las recetas se pueden ver y corregir ----------
  await page.click('#inv-equivalencias');
  await page.waitForTimeout(300);
  const eq = await page.textContent('#eq-list');
  check('la receta del tender se ve', /TENDER DE POLLO/.test(eq) && /0,16 kg de pechuga/i.test(eq));
  check('ya no queda nada del chino sin asignar',
    !/COMBO 1 CHINO[\s\S]{0,120}sin asignar/.test(eq));

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errors.length ? errors : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errors.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
