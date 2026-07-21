# Mercancía SaaS (en construcción)

Esta es la evolución multi-cliente de **Mercancía**: en lugar de una app para un
solo negocio, cada negocio ("tenant") se registra, configura sus propios
productos y usa la app con su propio equipo (dueño + operadores), con 14 días
de prueba gratis.

> **La versión original de un solo negocio sigue viva** en el repositorio
> [`pattialberto1/mercancia`](https://github.com/pattialberto1/mercancia)
> y en producción en https://pattialberto1.github.io/mercancia/ — esto no
> la toca ni la reemplaza.
>
> Esta versión SaaS vive en su propio repositorio y su propia dirección:
> **https://pattialberto1.github.io/mercancia-saas/**

## Estado actual

- ✅ **Esquema de datos y configuración de Supabase** — completo, probado y documentado
  en [`supabase/schema.sql`](./supabase/schema.sql) y [`supabase/SETUP.md`](./supabase/SETUP.md).
  Proyecto real ya creado y conectado.
- ✅ **Login y registro** — crear negocio (dueño), unirse con código (operador),
  iniciar/cerrar sesión, sesión persistente entre recargas, banner de prueba de
  14 días, código de invitación visible para el dueño. Probado en vivo por el
  dueño contra el proyecto real.
- ✅ **Ajustes de productos** — crear, editar, activar/desactivar, reordenar y
  eliminar productos; 3 plantillas rápidas (Pollo, a granel, pesada libre) para
  recrear la versión clásica sin escribir todo a mano; borrar un producto con
  historial se bloquea con un aviso claro (sugiere desactivar en su lugar).
- ✅ **Recepciones y pesadas** — pantalla de recepciones por producto y de
  pesadas dentro de cada una, generada automáticamente a partir de cómo esté
  configurado el producto (cestas, tara, rango, decimales, botones rápidos).
  Sincronización en tiempo real entre teléfonos del mismo negocio (Supabase
  Realtime) para las recepciones y las pesadas. Bloqueo real de nuevas
  recepciones/pesadas si el trial venció. Envío del resumen por WhatsApp.
- ✅ **Clientes y despachos** — además de recibir mercancía de proveedores, el
  negocio puede despachar a sus propios clientes. Ver sección abajo.
- ⏳ **Reportes, exportación y alertas de discrepancia** — siguiente fase.

### Clientes y despachos

El inicio tiene un selector **📥 Recepciones / 📤 Despachos**. Un despacho
usa exactamente la misma mecánica de pesadas que una recepción (cestas,
tara, rango, botones rápidos, WhatsApp, tiempo real) — la diferencia es que
antes de pesar pregunta **"¿Para qué cliente?"**, con un cuadro de texto que
sugiere los clientes ya usados (se guardan solos la primera vez que se
escribe un nombre nuevo, no hace falta crearlos a mano) y una opción de
agregar uno nuevo si no está en la lista.

Cada despacho sigue siendo de **un solo producto** — si despachas Pollo y
Papas al mismo cliente el mismo día, son dos despachos separados, igual que
hoy una recepción es de un solo producto. El historial y el resumen de
WhatsApp de un despacho muestran el nombre del cliente.

En la base de datos, un despacho **es** una recepción con `tipo='despacho'`
y un `client_id` (en vez de una tabla aparte) — así toda la mecánica ya
construida y probada (RLS, trial, tiempo real) aplica sin duplicar nada.
Ver [`supabase/migrations/0002_despachos.sql`](./supabase/migrations/0002_despachos.sql).

Probado con Playwright (20 verificaciones): elegir un cliente nuevo desde
cero, que aparezca en la lista desplegable la próxima vez, que despachos y
recepciones normales no se mezclen en los historiales, que reutiliza el
despacho abierto de hoy para el mismo cliente en vez de duplicarlo, y que
crea uno nuevo si el anterior ya se cerró.

Probado con Playwright simulando PostgREST (33 verificaciones): crear
recepción, botones rápidos, selector de cestas, rango proporcional, aviso
de peso fuera de rango, totales, borrar pesada, terminar/reabrir, WhatsApp,
producto a granel con decimales, producto de pesada libre (sin tara ni
cestas), y el bloqueo real por trial vencido tanto al crear una recepción
como al intentar registrar una pesada. Lo único que **no** se pudo probar
desde aquí es la sincronización en tiempo real en sí (requiere una conexión
real a Supabase que esta caja de desarrollo no tiene) — el código sigue el
patrón documentado de Supabase Realtime y no genera errores al conectarse/
desconectarse, pero la prueba con dos teléfonos de verdad la tienen que
hacer ustedes.

### Navegación en 1 toque

Tocar un producto en el inicio salta directo a la recepción **abierta de
hoy** de ese producto (o la crea al instante si no hay ninguna) — así queda
en un solo toque, igual de rápido que la versión clásica de pestañas fijas,
sin importar cuántos productos tenga el negocio. El botón "←" de esa
pantalla lleva al historial completo (recepciones de otros días, o
cerradas), que sigue existiendo pero deja de ser el paso obligatorio de
en medio.

### Cómo funciona el rango de peso con menos cestas

Para productos de "varias cestas" (como el Pollo, 2 cestas · 65–75 kg), si
una pesada se hace con menos cestas de las normales, el rango esperado se
ajusta **proporcional** al número de cestas de esa pesada (ej. con 1 cesta,
65–75 kg pasa a 32,5–37,5 kg). Es un cambio de diseño respecto a la versión
clásica (que guardaba dos rangos totalmente independientes para 2 cestas y
para 1 cesta) — más simple de configurar (un solo rango por producto) y
matemáticamente consistente en vez de dos números escritos a mano que se
podían desincronizar.

### Qué quedó probado de la parte de login

Se probó con Playwright simulando las respuestas reales de Supabase (esta caja
de desarrollo no tiene salida a internet hacia el proyecto real, así que esta
es la verificación más profunda posible desde aquí — el primer inicio de
sesión real contra el proyecto en vivo todavía lo tienen que hacer ustedes):

- Login correcto e incorrecto, con sus mensajes de error.
- Crear negocio nuevo (dueño) y quedar con sesión iniciada al instante.
- Unirse con código de invitación válido → queda ligado al negocio correcto;
  con código inválido → mensaje de error claro.
- El operador no ve el código de invitación (solo el dueño).
- El banner cambia correctamente según los días de prueba restantes o vencidos.
- La sesión persiste al recargar la página, y el logout limpia todo.

De paso aparecieron y se corrigieron **dos bugs reales** antes de subir esto:
una recursión infinita en las políticas de seguridad de `memberships`, y un
error en la función que cambia de pantalla que dejaba la app trabada en
"Cargando…" para todo el mundo.

## Qué cambia respecto a la versión clásica

| Clásica (rama `claude/chicken-receiving-app-8z1rs2`) | SaaS (esta rama) |
|---|---|
| Un solo negocio | Muchos negocios (tenants), cada uno con sus datos separados |
| 3 pestañas fijas (Pollo, Papas, Verduras) | Productos configurables por cada negocio |
| PIN compartido (`7070`) | Login real con correo y contraseña, por persona |
| Sincronización vía token de GitHub | Supabase (Postgres + Auth + Realtime) |
| Sin roles | Dueño vs. operador, con permisos distintos |
| Sin límite de uso | Prueba de 14 días, luego requiere activación manual |
| — | Reportes filtrables y alertas de discrepancia (faltante/sobrante/mal estado) |

## Cómo seguir

Falta: pantalla de recepciones/pesadas (usando la configuración de cada
producto para decidir cestas, tara, rango y decimales), tiempo real entre
teléfonos del mismo negocio, reportes con exportación, y alertas de
discrepancia destacadas para el dueño.

## Estructura

- `index.html` — login, registro, marco autenticado y Ajustes de productos.
- `vendor/supabase.js` — cliente de Supabase empaquetado en el propio repo
  (no depende de un CDN externo en cada carga; para actualizarlo:
  `npm install @supabase/supabase-js@latest` en cualquier carpeta y copiar
  `node_modules/@supabase/supabase-js/dist/umd/supabase.js` aquí encima).
- `supabase/schema.sql`, `supabase/SETUP.md` — el esquema y su guía de alta.
