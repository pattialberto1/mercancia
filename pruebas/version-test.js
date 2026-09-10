// Dos cosas que se pierden de vista y cuestan caro:
//  - que la versión del index.html y la del sw.js se despareje, y entonces el
//    aviso de «hay versión nueva» no salte nunca o salte siempre;
//  - que en el teléfono la app se quede con el código viejo días enteros, sin
//    forma de enterarse, y parezca que lo que se pidió no se hizo.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');

const RAIZ = '/home/user/mercancia';
let versionServida = null;   // lo que el «servidor» dice tener
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  fs.readFile(path.join(RAIZ, p), (e, d) => {
    if (e) { res.writeHead(404); return res.end('nf'); }
    let cuerpo = d;
    if (p === '/sw.js' && versionServida)
      cuerpo = Buffer.from(d.toString().replace(/const CACHE = '[^']+'/, "const CACHE = '" + versionServida + "'"));
    res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : 'text/html' });
    res.end(cuerpo);
  });
});
const results = [];
function check(desc, cond, extra) { results.push({ desc, ok: !!cond }); if (!cond) console.log('   (falló)', desc, extra ?? ''); }

(async () => {
  // ---------- 1) las dos versiones van a la par ----------
  const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
  const idx = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const vSw = (sw.match(/const CACHE = '([^']+)'/) || [])[1];
  const vIdx = (idx.match(/const APP_VERSION = '([^']+)'/) || [])[1];
  check('el sw.js dice su versión', !!vSw, vSw);
  check('el index.html dice la suya', !!vIdx, vIdx);
  check('y son la misma: si no, el aviso de versión nueva mentiría', vSw === vIdx, [vSw, vIdx]);

  await new Promise(r => server.listen(8989, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.addInitScript(() => localStorage.setItem('mercancia.pin', '7070'));
  await page.goto('http://localhost:8989/');
  await page.waitForTimeout(400);

  // ---------- 2) al día, no molesta ----------
  const alDia = await page.evaluate(async () => {
    ultimaComprobacion = 0;
    await comprobarVersion();
    return !document.getElementById('nueva-version').classList.contains('hidden');
  });
  check('con la misma versión no aparece ningún aviso', !alDia);

  // ---------- 3) con una versión nueva en el servidor, lo dice ----------
  versionServida = 'mercancia-v9999';
  const avisa = await page.evaluate(async () => {
    ultimaComprobacion = 0;
    await comprobarVersion();
    const b = document.getElementById('nueva-version');
    return { visible: !b.classList.contains('hidden'), txt: b.textContent };
  });
  check('con una versión nueva sale el aviso', avisa.visible, avisa);
  check('y dice qué hacer', /versión nueva/.test(avisa.txt) && /actualizar/i.test(avisa.txt), avisa.txt);

  // ---------- 4) no recarga solo ----------
  const recargo = await page.evaluate(() => { window.__sigoAqui = 1; return true; });
  await page.waitForTimeout(600);
  check('no se recarga sola: podrías estar a mitad de una pesada',
    recargo && (await page.evaluate(() => window.__sigoAqui === 1)));

  // ---------- 5) no se pone a preguntar cada segundo ----------
  let peticiones = 0;
  page.on('request', r => { if (/sw\.js\?/.test(r.url())) peticiones++; });
  await page.evaluate(async () => { for (let i = 0; i < 5; i++) await comprobarVersion(); });
  await page.waitForTimeout(300);
  check('no repregunta más de una vez por minuto', peticiones === 0, peticiones);

  console.log('\n=== RESULTADOS ===');
  for (const r of results) console.log((r.ok ? '✅' : '❌'), r.desc);
  console.log('\nerrores JS:', errors.length ? errors : 'ninguno');
  const fallos = results.filter(r => !r.ok).length;
  console.log('\n' + results.length + ' comprobaciones · ' + (fallos ? fallos + ' FALLARON' : 'TODO PASÓ'));
  await browser.close(); server.close();
  process.exit(fallos || errors.length ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(1); });
