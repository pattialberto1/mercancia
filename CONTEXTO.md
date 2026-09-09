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

**La semana va de LUNES a DOMINGO** (cambiado el 7/9/2026; antes era de domingo
a sábado). El inventario se hace **los lunes**, con lo vendido hasta el domingo
incluido, que es como sale el reporte del POS. Con la semana anterior el domingo
se quedaba fuera del control todas las semanas.

⚠️ **La app de Vales sigue con la semana vieja (domingo a sábado).** Estaban
alineadas a propósito; ahora no lo están. Falta decidir si se cambia también:
ahí hay períodos ya cerrados con descuentos de nómina hechos.

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
- **Pote de chino**: 100 g de pechuga, **medio huevo** («medio cucharón», los
  3-4 cartones que se rompen duran días; confirmado el 7/9 con la semana del 1
  al 6, que con dos por pote pedía 2.366 huevos y solo entraron 871), 50 g de
  cebollín, 400 g de arroz, 2 cucharadas de magia, 1 de azúcar. El **camarón
  (120 g) solo en los de pollo y camarón**
- **Los combos de chino traen 2 potes**, así que van al doble
- **Tender**: 160 g de pechuga
- El «pollo rojo» del chino y el de los tenders son **la misma pechuga**
- Una bandeja de arroz son 6 kg cocidos → **15 potes**
- La **cucharada se toma como 15 g** (promedio, constante `CUCHARADA`)
- **Papas fritas**: 350 g por ración (Alberto dijo «300-400 g aprox»,
  `RACION_PAPAS`). Solo llevan papas los **combos de pollo broaster** —duo,
  combo 1, 2, 3 y 4— y la ración aparte. Los combos de chino no llevan.
  **Los combos 3 y 4 llevan una sola ración**, aunque traigan 8 piezas de pollo
  (confirmado por Alberto el 7/9).
- **Ensalada rallada**: una tanda son 21 kg de verduras (16 de repollo blanco,
  2,5 de zanahoria, 2,5 de repollo morado) más la mayonesa (3 licuadoras de 15
  huevos, 3 kg de azúcar, 40 g de limón, 80 g de sal, 160 g de vinagre, 25 g de
  mostaza, 3 litros de aceite). Se raciona en potes de 170 g →
  **172 potes por tanda** (`POTES_POR_TANDA`), y de ahí sale lo que gasta cada
  pote. Solo llevan ensalada el **combo 2 (1 pote)** y el **combo 4 (2 potes)**.
  Sal, vinagre, mostaza y aceite **no están en la receta de la app**: en la hoja
  hay dos vinagres, dos sales y cuatro aceites, y elegir uno sería inventar.
- **Lumpias**: se reciben y se cuentan **por unidad**; 1 lumpia por ración.
- **Ketchup botella** (código 1615) se descuenta de la botella de la hoja.
- **Picadillo de pollo** (1572): se vende a 1 $ el kilo, así que cada unidad del
  reporte es 1 kg. Sale del pollo de las cestas, pero **falta cuántas piezas
  hacen un kilo** para descontarlo del pollo en vez de contarlo aparte.
- **Lumpias**: la ración (1598) son **2 unidades**; el código «1 LUMPIA» (1612)
  es una. **Arepitas fritas** (1514): la ración son **10 unidades**.
- **Envases** (1583): CT1, CT2 y CT3 se controlan **como un solo montón**,
  porque el POS cobra «ENVASES» sin decir cuál y el reporte tampoco dice qué
  ventas fueron delivery. En la hoja cada uno conserva su bulto (88, 105 y 90).
  Por producto: CT1 para el combo duo, la ración de papas y los combos 1 y 2;
  CT3 para los combos 3 y 4.
- **Bebidas que el POS no separa por sabor** — Gatorade (1574), jugos Barinas
  (1603) y Tenta té (1608 y 1609): cada una junta sus renglones de la hoja en un
  artículo y se descuenta del total.
- **Postres**: «POSTRE EXTRA» (1585) son los Paolo; el tres leches se cobra por
  el código de la **marquesa de chocolate** (1528).
- **«4 salsas»** (1584) son 4 sobres Chef Quality. **«1 vas. salsa tomate»**
  (1614) sale de la *Salsa de la casa racionada* y **«1 vas. salsa agridulce»**
  (1613) de la *Salsa agridulce racionada* (confirmado el 8/9; los dos renglones
  se parecen tanto que conviene no tocarlos de memoria).
- **No descuentan nada a propósito** (`nada: true`, con su porqué a la vista):
  los seis DELIVERY —es el cobro del envío—, PRINGLES —ahí se cobran
  diferencias— y RACION IMPORTADAS PAPAS FRITAS —fue un error de cobro—. No es
  que falte el dato: es que por ahí no sale mercancía.

El tramo trae además **todo lo que gasta una receta**, aunque no esté marcado
activo ni recoja ningún renglón de la hoja. Si no, el azúcar de la ensalada —que
está sin vincular a propósito, porque en la hoja hay cinco marcas— se perdía sin
que nada avisara: `vendidoEnSemana` descarta lo que no está en la lista.

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

**Tamaños de bulto de la hoja, cargados el 2/9** (van en `defaults.settings.
porBulto`, no en cada teléfono, porque son del producto): arroz Mary → 24 sacos
de 900 g · ajinomoto → 25 kg · tina salsera 1oz → 1.000 · vasos V67 → 25 paq ·
aceite Portumesa → 12 · aceite humo sésamo → 4 · azúcar dulcería → 15 kg · CT1 →
88 · CT2 → 105 · CT3 → 90 · salsa BBQ → 24 · salsa soya negra concentrado → 4 ·
salsa soya clara (caja de 4) → 4 · vinagre Sansone → 4 · salsa de tomate mayo
3,8kg → 4. **Casi todos estaban ya escritos en las observaciones de la hoja de
agosto** («La caja trae 4 und»); vale la pena mirar ahí antes de preguntar.
El arroz Mary se cuenta en **sacos**, y los vasos V67 y los rollos térmicos en
**paquetes** (`UNIDAD_FISICO`).

**Platos N10 y Platos N9 → 200 por bulto** (confirmado el 5/9). Ojo: la
observación de la hoja de agosto en el renglón de Platos N10 dice «750 und», que
no cuadra con eso; manda lo que dijo Alberto y la observación se queda como
estaba, por si hay que revisarla.

Sin poner a propósito: **tapa de tina de ensalada** (se sabe lo que hay —8 bultos
y 92 sueltas— pero no lo que trae un bulto) y **Harina Pan** («de 2 kg» es lo que
pesa el paquete, no cuántos trae la caja).

**Las facturas llevan IVA (4/9).** El campo `iva` es el importe que dice el
papel, no un porcentaje calculado: cada factura trae el suyo y hay proveedores
exentos. `facBase()` suma los renglones y `facTotal()` le añade el IVA. El aviso
de descuadre admite **un céntimo por renglón** (`toleranciaFactura`), porque el
papel redondea cada renglón y en una factura larga se separan unos céntimos sin
que nadie se haya equivocado (Flor de Catia: 7 renglones, 3 céntimos).

**Ojo con los duplicados (4/9).** Los 22 renglones de la hoja que ya tenían
artículo propio alimentado por el nombre del renglón de la factura (aguacate,
tomate, limón, melón, cilantro… de Tierra Santa) están ahora en
`VINCULO_FISICO`. Sin ese vínculo salían **dos veces**: el artículo del control
recibiendo de la factura y el renglón de la hoja llevándose el inicial, cada uno
con la mitad del cuadro. Al añadir un artículo con `entrada: {tipo:'factura'}`
hay que vincular su renglón, y `tramo-completo-test.js` lo comprueba.

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

- **Comprobante de Tierra Santa** nº 11017183 del 4/9/2026: 49,1 kg de verdura
  y fruta (aguacate, lechuga, cilantro, apio España, ajo porro, tomate, guayaba,
  tomate de árbol, melón, patilla, parchita, plátano, limón) más 5 $ de servicio
  = **82,82 $**, exento de IVA y sin pagar.
- **Facturas del 3/9/2026**, cargadas el 4/9. **Lácteos Flor de Catia** nº 107474:
  350 cajas de refresco de 1L (7 sabores × 50) = **2.100 unidades**, 1.316,56 +
  210,65 de IVA = 1.527,24 $. **Distribuidora Yaru 2012** nº 15149: gatorade
  tropical 36, Lipton durazno 36, té verde 24, Lipton limón 24 y **72 yuky-packs**
  (48 durazno + 24 manzana), 230,39 + 36,86 = 267,25 $. Las dos a crédito, sin
  pagar. Los dos proveedores ya son de fábrica.
- **Nota de entrega de Alimentos Natropic**, nº 8483 del 1/9/2026: 8 cajas de
  «Base de Salsa de Tomate 3,80 Kg» a 25,08 $ = 200,64 $, sin IVA. Cargada el
  2/9 apuntando a `f_salsa_de_tomate_mayo_3_8kg` y marcada *en bultos*, así que
  entran 32 paquetes. **Alimentos Natropic** ya es proveedor de fábrica.

- 119 recepciones, 3 facturas de Tierra Santa
- **Tramo del 1 al 5 de septiembre**, abierto, con el conteo del 31/08 como
  inicial (pollo 2.720 piezas = 17 cestas, y las bebidas e insumos cargados)
- **Inventario físico del 31/08**, cerrado, 173 de 245 productos contados

## Qué se lleva cada semana

Alberto el 9/9: *«vamos a simplificar el inventario… porque no me está
funcionando el inventario entero»*. Llevar los 245 renglones de la hoja cada
semana no era realista. El **control de la semana** pasa a ser, por defecto,
**todo lo que tiene forma de entrar en la app** —recepción propia o renglón de
factura— más los pocos renglones que él nombró y que solo viven en la hoja:
postres Paolo y tres leches, Lipton durazno y limón, té verde, agua Minalba de
1,5L y la ensalada. Son **54 productos**, no 245.

- Se aplica **una sola vez por teléfono** (`settings.controlSimplificado`), y
  después se puede tocar a mano sin que vuelva a pisarse. Los ajustes no se
  sincronizan, así que cada teléfono lo hace al abrir la versión nueva.
- El botón **«⭐ Llevar todo lo que entra por la app»** en Equivalencias lo
  vuelve a poner entero cuando haga falta.
- **Marcar un artículo es decir «de este sigo las entradas»**, así que lleva la
  fórmula entera aunque esa semana no haya entrado nada. Sin eso, un renglón de
  la hoja elegido a mano desaparecía del cuadre las semanas flojas.
- La lista de «Qué controlar» enseña lo que entra por la app **más** los
  renglones de la hoja que ya se llevan o que alguna receta gasta. Los otros 200
  no salen ahí: sería una lista imposible de recorrer.

El resto de la hoja se sigue contando en el **inventario físico** cuando toque,
pero no obliga a nada cada semana.

## El cuadre

Dentro de cada semana hay un botón **«📊 Ver el cuadre»** que resume cómo va,
sin pedir nada nuevo: lee lo mismo que la pantalla del tramo (`calcular` +
`estadoCuadre`, que vive en un solo sitio justo para que las dos pantallas no
puedan discrepar) y lo ordena por lo que hay que mirar primero.

- Arriba la cifra que decide si hay que hacer algo hoy: cuántos productos no
  cuadran de los contados. **Mientras no haya un solo conteo escrito, la cifra
  es lo que falta por contar** — decir «0 no cuadran» sería mentir por omisión.
- Cuatro casillas: cuadran, faltan, sobran, por contar. **Todas cuentan solo el
  ⭐ control de la semana**, que son los que hay que contar para poder cerrar.
  Contar los 51 que tienen fórmula daba un «51 por contar» que no significaba
  nada: casi todos son renglones de la hoja que nadie eligió llevar. El resto va
  aparte y al final.
- **Qué entra en esta semana**: cuántas recepciones y facturas caen dentro, y
  —lo que más costaba entender— **cuántas quedan fuera por ser posteriores**.
  Lo recibido hoy no suma en la semana que se está cuadrando; la app siempre lo
  hizo bien, pero no lo decía en ningún sitio. Ahí van también el reporte, su
  rango y los códigos que no descuentan nada.
- **No cuadran**, ordenados por desviación, con la cuenta entera a la vista
  (`inicial + recibido − vendido`), lo contado, y una barra con el cero en el
  centro: a la izquierda lo que falta, a la derecha lo que sobra, cortada al 100%
  para que un −400% no aplaste al resto.
- **Sin datos para cuadrar**: lo que se vende pero no tiene de dónde restarse.
  Sale dicho, no escondido.

Los colores solo acompañan: cada estado lleva además su símbolo y su palabra
(«▼ Faltan», «▲ Sobran», «✓ Cuadran»), así que nada se lee por el color a secas.

## Lo que falta

1. **Receta del tender** — 300 g de ajo, 150 g de mostaza, 100 g de marinado,
   pero no se sabe **para cuántos tenders**. Alberto quedó en verlo cuando los
   hagan.
2. **Cuántos huevos lleva un pote de chino.** La app tiene 2 por pote y con eso
   la semana cierra en **-1.495 huevos**. Alberto dijo que se usa *medio
   cucharón* por pote y que se rompen 3-4 cartones que «duran», pero no cuántos
   potes salen de esos cartones. Hasta que lo diga, ese renglón no cuadra.
3. **Cuántas piezas de pollo hacen 1 kg de picadillo.** Ya está el renglón y ya
   se descuenta por kilo, pero mientras no se sepa la conversión, el picadillo
   se lleva su propia cuenta en vez de salir del pollo de las cestas.
4. **Recetas del repollo, la zanahoria y lo de Tierra Santa** fuera de la
   ensalada — sin ellas esos artículos muestran consumo, no merma.
5. **Códigos del POS todavía sin equivalencia** (2 de 57):
   - `1551 1 VASO DE REFRESCO` — el personal cobra ahí tanto vasos como platos
     de plástico vendidos aparte, así que el código mezcla dos cosas. Lo suyo
     sería separarlo en el punto de venta.
   - `1575 6 PIMPINA (20LTS)` — no está en la hoja del local.
6. **Tamaños de bulto que faltan en la hoja de agosto.** 39 renglones traen un
   número en la columna de bultos sin que se sepa qué trae un bulto. Casi todos
   solo se cuentan, pero el **agua Minalba de 1,5L** ya tiene receta (código
   1620), así que su inicial sale vacío y avisado hasta que se diga si esos «3
   bultos» son bultos o unidades. Lo del **Tenta té** era eso mismo: los 43 y 37
   eran unidades y estaban escritos en la columna de bultos (corregido el 8/9).
7. Cuatro renglones del inventario físico que no se pudieron cargar: refresco
   de 1,5L y pechuga (no aparecen en la hoja), arroz (70 bultos, sin saber los
   kg por bulto). Lo de *«HUEVOS 7»* quedó aclarado el 2/9: son **7 huevos
   sueltos**, no cartones.
8. **Repasar la transcripción** de la hoja de agosto: son 173 renglones leídos a
   mano de un escaneo.
9. Camarones: decidido que entran con 120 g por pote de P&C, pero **no se
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
