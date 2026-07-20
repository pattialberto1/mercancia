# Configurar Supabase para Mercancía SaaS

Esto se hace **una sola vez**, desde el navegador, con la cuenta de Supabase de Alberto.
Es la única parte de este producto que necesita un "backend" — Supabase lo administra
por nosotros (base de datos, login y sincronización en tiempo real), sin servidores
que mantener.

## 1. Crear el proyecto

1. Entra a **https://supabase.com** → *Start your project* → inicia sesión con GitHub.
2. *New project* → nómbralo `mercancia-saas` → elige una contraseña de base de datos
   (guárdala, es la del propio Postgres, no la de ningún cliente) → región más cercana
   → plan **Free**.
3. Espera 1-2 minutos a que aprovisione el proyecto.

## 2. Ejecutar el esquema

1. En el menú lateral: **SQL Editor** → *New query*.
2. Pega **todo** el contenido de [`schema.sql`](./schema.sql) y dale **Run**.
3. Debe terminar sin errores (verás una lista larga de `CREATE TABLE`, `CREATE POLICY`, etc.).
   Este script ya fue probado contra un Postgres real simulando dos negocios distintos,
   un dueño y un operador, antes de subirlo — ver la sección "Qué quedó verificado" abajo.

Si alguna vez necesitas modificar el esquema, no vuelvas a correr todo el archivo desde
cero sobre una base con datos: escribe un script nuevo solo con el cambio (una migración),
para no perder información.

## 3. Configurar el login (Authentication)

1. **Authentication → Providers**: el proveedor **Email** ya viene activado, no lo toques.
2. **Authentication → URL Configuration**: en *Site URL* pon la dirección donde vaya a
   vivir la app (por ejemplo `https://pattialberto1.github.io/mercancia-saas/` cuando
   exista) — esto es lo que usan los enlaces de recuperación de contraseña.
3. Opcional pero recomendado para no complicar el alta de nuevos negocios: en
   **Authentication → Providers → Email**, puedes desactivar "Confirm email" durante
   la etapa de pruebas, para que una cuenta nueva quede activa al instante sin tener
   que revisar el correo. Se puede volver a activar más adelante sin romper nada.

## 4. Copiar las llaves para la app

En **Project Settings → API** vas a necesitar dos datos para la siguiente fase
(cuando conectemos la app):

- **Project URL** (algo como `https://xxxxx.supabase.co`)
- **anon public key** (una clave larga) — esta sí es segura para poner en el
  frontend, es la que usan todos los usuarios; el RLS es lo que realmente protege
  los datos, no el secreto de esta clave.

**Nunca** copies ni uses la **service_role key** en la app — esa llave se salta
todas las reglas de seguridad (RLS). Solo se usa manualmente desde el propio
panel de Supabase, nunca en código que corre en un teléfono.

Cuando tengas esos dos datos, dímelos (o pégalos aquí) y seguimos con la pantalla
de inicio de sesión de la app.

## Cómo se van a dar de alta los negocios (una vez conectada la app)

- **Un negocio nuevo (dueño):** se registra con correo + contraseña y el nombre de
  su negocio. Automáticamente se le crean 14 días de prueba y un código de invitación
  propio.
- **Un repartidor o encargado de sitio (operador):** el dueño le pasa el código de
  invitación de su negocio (desde Ajustes) y esa persona se registra con ese código
  en vez de crear un negocio nuevo — queda ligado al mismo negocio, con permisos
  más limitados (puede registrar recepciones, pero no tocar el catálogo de productos).
- **Activar el pago pasado el trial:** esto lo haces tú manualmente, sin pantallas
  especiales — en Supabase → **Table Editor → tenants** → busca el negocio → columna
  `is_paid` → marca `true`. Ningún usuario de la app puede tocar esa columna aunque
  quisiera (está verificado, ver más abajo).

## Qué quedó verificado antes de subir este esquema

Antes de entregarlo se probó contra un Postgres real (no solo revisado a ojo),
simulando dos negocios y tres usuarios (un dueño, un operador, y el dueño de un
negocio distinto):

- ✅ Un operador puede crear recepciones y pesadas, pero **no** puede crear ni
  editar productos (eso es solo del dueño).
- ✅ Un negocio **no puede ver ni una fila** de los datos de otro negocio
  (productos, recepciones, ni el resumen de reportes).
- ✅ Pasado el trial, la base de datos **rechaza** nuevas recepciones — no es
  solo un aviso visual, el bloqueo es real aunque alguien intente saltárselo.
- ✅ Al marcar el negocio como pagado, vuelve a funcionar de inmediato.
- ✅ Ni el propio dueño de un negocio puede marcarse a sí mismo como pagado ni
  extenderse el trial — esa columna solo la toca alguien con acceso directo al
  panel de Supabase (por ahora, tú).

De paso se encontró y corrigió durante esta prueba un bug real de las políticas
de seguridad (una función se llamaba a sí misma sin parar al consultar la tabla
de membresías) — quedó arreglado en la versión que estás por ejecutar.
