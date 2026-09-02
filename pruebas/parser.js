/* ============================================================
   Lector del reporte de ventas del POS (PDF)

   El reporte lo genera FoxPro/Haru PDF: es texto de verdad, no una foto
   escaneada, así que no hace falta OCR ni ninguna librería. Cada celda es
   un bloque "BT ... x y Td ... (texto) ' ... ET" con coordenadas absolutas,
   o sea que la tabla se reconstruye agrupando por coordenada Y (la fila) y
   asignando la columna por coordenada X.
   ============================================================ */

// columnas del reporte, por su coordenada X aproximada
const COLS = [
  { k: 'codigo', x: 18 }, { k: 'descripcion', x: 76 }, { k: 'cantidad', x: 215 },
  { k: 'precio', x: 268 }, { k: 'total', x: 329 }
];
const TOLERANCIA_X = 26;   // margen: los números van alineados a la derecha

// los textos del PDF traen escapes octales (\363 = ó) y paréntesis escapados
function desescapar(s) {
  return s.replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
          .replace(/\\([()\\])/g, '$1');
}

// "1,043.19" o "173.000" -> número
function aNumero(s) {
  const limpio = String(s || '').replace(/[^\d.,-]/g, '').replace(/,/g, '');
  const n = parseFloat(limpio);
  return isFinite(n) ? n : 0;
}

// descomprime un stream FlateDecode usando lo que ya trae el navegador
async function inflar(bytes) {
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// saca el texto de todos los streams del PDF
async function textoDelPDF(buffer) {
  const bytes = new Uint8Array(buffer);
  let crudo = '';
  for (let i = 0; i < bytes.length; i += 8192)
    crudo += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));

  const partes = [];
  let pos = 0;
  while (true) {
    const ini = crudo.indexOf('stream', pos);
    if (ini < 0) break;
    // saltar el salto de línea que va después de la palabra "stream"
    let d = ini + 6;
    if (crudo[d] === '\r') d++;
    if (crudo[d] === '\n') d++;
    const fin = crudo.indexOf('endstream', d);
    if (fin < 0) break;
    // El salto de línea que va justo antes de "endstream" no es parte del
    // stream, y si se le cuela al descompresor este falla entero.
    let f = fin;
    while (f > d && (bytes[f - 1] === 10 || bytes[f - 1] === 13)) f--;
    const trozo = bytes.subarray(d, f);
    // 0x78 = cabecera zlib; si no la trae, el stream va sin comprimir
    if (trozo[0] === 0x78) {
      try {
        partes.push(new TextDecoder('latin1').decode(await inflar(trozo)));
      } catch { /* stream ilegible: se salta, los demás pueden servir */ }
    } else {
      partes.push(crudo.slice(d, f));
    }
    pos = fin + 9;
  }
  return partes;
}

// de un stream de página, saca los trozos de texto con su posición
function celdasDePagina(txt) {
  const celdas = [];
  const bloques = txt.match(/BT[\s\S]*?ET/g) || [];
  for (const b of bloques) {
    const td = /([\d.]+)\s+([\d.]+)\s+Td/.exec(b);
    const tx = /\(([\s\S]*?)\)\s*'/.exec(b);
    if (!td || !tx) continue;
    celdas.push({ x: parseFloat(td[1]), y: Math.round(parseFloat(td[2]) * 10) / 10, t: desescapar(tx[1]).trim() });
  }
  return celdas;
}

// agrupa las celdas en filas por su coordenada Y
function filasDe(celdas) {
  const porY = new Map();
  for (const c of celdas) {
    if (!porY.has(c.y)) porY.set(c.y, []);
    porY.get(c.y).push(c);
  }
  return [...porY.entries()]
    .sort((a, b) => b[0] - a[0])          // de arriba hacia abajo
    .map(([y, cs]) => ({ y, celdas: cs.sort((a, b) => a.x - b.x) }));
}

function aRenglon(fila) {
  const r = {};
  for (const c of fila.celdas) {
    const col = COLS.find(k => Math.abs(c.x - k.x) <= TOLERANCIA_X);
    if (col && !r[col.k]) r[col.k] = c.t;
  }
  // una fila de producto es la que tiene código numérico y descripción
  if (!r.codigo || !/^\d+$/.test(r.codigo) || !r.descripcion) return null;
  return {
    codigo: r.codigo,
    descripcion: r.descripcion,
    cantidad: aNumero(r.cantidad),
    precio: aNumero(r.precio),
    total: aNumero(r.total)
  };
}

/* Lee el PDF y devuelve { desde, hasta, renglones[] }.
   El propio reporte trae impreso su rango ("Del Día: 16/08/2026 al
   21/08/2026"), así que la semana no hay que escribirla a mano. */
async function leerReporteVentas(buffer) {
  const paginas = await textoDelPDF(buffer);
  if (!paginas.length) throw new Error('vacio');

  const renglones = [];
  let desde = '', hasta = '';
  for (const pag of paginas) {
    const celdas = celdasDePagina(pag);
    for (const f of filasDe(celdas)) {
      const r = aRenglon(f);
      if (r) renglones.push(r);
      // el rango de fechas viene en su propia celda
      for (const c of f.celdas) {
        const m = /Del\s*D[íi]a:\s*(\d{2})\/(\d{2})\/(\d{4})\s*al\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(c.t);
        if (m) {
          desde = m[3] + '-' + m[2] + '-' + m[1];
          hasta = m[6] + '-' + m[5] + '-' + m[4];
        }
      }
    }
  }
  if (!renglones.length) throw new Error('sin-renglones');
  return { desde, hasta, renglones };
}
