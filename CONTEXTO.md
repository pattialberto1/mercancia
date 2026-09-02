# Contexto para retomar el trabajo

Resumen de las decisiones tomadas y de lo que queda pendiente, para poder
continuar en una conversación nueva sin volver a preguntarlo todo.
Última actualización: 1 de septiembre de 2026.

## Las tres apps

| App | Repo | Qué es |
|---|---|---|
| **Mercancía** | `pattialberto1/mercancia` (público) | Recepción de mercancía + inventario. Es este repo. |
| **Vales** | `pattialberto1/vales-empleados` (**privado**) | Vales de empleados y control de almuerzos |
| **SaaS** | `pattialberto1/mercancia-saas` | Versión multi-negocio con Supabase. Parada por ahora. |

Las tres son PWA de **un solo archivo** (`index.html`), sin build, sin npm y sin
framework. Se publican en GitHub Pages. La sincronización entre teléfonos va por
la **API de GitHub** contra un `datos.json` en la rama `datos` de cada repo, con
mezcla por `id` + `mod` y un mapa `borradas` para las bajas.

Rama de trabajo de este repo: **`claude/chicken-receiving-app-8z1rs2`**.

## Reglas que no se pueden romper

- **`vales-empleados` se queda privado.** Tiene nombres de empleados y montos que
  se descuentan de sueldos.
- **El token de sincronización y la clave de la API de Anthropic no se suben
  nunca a ningún repo.** Se escriben en Ajustes, en cada teléfono.
- Los **ajustes no se sincronizan** (ahí vive el token): `articulosActivos`,
  `porBulto`, `tara`, rangos y claves son por teléfono. Solo viajan
  `recepciones`, `facturas`, `inventarios` y `borradas`.
- **Nada de números inventados.** Si falta un dato, la app lo dice y deja la
  casilla vacía; no rellena con cero ni adivina una equivalencia.

## Reglas del negocio (confirmadas por Alberto)

**La semana va de domingo a sábado.** La misma en las dos apps.

**Las dos cestas de pollo, que no son la misma:**

- La que llega del proveedor trae **18 pollos** enteros → 144 piezas
- Los cocineros pican y arman **cestas de 20 pollos** → 160 piezas, y esas son
  las que se cuentan en la cava
- Por eso **50 cestas recibidas se vuelven 45 marinadas** (900 pollos)
- Un pollo son **8 piezas**, siempre

**Equivalencias del menú** (`EQUIVALENCIAS_BASE`, por código del POS):

- Combo 1 y 2 → 4 piezas · Combo 3 y 4 → 8 piezas · Combo duo → 2 piezas
- Combo 2 lleva además 1 refresco 1L; el combo 4, 2 ensaladas y 1 refresco 1L
- **Combo duo + ref NO lleva refresco**
- **Pote de chino**: 100 g de pechuga, 2 huevos, 50 g de cebollín, 400 g de
  arroz, 2 cucharadas de magia, 1 de azúcar. El **camarón (120 g) solo en los
  de pollo y camarón**
- **Los combos de chino traen 2 potes**, así que van al doble
- **Tender**: 160 g de pechuga
- El «pollo rojo» del chino y el de los tenders son **la misma pechuga**
- Una bandeja de arroz son 6 kg cocidos → **15 potes**
- La **cucharada se toma como 15 g** (promedio, constante `CUCHARADA`)

**Tamaños de bulto:** refresco 1L y 2L → 6 · refresco 1,5L → 12 · agua Minalba
600ml → 24 · agua Glacier 550ml → 24 · malta → 36 · yuky-pack → 24 ·
huevos → 24 por cartón. **Los huevos llegan por cajas de 12 cartones = 288
huevos** (confirmado por Alberto el 2/9). La recepción se teclea en cajas, y se
puede cambiar a cartones o a huevos sueltos cuando no llega caja entera; lo que
se guarda son siempre huevos. El conteo del inventario sigue haciéndose por
cartones.

**Códigos del POS que costó aclarar:** `1630 LITRO Y MEDIO` es el refresco de
1,5L · `1513 AGUA 600ML` es la **Glacier** y `1621 MINALBA 600ML` la Minalba
(antes se sumaban juntas).

## Los dos inventarios, que son cosas distintas

- **📊 Semana** — control de merma: `inicial + recibido − vendido` contra el
  conteo real. El conteo se escribe **como se cuenta**: 17 cestas, 57 bultos y
  12 sueltas; la app hace la multiplicación y la muestra.
- **📋 Inventario físico** — la hoja completa del local, 242 productos en 10
  categorías (`CATALOGO_FISICO`). Dos columnas independientes, *por bulto* y
  *por unidad*, que **no se suman entre sí**, más la observación. Sin merma.

**Cómo se enganchan (2/9):** al cerrar un inventario físico, **su conteo pasa a
ser el inicial del tramo siguiente**, para los renglones vinculados a un
artículo del control (`VINCULO_FISICO`: pollo marinado, los 17 sabores de
refresco, aguas, malta, huevos, yuky-packs, papas, repollos, zanahoria, camarón,
magia, alas). Varios renglones del mismo artículo se suman. Lo que la hoja no
cubre se sigue tecleando a mano, y la pantalla dice de dónde salió cada inicial.
Sin vincular a propósito, porque no hay respuesta única: **cebollín, azúcar y
arroz** (varios renglones cada uno) y **refresco de 1,5L y pechuga** (no están
en la hoja). Un renglón en bultos sin saber qué trae el bulto **no da número:
da el motivo** (`aporteFisico`). Manda siempre la última semana cerrada si la
hay; el físico solo arranca cuando es el último inventario cerrado.

**El tramo lleva los 242 productos (2/9).** No solo los del control: cada
renglón de la hoja tiene su sitio. Los que ya recoge un artículo del control no
se repiten (los 17 sabores de refresco van dentro de «Refrescos de 1L»); el
resto se convierte en un artículo de **solo conteo** (`ARTICULOS_FISICO`, id
`f_<renglón>`), sin entrada ni receta: de esos la app sabe lo que había y lo que
queda, no de dónde salió ni en qué se gastó, y su fila enseña solo *Inicial* y
*Conteo real*. **Solo lo marcado en Ajustes obliga a contar para cerrar la
semana** (`f.activo`); lo demás se cuenta cuando haga falta.

**Cómo se navega:** categorías del papel, plegadas, y solo se pinta el contenido
de las abiertas — el teléfono no monta 240 filas para enseñar diez. Arriba, «⭐
Control de la semana», abierto. Buscador que cruza todas las categorías y las
abre solas. Lo mismo en la hoja del físico. Si un renglón trae bultos y no está
dicho qué trae el bulto, la fila **pregunta el dato ahí mismo** («1 bulto =
¿cuántas unidades?») y lo guarda en `porBulto`, que **no se sincroniza**: es de
cada teléfono.

**Tamaños de bulto de la hoja, confirmados el 2/9** (van en `defaults.settings.
porBulto`, no en cada teléfono, porque son del producto): arroz Mary → 24 sacos
de 900 g · ajinomoto → 25 kg · tina salsera 1oz → 1.000 · vasos V67 → 25
paquetes. El arroz Mary se cuenta en **sacos** y los vasos V67 en **paquetes**
(`UNIDAD_FISICO`).

**Un renglón de factura se puede apuntar a un producto (2/9).** Es la única vía
de entrada de lo que solo está en la hoja: esos productos no se pesan ni se
cuentan en una recepción. En el renglón se elige el artículo (`l.art`) y si la
cantidad viene en bultos (`l.enBultos`). El nombre impreso casi nunca coincide
—«Base de Salsa de Tomate 3,80 Kg» contra «Salsa de tomate mayo 3,8kg»— así que
**se elige de una lista, no se adivina por el texto**. Un renglón apuntado no se
vuelve a contar por nombre (`recibidoPorFacturaDirigida`).

**Todo lo que se recibe entra solo**: cada producto de `PRODUCTOS` tiene su
artículo, y las facturas de proveedor se reconocen por el nombre del renglón
(`entrada: { tipo: 'factura', nombres: [...] }`).

**«Faltan» ≠ «se consumieron».** Si ningún producto del menú consume ese
artículo, la app no puede saber cuánto debía gastarse: dice *«se consumieron X
esta semana»*, no *«faltan X»*. Ver `tieneConsumoConocido()`.

## Estado de los datos (rama `datos`)

- 119 recepciones, 3 facturas de Tierra Santa
- **Tramo del 1 al 5 de septiembre**, abierto, con el conteo del 31/08 como
  inicial (pollo 2.720 piezas = 17 cestas, y las bebidas e insumos cargados)
- **Inventario físico del 31/08**, cerrado, 173 de 242 productos contados

## Lo que falta

1. **Receta del tender** — 300 g de ajo, 150 g de mostaza, 100 g de marinado,
   pero no se sabe **para cuántos tenders**. Alberto quedó en verlo cuando los
   hagan.
2. **Recetas de papas, repollo, zanahoria y lo de Tierra Santa** — sin ellas
   esos artículos muestran consumo, no merma.
3. Cuatro renglones del inventario físico que no se pudieron cargar: refresco
   de 1,5L y pechuga (no aparecen en la hoja), arroz (70 bultos, sin saber los
   kg por bulto). Lo de *«HUEVOS 7»* quedó aclarado el 2/9: son **7 huevos
   sueltos**, no cartones.
4. **Repasar la transcripción** de la hoja de agosto: son 173 renglones leídos a
   mano de un escaneo.
5. Camarones: decidido que entran con 120 g por pote de P&C, pero **no se
   registra su entrada** todavía.

## App de Vales — lo esencial

Límite **$30 semanales** por empleado (avisa y deja autorizar por encima, y lo
marca); antigüedad **30 días** (bloquea). 33 empleados activos, todos con fecha
de ingreso. El precio se congela en cada consumo. Nada se borra, se desactiva.

Tiene control de **almuerzos**: se toca el nombre, 5 minutos de preparación y 30
de comida, con aviso por **ntfy.sh** para que llegue con el teléfono bloqueado
(el canal de ntfy es la contraseña: no se comparte ni se sincroniza). Todos los
tiempos se derivan de una marca de inicio guardada, **nunca de un contador**,
porque iOS congela el JavaScript en segundo plano.

El resumen semanal de WhatsApp lleva **el detalle de lo que pidió cada
empleado**, no solo el monto.

## Cómo se verifica

Las pruebas están en `pruebas/` (ver su README). Son Playwright contra el
`index.html` real, con datos reales del negocio. Al terminar cualquier cambio:

```bash
for t in pruebas/*-test.js; do NODE_PATH=/opt/node22/lib/node_modules node $t | tail -1; done
```

Al tocar `index.html` hay que **subir la versión de caché en `sw.js`**, o los
teléfonos siguen con la versión vieja.
