// Un renglón del reporte del POS sin nombre no se puede tirar en silencio.
//
// El reporte del 1 al 6 de septiembre traía el código 1615 con 18 unidades
// vendidas y la casilla del nombre en blanco. El lector exigía descripción, así
// que ese renglón desaparecía sin que nada lo dijera: 18 unidades vendidas que
// no salían por ningún lado. Ahora se queda, con el hueco a la vista.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const zlib = require('zlib');

const ROOT = '/home/user/mercancia';
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (e, d) => {
    if (e) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : 'text/html' }); res.end(d);
  });
});
const results = [];
function check(desc, cond, extra) {
  results.push({ desc, ok: !!cond });
  if (!cond) console.log('   (falló)', desc, extra === undefined ? '' : extra);
}

/* Un PDF mínimo con la misma forma que el del POS: cada celda es su propio
   bloque BT/ET con coordenadas absolutas, y el contenido va comprimido. Las
   X son las que usa el lector: 18 código · 76 nombre · 215 cantidad ·
   268 precio · 329 total. */
function celda(x, y, texto) {
  return `BT\n/F3 7 Tf\n0 0 0 rg\n7 TL\n${x} ${y} Td\n(${texto}) '\nET\n`;
}
function pdfDePrueba() {
  let c = celda(18, 700, 'C\\363digo') + celda(76, 700, 'Descripci\\363n') +
          celda(215, 700, 'Cantidad') +
          celda(76, 680, 'Del\\040D\\355a:\\04001\\05709\\0572026\\040al\\04006\\05709\\0572026');
  // un renglón normal
  c += celda(18, 640, '1612') + celda(76, 640, 'LUMPIA') +
       celda(215, 640, '     2.000') + celda(268, 640, '     1.72') + celda(329, 640, '     3.44');
  // el renglón sin nombre: código y cantidad, la casilla del nombre vacía
  c += celda(18, 620, '1615') +
       celda(215, 620, '    18.000') + celda(268, 620, '     1.29') + celda(329, 620, '    23.22');
  // uno sin nombre y desconocido: ese sí se queda con el hueco a la vista
  c += celda(18, 600, '9999') +
       celda(215, 600, '     5.000') + celda(268, 600, '     1.00') + celda(329, 600, '     5.00');
  // un pie que NO es un producto: lleva número pero no cantidad
  c += celda(18, 560, '1') + celda(76, 560, 'P\\341gina');

  const comprimido = zlib.deflateSync(Buffer.from(c, 'latin1'));
  const trozos = [];
  const off = [];
  let pdf = Buffer.from('%PDF-1.3\n', 'latin1');
  const empuja = (b) => { off.push(pdf.length); pdf = Buffer.concat([pdf, Buffer.from(b, 'latin1')]); };
  empuja('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  empuja('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  empuja('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n');
  off.push(pdf.length);
  pdf = Buffer.concat([
    pdf,
    Buffer.from(`4 0 obj\n<< /Filter /FlateDecode /Length ${comprimido.length} >>\nstream\n`, 'latin1'),
    comprimido,
    Buffer.from('\nendstream\nendobj\n', 'latin1')
  ]);
  pdf = Buffer.concat([pdf, Buffer.from('trailer\n<< /Root 1 0 R >>\n%%EOF\n', 'latin1')]);
  return pdf;
}

const RUTA = '/tmp/claude-0/-home-user-mercancia/ed6921a4-268b-55f5-8ada-49af9ca4f166/scratchpad/reporte-prueba.pdf';

(async () => {
  fs.mkdirSync(path.dirname(RUTA), { recursive: true });
  fs.writeFileSync(RUTA, pdfDePrueba());
  await new Promise(r => server.listen(8992, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.addInitScript(() => {
    localStorage.setItem('mercancia.pin', '7070');
    localStorage.setItem('mercancia.v1', JSON.stringify({
      v: 2, settings: { tara: 2.3, min: 65, max: 75, min1: 32, max1: 37, syncToken: '', apiKey: '',
                        articulosActivos: ['pollo_pieza'], controlSimplificado: 1 },
      recepciones: [], facturas: [],
      // una semana distinta a propósito, para que el rango NO cuadre con el reporte
      inventarios: [{ id: 't1', semanaInicio: '2026-08-24', semanaFin: '2026-08-30',
                      creada: 1, mod: 1, cerrado: false, ventas: [], conteo: {}, inicialManual: {} }],
      borradas: {}
    }));
  });
  await page.goto('http://localhost:8992/');
  await page.waitForTimeout(400);
  await page.evaluate(() => abrirInv('t1'));
  await page.waitForTimeout(300);
  await page.setInputFiles('#inv-file', RUTA);
  await page.waitForTimeout(1500);

  const v = await page.evaluate(() => currentInv.ventas);
  check('lee los tres productos, no uno', v.length === 3, v);
  check('el renglón con nombre se lee entero',
    v.some(x => x.codigo === '1612' && x.descripcion === 'LUMPIA' && x.cantidad === 2), v);
  check('el renglón SIN nombre no se tira: se queda con sus 18 unidades',
    v.some(x => x.codigo === '1615' && x.cantidad === 18), v);
  // el 1615 es de los que la app ya sabe cómo se llaman aunque el reporte no lo diga
  check('un código conocido se rellena con su nombre',
    (v.find(x => x.codigo === '1615') || {}).descripcion === 'Ketchup botella', v);
  check('uno sin nombre y sin conocer no se inventa: lo dice',
    (v.find(x => x.codigo === '9999') || {}).descripcion === '(sin nombre en el reporte)', v);
  check('el pie de página no se cuela como producto',
    !v.some(x => x.codigo === '1'), v);
  check('el rango del reporte se lee del propio papel',
    await page.evaluate(() => currentInv.rangoReporte.desde === '2026-09-01' &&
                              currentInv.rangoReporte.hasta === '2026-09-06'),
    await page.evaluate(() => currentInv.rangoReporte));
  check('y avisa de que no cuadra con el tramo',
    /reporte va del/.test(await page.textContent('#inv-msg')));
  // el 1615 ya tiene equivalencia (es el ketchup en botella); el que se queda
  // sin asignar es el que no conocemos
  check('el código desconocido sale entre los que no tienen equivalencia',
    await page.evaluate(() => codigosSinAsignar(currentInv).some(x => x.codigo === '9999')));

  console.log('');
  for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.desc);
  console.log('\nerrores JS: ' + (errors.length ? errors.join(' | ') : 'ninguno'));
  const malos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (malos ? malos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(malos || errors.length ? 1 : 0);
})();
