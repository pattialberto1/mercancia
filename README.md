# Mercancía — Recepción de mercancía

App para iPhone (web app instalable) para controlar la recepción de mercancía del negocio.
Cubre la **recepción de pollo** y la **recepción de papas**; se irán añadiendo más apartados.

## Cómo funciona la recepción de pollo

- El pollo llega en cestas y se pesa **de 2 en 2 cestas**. Los pesos se anotan en **kg enteros**.
- Cada pesada de 2 cestas debe estar entre **65 y 75 kg** (configurable en Ajustes ⚙️).
  Si una pesada queda fuera del rango, la app avisa y pide confirmación antes de anotarla.
- Botones rápidos de 67 a 71 kg para anotar las pesadas más habituales con un toque.
- Si sobra una **cesta suelta**, se registra con el modo "1 cesta" (rango 32–37 kg, configurable).
- La app suma todas las pesadas (peso bruto), cuenta las cestas y descuenta la **tara**:
  cada cesta vacía pesa **2,3 kg** (también configurable).
- Se anota también cuántas **cestas vacías se lleva el proveedor**, y sale en el resumen.

**Pollo neto = peso bruto − (nº de cestas × 2,3 kg)**

## Cómo funcionan las papas y las verduras

La pantalla de inicio tiene tres pestañas: **🐔 Pollo**, **🥔 Papas** y **🥬 Verduras**
(repollo blanco, repollo morado y zanahoria — al crear una recepción de verduras la
app pregunta cuál de los tres llega).

- Las papas se pesan **de 5 en 5 cestas**; las verduras **de 1 a 3 cestas** por pesada
  (el selector de cestas se ajusta solo).
- El peso se escribe directamente y **admite decimales** (ej. 72,4). No hay rango ni avisos.
- La tara es la misma: 2,3 kg por cesta, y el neto se calcula igual que con el pollo.
- Para agregar un producto nuevo: una línea en `PRODUCTOS` y su pestaña (o grupo) en `TABS`,
  en `index.html`.

Ejemplo real: 13 pesadas de 69 kg + 2 de 70 + 7 de 68 + 1 cesta suelta de 35 kg
= 1.548 kg bruto, 45 cestas → tara 103,5 kg → **1.444,5 kg de pollo neto**.

## Funciones

- Botones rápidos 67/68/69/70/71 kg: una pesada por toque.
- Aviso y confirmación para pesadas fuera de rango.
- Totales en vivo: pesadas, cestas, bruto, tara y pollo neto.
- Resumen agrupado (ej. "13 × 69 kg") y lista de pesadas con opción de borrar.
- Historial de recepciones guardado en el propio teléfono (funciona sin internet).
- Contador de cestas vacías que se lleva el proveedor.
- Botón "Enviar por WhatsApp": abre WhatsApp con el parte del día ya escrito, listo
  para elegir el contacto y enviarlo. También hay botón para copiar el resumen.
- Ajustes: tara por cesta y rangos mínimo/máximo (2 cestas y cesta suelta).

## Código de acceso

Al abrir la app por primera vez en un teléfono pide un **código de acceso (PIN)**,
definido en `index.html` (constante `PIN`). Se escribe una vez por teléfono.
Al cambiar el PIN en el código, todos los teléfonos vuelven a pedirlo — así se
puede dejar fuera a quien no deba entrar. Es una barrera práctica, no un
cifrado: los datos compartidos siguen protegidos por el token de sincronización.

## Sincronización entre teléfonos

Los datos se comparten entre todos los teléfonos a través de un archivo (`datos.json`)
guardado en la rama `datos` de este mismo repositorio. Para activarla:

1. El dueño del repositorio crea un **token de GitHub** (una sola vez):
   GitHub → foto de perfil → *Settings* → *Developer settings* →
   *Personal access tokens* → **Fine-grained tokens** → *Generate new token*.
   - *Repository access*: **Only select repositories** → elegir `mercancia`.
   - *Permissions* → *Repository permissions* → **Contents: Read and write**.
   - *Expiration*: 1 año (cuando caduque, se genera otro y se vuelve a pegar).
2. Copiar el token (empieza por `github_pat_…`) y pegarlo en la app:
   **Ajustes ⚙️ → Código de sincronización**, en **cada teléfono**.
3. Listo: cada cambio se sube solo, y la app comprueba novedades al abrirse,
   al volver a primer plano y cada 30 segundos. Sin conexión sigue funcionando
   y sincroniza cuando vuelve el internet.

Si dos personas modifican **la misma recepción** a la vez, se queda la versión
modificada más recientemente. Recepciones distintas nunca chocan.

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

Los datos se guardan en `localStorage` del navegador y, si la sincronización está
activada, también en `datos.json` en la rama `datos` del repositorio. Ojo: si el
repositorio es público, ese archivo de datos también lo es (pesos y cantidades,
nada más). El token de sincronización nunca se guarda en el repositorio.
