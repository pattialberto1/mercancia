-- ============================================================
-- Mercancía SaaS · migración 0002: clientes y despachos
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- (proyecto ya existente; no vuelvas a correr schema.sql entero)
-- ============================================================

-- clientes: directorio simple por negocio. No hace falta crearlos a
-- mano — se guardan solos la primera vez que se escribe un nombre nuevo
-- al hacer un despacho, y salen en la lista desplegable la próxima vez.
create table clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  nombre text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, nombre)
);
create index clients_tenant_idx on clients (tenant_id);

alter table clients enable row level security;

create policy "ver clientes de mi negocio" on clients for select
  using (tenant_id in (select my_tenant_ids()));
-- cualquiera del equipo puede anotar un cliente nuevo al despachar,
-- no solo el dueño (igual que cualquiera puede registrar una pesada)
create policy "el equipo agrega clientes" on clients for insert
  with check (tenant_id in (select my_tenant_ids()));
create policy "dueno edita clientes" on clients for update
  using (is_dueno(tenant_id));
create policy "dueno elimina clientes" on clients for delete
  using (is_dueno(tenant_id));

-- receptions pasa a representar dos cosas: recepciones (de un proveedor,
-- como hasta ahora) y despachos (a un cliente propio) — comparten toda
-- la misma mecánica de pesadas, tara, rango, WhatsApp y tiempo real, así
-- que en vez de duplicar tablas se reutiliza esta con un "tipo".
alter table receptions add column tipo text not null default 'recepcion' check (tipo in ('recepcion', 'despacho'));
alter table receptions add column client_id uuid references clients(id);
alter table receptions add constraint receptions_tipo_cliente_chk
  check ((tipo = 'recepcion' and client_id is null) or (tipo = 'despacho' and client_id is not null));

-- el insert de recepciones ahora también valida que, si viene un
-- client_id, pertenezca al mismo negocio (defensa extra, igual que ya
-- se valida el product_id)
drop policy "crear recepciones si activo" on receptions;
create policy "crear recepciones si activo" on receptions for insert
  with check (
    product_id in (select id from products where tenant_id in (select my_tenant_ids()))
    and tenant_activo((select tenant_id from products where id = product_id))
    and created_by = auth.uid()
    and (client_id is null or client_id in (select id from clients where tenant_id in (select my_tenant_ids())))
  );

-- vista de reportes: ahora también expone tipo y cliente.
-- "create or replace" no deja insertar columnas nuevas en medio de una
-- vista existente (solo al final, en el mismo orden) — más simple
-- soltarla y crearla de nuevo, no tiene datos propios ni depende nada
-- de ella.
drop view if exists reception_summary;
create view reception_summary
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
  coalesce(sum(w.cestas), 0) as cestas,
  coalesce(sum(w.peso), 0) as peso_bruto,
  coalesce(sum(w.cestas), 0) * coalesce(p.tara_kg, 0) as tara_total,
  coalesce(sum(w.peso), 0) - coalesce(sum(w.cestas), 0) * coalesce(p.tara_kg, 0) as peso_neto
from receptions r
join products p on p.id = r.product_id
left join clients c on c.id = r.client_id
left join weighings w on w.reception_id = r.id
group by r.id, p.id, c.id;

alter publication supabase_realtime add table clients;
