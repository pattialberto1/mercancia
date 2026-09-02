# Pruebas

Playwright contra el `index.html` real, sin build ni dependencias del proyecto.
Cada archivo levanta un servidor estático, abre la app en un Chromium de 390px
(un teléfono) y comprueba cosas concretas con datos reales del negocio.

```bash
NODE_PATH=/opt/node22/lib/node_modules node pruebas/inventario-test.js
```

Todas imprimen un resumen y salen con código ≠ 0 si algo falla o si hubo un
error de JavaScript en la página.

| Archivo | Qué cubre |
|---|---|
| `alitas-test.js` | Pestaña de alitas (peso por bolsa, sin cestas ni tara) |
| `modulo1-test.js` | Productos por unidad, varios proveedores, validación de neto |
| `parser-test.js` | Lectura del PDF de ventas del POS |
| `inventario-test.js` | Inventario semanal de punta a punta con el PDF real |
| `cestas-test.js` | La cesta que llega (18 pollos) vs la que se cuenta (20) |
| `conteo-bultos-test.js` | Conteo en bultos + sueltas y tamaños de bulto |
| `primer-tramo-test.js` | El control arranca el día del conteo, no el día que se abre la app |
| `huevos-chino-test.js` | Huevos, cebollín y la receta del pote de chino |
| `huevos-cajas-test.js` | Entrada de huevos por cajas de 6 cartones (144) |
| `recetas-test.js` | Tender, «LITRO Y MEDIO» y los dos códigos de agua de 600 |
| `pechuga-test.js` | Pollo rojo y pechuga son el mismo insumo (con su migración) |
| `fisico-test.js` | Inventario físico: la hoja completa de 242 productos |
| `todo-entra-test.js` | Recepciones y facturas alimentando el inventario solas |

`hoja-agosto.js` no es una prueba: es la transcripción del inventario físico de
agosto 2026, tal como se escaneó en papel. Sirve de dato de partida.

## Dos cosas que hay que saber

- **`inventario-test.js` y `parser-test.js` necesitan el PDF de ventas real**
  (`LSTPROVE.PDF`, exportado del POS). La ruta está escrita arriba del archivo y
  apunta a donde estaba subido; hay que cambiarla por la ruta local del PDF.
- **`fisico-test.js` y `todo-entra-test.js` leen `merc-nuevo.json`**, una copia
  de `datos.json` de la rama `datos`. Se saca con:
  `git show origin/datos:datos.json > merc-nuevo.json`
