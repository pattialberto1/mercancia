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
| `reporte-sin-nombre-test.js` | Un renglón del reporte sin nombre no se tira |
| `inventario-test.js` | El inventario entero: lista, cuadre, grupos, cierre y WhatsApp |
| `version-test.js` | El aviso de versión nueva |

## Dos cosas que hay que saber

- **`inventario-test.js` y `parser-test.js` necesitan el PDF de ventas real**
  (`LSTPROVE.PDF`, exportado del POS). La ruta está escrita arriba del archivo y
  apunta a donde estaba subido; hay que cambiarla por la ruta local del PDF.
- **`fisico-test.js` y `todo-entra-test.js` leen `merc-nuevo.json`**, una copia
  de `datos.json` de la rama `datos`. Se saca con:
  `git show origin/datos:datos.json > merc-nuevo.json`
