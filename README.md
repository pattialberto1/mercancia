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

La pantalla de inicio tiene estas pestañas: **🐔 Pollo**, **🥔 Papas**, **🥬 Verduras**
(repollo blanco, repollo morado, zanahoria y cebollín — al crear una recepción de
verduras la app pregunta cuál llega), **🍗 Alitas** (control de bolsas, ver abajo),
**🥤 Bebidas** (productos que se cuentan, ver abajo) y **🧾 Tierra Santa** (facturas
de proveedores).

- Las papas y las verduras se pesan **de 1 a 5 cestas** por pesada (selector en pantalla).
- En la pestaña de verduras hay un botón **"Enviar verduras del día"** que junta todas
  las recepciones de verduras de hoy en un solo mensaje de WhatsApp, con el neto de
  cada producto, el total y las cestas vacías devueltas.
- El peso se escribe directamente y **admite decimales** (ej. 72,4). No hay rango ni avisos.
- La tara es la misma: 2,3 kg por cesta, y el neto se calcula igual que con el pollo.
- Para agregar un producto nuevo: una línea en `PRODUCTOS` y su pestaña (o grupo) en `TABS`,
  en `index.html`.

Ejemplo real: 13 pesadas de 69 kg + 2 de 70 + 7 de 68 + 1 cesta suelta de 35 kg
= 1.548 kg bruto, 45 cestas → tara 103,5 kg → **1.444,5 kg de pollo neto**.

## Bebidas y empaques — se cuentan, no se pesan

Refrescos, aguas y envases no se pesan: se cuentan. La pestaña **🥤 Bebidas**
anota **cuántas unidades** llegan, sin cestas, sin tara y sin kilos, y el total
es la suma de lo que entró.

Estos productos son los que alimentan el módulo de Inventario: como se compran y
se venden en la misma unidad, lo recibido y lo vendido se pueden restar
directamente, sin equivalencias de por medio.

### Los huevos llegan por cajas

Nadie cuenta huevo por huevo lo que llega: llegan en **cajas de 12 cartones de 24
huevos cada uno**, o sea **288 huevos por caja**. La pantalla de recepción arranca
pidiendo **cuántas cajas**, y encima del campo hay un selector para cambiar a
**cartones** (24) o a **huevos sueltos** cuando no llega caja entera.

Lo que se guarda son siempre **huevos** — la caja es solo la forma de teclearlo —
así que el inventario, la receta del pote de chino y el conteo por cartones
siguen funcionando igual. La entrada se relee tal como se escribió: *«2 cajas ·
576 huevos»*. Las entradas viejas, anotadas antes de esto, se siguen leyendo en
huevos: la app **no les inventa un número de cajas**.

Para agregar otro producto que se cuente, se define con `unidad: true` en
`PRODUCTOS` — igual que `bolsa: true` para los que se pesan sueltos. Si además
llega empacado, se le pone una lista `empaques` con el nombre y cuántas unidades
trae cada uno; el primero de la lista es el que sale marcado por defecto.

## Alitas — solo control de peso

La pestaña **🍗 Alitas** es distinta a las demás: no hay cestas, no hay tara y no
hay rango. Cada pesada es directamente **el peso de una bolsa**, y el total es la
suma exacta de lo pesado — no lleva ningún descuento. Sirve para llevar el control
de cuánto entra, no para calcular un neto a partir de un bruto.

- Se escribe el peso de cada bolsa (admite decimales, ej. 4,25) y se pulsa «Añadir».
- El total («ALITAS NETAS») es simplemente la suma de las bolsas anotadas.
- No aparecen las tarjetas de «Cestas», «Tara» ni «Cestas vacías», porque no aplican.
- El resumen de WhatsApp lista cada bolsa con su peso y el total, sin mencionar
  cestas ni tara.

Para agregar otro producto "de control simple" igual que este (sin cestas ni tara),
se define con `bolsa: true` en `PRODUCTOS` — el resto de la app (totales, lista de
pesadas, resumen de WhatsApp) se ajusta solo.

## Facturas de proveedores

La pestaña **🧾 Tierra Santa** no lleva pesadas: guarda las **facturas de
proveedores** (Tierra Santa trae las verduras; las bebidas y los empaques vienen
de otro). Cada factura lleva su proveedor: se escribe una vez y queda sugerido
para las siguientes. Le tomas una foto a la factura y la app saca sola todos los
renglones (producto, cantidad, unidad, precio e importe).

1. **🧾 Nueva factura** → **📷 Tomar o elegir foto** (cámara o carrete).
2. **✨ Leer la factura**: en unos segundos aparecen los productos, el nº de
   factura, la fecha y el total.
3. **Repasa siempre lo leído.** Se toca cualquier renglón para corregir el
   nombre, la cantidad, la unidad, el precio o el importe; con **+ Añadir** se
   agrega uno que se haya saltado. Al cambiar cantidad o precio, el importe se
   recalcula solo (y se puede corregir a mano si la factura trae un descuento).
4. Si el total impreso en la factura no cuadra con la suma de los renglones,
   la app avisa en rojo y dice cuánto falta o sobra.
5. **📲 Enviar por WhatsApp**: manda el parte con todo lo que llegó, el total y
   si queda por pagar. Con **✅ Marcar como pagada** el mensaje deja de
   reclamar el pago.

El mensaje va en una línea por producto (*«Queso Merideño · 5,24 kg · $38,99»*)
para que no se parta en el teléfono, y los nombres se limpian: los que vienen
en mayúsculas de la factura salen legibles y sin el «KG» repetido, que ya sale
en la cantidad. Dentro de la app el nombre se sigue guardando tal como está
impreso en la factura. El precio por unidad no va en el mensaje: está en la app
y en la propia factura.

La factura se puede llevar en **dólares o en bolívares** (selector de moneda).

### Clave para leer facturas

Leer la foto lo hace un servicio de IA, así que hace falta una clave:

1. Sacar una clave de API en [console.anthropic.com](https://console.anthropic.com)
   → *API keys* → *Create key* (empieza por `sk-ant-…`).
2. Pegarla en la app: **Ajustes ⚙️ → Clave para leer facturas**, en cada teléfono
   que vaya a leer facturas.

La clave se guarda **solo en ese teléfono** y nunca se sube al repositorio, igual
que el código de sincronización. Cada foto leída tiene un pequeño costo en esa
cuenta; escribir los renglones a mano no cuesta nada.

Las facturas sí se comparten entre teléfonos por la sincronización normal.
**La foto no se comparte**: se queda en el teléfono que la tomó (pesa demasiado
para subirla). Si al teléfono se le acaba el espacio, la app suelta primero las
fotos más viejas y conserva los datos ya leídos.

## Inventario semanal

La pestaña **📊 Inventario** compara lo que entró contra lo que se vendió, para
ver si cuadra con el conteo físico.

```
esperado = lo que había al empezar la semana
         + lo recibido (de las recepciones ya registradas)
         − lo vendido (del reporte del sistema)
```

### De dónde sale «lo inicial»

Cada tramo parte del **último inventario cerrado que haya antes**, y hay dos
clases:

- **De una semana cerrada** — su conteo real pasa entero al tramo siguiente.
  Es el encadenado normal, semana tras semana.
- **De un inventario físico cerrado** — la hoja del local se traduce a los
  artículos del control: 17 cestas marinadas son 2.720 piezas, 10 bultos de
  Coca-Cola 1L más 2 sueltas son 62 refrescos, y los sabores de un mismo tamaño
  se suman en un solo artículo. Es lo que pasa después del conteo de cierre de
  mes.

Lo que la hoja **no** cubre se sigue escribiendo a mano en la casilla «Inicial»,
y cada renglón de la pantalla dice de dónde salió el suyo. Quedan sin vincular a
propósito el cebollín, el azúcar y el arroz (la hoja los trae en varios
renglones y nadie ha dicho cuáles cuentan) y el refresco de 1,5L y la pechuga
(no aparecen en la hoja).

Si un renglón trae bultos y no está dicho qué trae cada bulto, la app **no da un
total corto**: dice cuál es el renglón y qué falta para poder convertirlo.

### Los 242 productos, sin scroll infinito

El tramo semanal lleva **todo lo que está en la hoja del local**, no solo los
artículos del control. Cada renglón tiene su sitio: los que ya recoge un
artículo del control no se repiten (los sabores de refresco van dentro de
«Refrescos de 1L», así no se cuentan dos veces) y el resto entra como producto
de **solo conteo** — sin «recibido» ni «vendido», porque no hay de dónde
recibirlo ni receta que lo gaste. Su fila es corta: *Inicial* y *Conteo real*, y
debajo lo que se consumió.

Para que se pueda recorrer en un teléfono van **por las categorías del papel y
plegadas**, y solo se pinta lo que está abierto. Arriba, un grupo **⭐ Control de
la semana** con lo que hay que contar sí o sí; debajo, las diez categorías en el
orden de la hoja. El buscador cruza todas y las abre solas.

**Solo lo marcado en ⚙️ Equivalencias obliga a contar para cerrar la semana.**
Los otros 200 y pico se cuentan cuando haga falta.

### De dónde sale «lo recibido»

**Todo lo que se anota entra solo al inventario de la semana**: las recepciones
de pollo, papas, verduras, alitas, bebidas, huevos e insumos, y también los
renglones de las **facturas de proveedor** (el cilantro y el queso de Tierra
Santa se reconocen por el nombre del renglón). No hay que copiar nada a mano.

**La pestaña 🍚 Insumos** es para lo que entra a la cocina y no se vende tal
cual: pechuga, camarón, arroz, magia y azúcar. Se pesan igual que las alitas.

### «Faltan» no es lo mismo que «se consumieron»

Solo se puede hablar de merma cuando hay una receta que diga cuánto gasta cada
plato. Del pollo se sabe; de las papas y las verduras, todavía no. En esos
casos la app dice **«se consumieron X esta semana»** en vez de «faltan X»:
es el mismo número, pero no acusa a nadie de un robo que nadie ha comprobado.

### Dos inventarios distintos

- **📊 Semana** — el control de merma: *inicial + recibido − vendido* contra el
  conteo real. Son pocos artículos, los que se venden y se pueden cuadrar.
- **📋 Inventario físico** — la hoja completa del local (242 productos en 10
  categorías), la misma que se llena a mano. Dos columnas independientes, *por
  bulto* y *por unidad*, más la observación — igual que en el papel. Aquí **no
  hay merma**: la mayoría no se vende, se consume, así que no hay contra qué
  compararlo. Es una foto de un día.

**Cuidado con las dos cestas.** La que llega del proveedor trae **18 pollos
enteros** (144 piezas). Los cocineros los pican y los reacomodan en **cestas de
20 pollos** (160 piezas), que son las que se cuentan en la cava. Por eso *50
cestas recibidas se vuelven 45 marinadas*, y usar 160 para lo recibido inflaba
la entrada un 11%.

**El «lo que había al empezar» no es opcional.** Es el conteo con el que se cerró
la semana anterior, y sin él los números nunca cuadran: se vende mercancía que
entró la semana pasada. Con datos reales, una semana dio *−872 piezas* sin ese
arrastre. La primera semana se escribe a mano (el conteo con el que arranca:
el sábado al cerrar, o el domingo antes de abrir); de ahí en adelante sale solo.

La semana va de **domingo a sábado**, la misma que usa la app de Vales.

### Cómo se usa

1. **📊 Nueva semana**.
2. **📄 Elegir el PDF** del reporte de ventas exportado del sistema. Se lee en el
   propio teléfono, sin subirlo a ningún lado, y **el PDF no se guarda**: solo los
   datos leídos.
3. Escribir el **conteo real** de cada artículo, **como se cuenta en el negocio**:
   *15 cestas* de pollo, *57 bultos y 12 sueltas* de refresco. La app hace la
   multiplicación y muestra la cuenta hecha (*15 cestas × 160 = 2400 piezas*),
   para que se pueda revisar. Cuántas unidades trae un bulto se dice una sola
   vez, por artículo, en **⚙️ Equivalencias → Qué se controla**; la del pollo
   sale sola del rendimiento de la cesta.
4. **Cerrar la semana**: ese conteo pasa a ser el punto de partida de la siguiente.

### Dos avisos que evitan números falsos

- **Si el reporte no cubre la misma semana**, la app lo dice. El PDF trae impreso
  su propio rango (*«Del Día: 16/08/2026 al 21/08/2026»*) y se compara con la
  semana: si al exportarlo eliges otro rango, faltarían ventas y la merma saldría
  inflada.
- **Si el esperado sale negativo**, no lo llama merma: avisa de que se vendió más
  de lo que la app tiene registrado y que falta cargar el inicial o las entradas.
  Tampoco deja cerrar la semana así, porque ese error se arrastraría para siempre.

### Qué se controla

En **⚙️ Equivalencias** se elige qué artículos se controlan. **De arranque solo
el pollo**, a propósito: activar algo sin registrar sus entradas haría que las
cuentas salieran en negativo semana tras semana. Cada bebida se activa cuando
ya se esté anotando lo que entra de ella.

Disponibles: piezas de pollo, refrescos de 1L, de 1,5L y de 2L, agua de 600 ml
y yuky-packs.

### Equivalencias

El sistema vende platos, no insumos: no se puede restar «730 combos» de «kg de
pollo». Por eso cada producto del reporte declara qué consume, atado a su **código**
(no al nombre, que puede cambiar):

| Producto | Consume |
|---|---|
| COMBO 1 y COMBO 2 | 4 piezas de pollo |
| COMBO 3 y COMBO 4 | 8 piezas de pollo |
| COMBO DUO | 2 piezas |
| COMBO 2 y COMBO 4 | además, 1 refresco de 1L |

Entrada de pollo: **1 cesta = 18 pollos, que al picarse rinden 20 → 160 piezas.**

Esto destapa el consumo que no se ve en el reporte: en una semana real se
vendieron **190 refrescos de 1L sueltos, pero los combos se llevaron 747 más**.

Lo que no consume nada de lo controlado (postres, tés, delivery) simplemente no
lleva equivalencia. La app solo avisa de los que suenan a pollo o bebida.

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
repositorio es público, ese archivo de datos también lo es (pesos, cantidades y
los renglones de las facturas, nada más). Ni el token de sincronización ni la
clave para leer facturas se guardan nunca en el repositorio; las fotos de las
facturas tampoco salen del teléfono que las tomó.
