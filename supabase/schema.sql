-- ============================================================
-- Mercancía SaaS · esquema inicial de Supabase (multi-tenant)
-- Ejecutar completo en: Supabase → SQL Editor → New query → Run
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- tipos ----------
create type user_role as enum ('dueno', 'operador');
create type weigh_type as enum ('cestas_tara', 'cesta_suelta', 'libre');
create type discrepancy_type as enum ('faltante', 'sobrante', 'mal_estado');

-- ============================================================
-- TABLAS
-- ============================================================

-- tenants: cada negocio cliente de la suscripción (ej. "Broaster Express")
create table tenants (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique default substr(md5(random()::text), 1, 8),
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  is_paid boolean not null default false,
  created_at timestamptz not null default now()
);

-- datos editables por el dueño, separados de lo sensible a facturación/trial
create table tenant_profile (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  nombre_negocio text not null,
  updated_at timestamptz not null default now()
);

-- membresías: qué usuario pertenece a qué negocio y con qué rol
create table memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role user_role not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index memberships_user_idx on memberships (user_id);
create index memberships_tenant_idx on memberships (tenant_id);

-- productos configurables (reemplaza las pestañas fijas de Pollo/Papas/Verduras)
create table products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  nombre text not null,
  emoji text not null default '📦',
  weigh_type weigh_type not null default 'libre',
  tara_kg numeric(6,2),                                -- aplica a cestas_tara y cesta_suelta
  cestas_max int not null default 1,                   -- máximo de cestas por pesada
  min_peso numeric(8,2),                                -- rango esperado; null = sin validación
  max_peso numeric(8,2),
  decimales smallint not null default 0 check (decimales in (0, 2)),
  pesos_rapidos numeric(8,2)[] not null default '{}',   -- botones rápidos
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now()
);
create index products_tenant_idx on products (tenant_id);

-- clientes: directorio simple por negocio, para los despachos. No hace
-- falta crearlos a mano — se guardan solos la primera vez que se escribe
-- un nombre nuevo al despachar, y salen en una lista desplegable después.
create table clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  nombre text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, nombre)
);
create index clients_tenant_idx on clients (tenant_id);

-- recepciones: una visita/entrega de un producto en una fecha. También
-- representa los despachos (mercancía que sale hacia un cliente propio):
-- comparten toda la misma mecánica de pesadas, así que en vez de duplicar
-- tablas se distinguen con "tipo" y, si es despacho, el cliente.
create table receptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,  -- lo completa un trigger, ver abajo
  product_id uuid not null references products(id),
  tipo text not null default 'recepcion' check (tipo in ('recepcion', 'despacho')),
  client_id uuid references clients(id),                    -- obligatorio solo si tipo='despacho'
  fecha date not null default current_date,
  status text not null default 'abierta' check (status in ('abierta', 'cerrada')),
  cestas_vacias int not null default 0,
  precio_kg numeric(10,2),                                  -- opcional, solo aplica a despachos
  tasa_bcv numeric(12,4),                                   -- tasa vigente cuando se cargó el precio
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint receptions_tipo_cliente_chk
    check ((tipo = 'recepcion' and client_id is null) or (tipo = 'despacho' and client_id is not null))
);
create index receptions_tenant_fecha_idx on receptions (tenant_id, fecha);
create index receptions_product_idx on receptions (product_id);

-- pesadas individuales dentro de una recepción
create table weighings (
  id uuid primary key default gen_random_uuid(),
  reception_id uuid not null references receptions(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,  -- lo completa un trigger
  peso numeric(8,2) not null,
  cestas int not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index weighings_reception_idx on weighings (reception_id);
create index weighings_tenant_idx on weighings (tenant_id);

-- discrepancias: faltante / sobrante / mal estado, para alertar al dueño
create table discrepancies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,  -- lo completa un trigger
  reception_id uuid not null references receptions(id) on delete cascade,
  tipo discrepancy_type not null,
  kg numeric(8,2),
  nota text,
  resuelto boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index discrepancies_tenant_idx on discrepancies (tenant_id, resuelto);

-- ============================================================
-- TRIGGERS: completar tenant_id automáticamente (nunca lo manda el cliente)
-- ============================================================

create or replace function set_tenant_from_product()
returns trigger language plpgsql as $$
begin
  select tenant_id into new.tenant_id from products where id = new.product_id;
  return new;
end;
$$;
create trigger receptions_set_tenant
  before insert on receptions
  for each row execute function set_tenant_from_product();

create or replace function set_tenant_from_reception()
returns trigger language plpgsql as $$
begin
  select tenant_id into new.tenant_id from receptions where id = new.reception_id;
  return new;
end;
$$;
create trigger weighings_set_tenant
  before insert on weighings
  for each row execute function set_tenant_from_reception();
create trigger discrepancies_set_tenant
  before insert on discrepancies
  for each row execute function set_tenant_from_reception();

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger tenant_profile_updated_at
  before update on tenant_profile
  for each row execute function set_updated_at();

-- ============================================================
-- ALTA DE USUARIOS: crear negocio (dueño) o unirse con código (operador)
-- ============================================================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_invite text;
  v_negocio text;
begin
  v_invite := new.raw_user_meta_data ->> 'invite_code';
  v_negocio := new.raw_user_meta_data ->> 'nombre_negocio';

  if v_invite is not null then
    select id into v_tenant_id from tenants where invite_code = v_invite;
    if v_tenant_id is null then
      raise exception 'Código de invitación inválido';
    end if;
    insert into memberships (tenant_id, user_id, role) values (v_tenant_id, new.id, 'operador');

  elsif v_negocio is not null then
    insert into tenants default values returning id into v_tenant_id;
    insert into tenant_profile (tenant_id, nombre_negocio) values (v_tenant_id, v_negocio);
    insert into memberships (tenant_id, user_id, role) values (v_tenant_id, new.id, 'dueno');

  else
    raise exception 'Falta nombre_negocio o invite_code al registrarse';
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- FUNCIONES DE APOYO PARA RLS
-- ============================================================

-- security definer + search_path fijo: es el patrón que recomienda Supabase
-- para estas funciones de apoyo. Sin "security definer" aquí, la política de
-- "memberships" (que también llama a my_tenant_ids()) se llamaría a sí misma
-- sin parar — con "security definer" la función corre con los permisos de su
-- dueño (postgres), que es dueño de la tabla y por eso no le aplica RLS.
create or replace function my_tenant_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select tenant_id from memberships where user_id = auth.uid()
$$;

create or replace function is_dueno(t uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from memberships
    where tenant_id = t and user_id = auth.uid() and role = 'dueno'
  )
$$;

create or replace function tenant_activo(t uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select (trial_ends_at > now() or is_paid)
  from tenants where id = t
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table tenants enable row level security;
alter table tenant_profile enable row level security;
alter table memberships enable row level security;
alter table products enable row level security;
alter table clients enable row level security;
alter table receptions enable row level security;
alter table weighings enable row level security;
alter table discrepancies enable row level security;

-- tenants: cada quien ve solo su(s) negocio(s); nadie los edita desde la app
-- (trial_ends_at / is_paid solo se tocan desde el Table Editor de Supabase)
create policy "ver mi negocio" on tenants for select
  using (id in (select my_tenant_ids()));

-- tenant_profile: los miembros leen; solo el dueño edita el nombre del negocio
create policy "ver perfil de mi negocio" on tenant_profile for select
  using (tenant_id in (select my_tenant_ids()));
create policy "dueno crea perfil" on tenant_profile for insert
  with check (is_dueno(tenant_id));
create policy "dueno edita perfil" on tenant_profile for update
  using (is_dueno(tenant_id));

-- memberships: el equipo del negocio se ve entre sí; el dueño puede quitar operadores
create policy "ver equipo de mi negocio" on memberships for select
  using (tenant_id in (select my_tenant_ids()));
create policy "dueno quita operadores" on memberships for delete
  using (is_dueno(tenant_id) and role = 'operador');

-- products: los miembros leen; solo el dueño administra el catálogo
create policy "ver productos de mi negocio" on products for select
  using (tenant_id in (select my_tenant_ids()));
create policy "dueno crea productos" on products for insert
  with check (is_dueno(tenant_id));
create policy "dueno edita productos" on products for update
  using (is_dueno(tenant_id));
create policy "dueno elimina productos" on products for delete
  using (is_dueno(tenant_id));

-- clients: los miembros leen; cualquiera del equipo agrega uno nuevo al
-- despachar (no solo el dueño); solo el dueño edita/elimina (para
-- corregir nombres repetidos o mal escritos)
create policy "ver clientes de mi negocio" on clients for select
  using (tenant_id in (select my_tenant_ids()));
create policy "el equipo agrega clientes" on clients for insert
  with check (tenant_id in (select my_tenant_ids()));
create policy "dueno edita clientes" on clients for update
  using (is_dueno(tenant_id));
create policy "dueno elimina clientes" on clients for delete
  using (is_dueno(tenant_id));

-- receptions: los miembros leen y crean (si el trial está activo);
-- cada quien edita/borra lo suyo, el dueño puede editar/borrar cualquiera
create policy "ver recepciones de mi negocio" on receptions for select
  using (tenant_id in (select my_tenant_ids()));
create policy "crear recepciones si activo" on receptions for insert
  with check (
    product_id in (select id from products where tenant_id in (select my_tenant_ids()))
    and tenant_activo((select tenant_id from products where id = product_id))
    and created_by = auth.uid()
    and (client_id is null or client_id in (select id from clients where tenant_id in (select my_tenant_ids())))
  );
create policy "editar mis recepciones o si soy dueno" on receptions for update
  using (tenant_id in (select my_tenant_ids()) and (created_by = auth.uid() or is_dueno(tenant_id)));
create policy "borrar mis recepciones o si soy dueno" on receptions for delete
  using (tenant_id in (select my_tenant_ids()) and (created_by = auth.uid() or is_dueno(tenant_id)));

-- weighings: mismo patrón, gateado también por trial activo
create policy "ver pesadas de mi negocio" on weighings for select
  using (tenant_id in (select my_tenant_ids()));
create policy "crear pesadas si activo" on weighings for insert
  with check (
    reception_id in (select id from receptions where tenant_id in (select my_tenant_ids()))
    and tenant_activo((select tenant_id from receptions where id = reception_id))
    and created_by = auth.uid()
  );
create policy "editar mis pesadas o si soy dueno" on weighings for update
  using (tenant_id in (select my_tenant_ids()) and (created_by = auth.uid() or is_dueno(tenant_id)));
create policy "borrar mis pesadas o si soy dueno" on weighings for delete
  using (tenant_id in (select my_tenant_ids()) and (created_by = auth.uid() or is_dueno(tenant_id)));

-- discrepancies: los miembros leen y crean; el dueño (o quien la creó) la resuelve/borra
create policy "ver discrepancias de mi negocio" on discrepancies for select
  using (tenant_id in (select my_tenant_ids()));
create policy "crear discrepancias" on discrepancies for insert
  with check (
    reception_id in (select id from receptions where tenant_id in (select my_tenant_ids()))
    and created_by = auth.uid()
  );
create policy "resolver discrepancias" on discrepancies for update
  using (tenant_id in (select my_tenant_ids()) and (created_by = auth.uid() or is_dueno(tenant_id)));
create policy "borrar discrepancias" on discrepancies for delete
  using (is_dueno(tenant_id));

-- ============================================================
-- VISTA DE APOYO PARA REPORTES (neto por recepción)
-- security_invoker: sin esto, la vista corre con permisos del dueño de la
-- vista y se saltaría el RLS de las tablas — con esto respeta el RLS del
-- usuario que consulta, igual que si hiciera el JOIN a mano.
-- ============================================================
create or replace view reception_summary
with (security_invoker = true) as
select
  r.id as reception_id,
  r.tenant_id,
  r.product_id,
  p.nombre as producto,
  p.emoji,
  r.tipo,
  r.client_id,
  c.nombre as cliente,
  r.fecha,
  r.status,
  r.cestas_vacias,
  r.precio_kg,
  r.tasa_bcv,
  coalesce(sum(w.cestas), 0) as cestas,
  coalesce(sum(w.peso), 0) as peso_bruto,
  coalesce(sum(w.cestas), 0) * coalesce(p.tara_kg, 0) as tara_total,
  coalesce(sum(w.peso), 0) - coalesce(sum(w.cestas), 0) * coalesce(p.tara_kg, 0) as peso_neto,
  case when r.precio_kg is not null
    then round((coalesce(sum(w.peso), 0) - coalesce(sum(w.cestas), 0) * coalesce(p.tara_kg, 0)) * r.precio_kg, 2)
    else null end as monto,
  case when r.precio_kg is not null and r.tasa_bcv is not null
    then round((coalesce(sum(w.peso), 0) - coalesce(sum(w.cestas), 0) * coalesce(p.tara_kg, 0)) * r.precio_kg * r.tasa_bcv, 2)
    else null end as monto_bs
from receptions r
join products p on p.id = r.product_id
left join clients c on c.id = r.client_id
left join weighings w on w.reception_id = r.id
group by r.id, p.id, c.id;

-- ============================================================
-- REALTIME: para que los teléfonos de un mismo negocio se vean en vivo
-- ============================================================
alter publication supabase_realtime add table receptions;
alter publication supabase_realtime add table weighings;
alter publication supabase_realtime add table discrepancies;
alter publication supabase_realtime add table products;
alter publication supabase_realtime add table clients;
