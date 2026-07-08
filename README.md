# Mercancía — Recepción de mercancía

App para iPhone (web app instalable) para controlar la recepción de mercancía del negocio.
Esta primera versión cubre la **recepción de pollo**; más adelante se irán añadiendo otros apartados.

## Cómo funciona la recepción de pollo

- El pollo llega en cestas y se pesa **de 2 en 2 cestas**. Los pesos se anotan en **kg enteros**.
- Cada pesada de 2 cestas debe estar entre **68 y 71 kg** (configurable en Ajustes ⚙️).
  Si una pesada queda fuera del rango, la app avisa y pide confirmación antes de anotarla.
- Si sobra una **cesta suelta**, se registra con el modo "1 cesta" (rango 32–37 kg, configurable).
- La app suma todas las pesadas (peso bruto), cuenta las cestas y descuenta la **tara**:
  cada cesta vacía pesa **2,3 kg** (también configurable).
- Se anota también cuántas **cestas vacías se lleva el proveedor**, y sale en el resumen.

**Pollo neto = peso bruto − (nº de cestas × 2,3 kg)**

Ejemplo real: 13 pesadas de 69 kg + 2 de 70 + 7 de 68 + 1 cesta suelta de 35 kg
= 1.548 kg bruto, 45 cestas → tara 103,5 kg → **1.444,5 kg de pollo neto**.

## Funciones

- Botones rápidos 68/69/70/71 kg: una pesada por toque.
- Aviso y confirmación para pesadas fuera de rango.
- Totales en vivo: pesadas, cestas, bruto, tara y pollo neto.
- Resumen agrupado (ej. "13 × 69 kg") y lista de pesadas con opción de borrar.
- Historial de recepciones guardado en el propio teléfono (funciona sin internet).
- Contador de cestas vacías que se lleva el proveedor.
- Botón "Enviar por WhatsApp": abre WhatsApp con el parte del día ya escrito, listo
  para elegir el contacto y enviarlo. También hay botón para copiar el resumen.
- Ajustes: tara por cesta y rangos mínimo/máximo (2 cestas y cesta suelta).

## Cómo instalarla en el iPhone

1. Publica este repositorio con **GitHub Pages**:
   en GitHub → *Settings* → *Pages* → *Branch*: la rama principal, carpeta `/ (root)` → *Save*.
   GitHub te dará una dirección tipo `https://usuario.github.io/mercancia/`.
2. Abre esa dirección en **Safari** en el iPhone.
3. Toca el botón **Compartir** (cuadrado con flecha) → **"Añadir a pantalla de inicio"**.
4. Ya tienes el icono 🥚 en el iPhone; se abre a pantalla completa como una app normal
   y funciona aunque no haya cobertura.

## Estructura

- `index.html` — toda la app (interfaz + lógica), sin dependencias externas.
- `manifest.webmanifest` — datos de instalación (nombre, icono, color).
- `sw.js` — service worker para que funcione sin conexión.
- `icons/` — iconos de la app.

Los datos se guardan en `localStorage` del navegador, solo en el dispositivo.
