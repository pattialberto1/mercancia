# Mercancía SaaS (en construcción)

Esta es la evolución multi-cliente de **Mercancía**: en lugar de una app para un
solo negocio, cada negocio ("tenant") se registra, configura sus propios
productos y usa la app con su propio equipo (dueño + operadores), con 14 días
de prueba gratis.

> **La versión original de un solo negocio sigue viva** en la rama
> [`claude/chicken-receiving-app-8z1rs2`](../../tree/claude/chicken-receiving-app-8z1rs2)
> y en producción en https://pattialberto1.github.io/mercancia/ — esta rama no
> la toca ni la reemplaza.

## Estado actual

- ✅ **Esquema de datos y configuración de Supabase** — completo, probado y documentado
  en [`supabase/schema.sql`](./supabase/schema.sql) y [`supabase/SETUP.md`](./supabase/SETUP.md).
- ⏳ **Pantallas de la app conectadas a Supabase** (login, productos configurables,
  reportes, alertas de discrepancia) — siguiente fase, aún no empieza.
- ⏳ **PWA/offline con Supabase** (hoy solo existe en la versión clásica con GitHub
  como almacén) — se rediseña en la siguiente fase.

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

1. Sigue [`supabase/SETUP.md`](./supabase/SETUP.md) para crear el proyecto de
   Supabase y correr el esquema.
2. Pásame la **Project URL** y la **anon key** de ese proyecto.
3. Con eso seguimos con las pantallas: registro/login, Ajustes de productos, y
   las recepciones ya conectadas en tiempo real.
