-- ============================================================
-- Mercancía SaaS · migración 0003: precio por kg en despachos
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- (proyecto ya existente; no vuelvas a correr schema.sql entero)
-- ============================================================

-- precio por kg de un despacho (opcional); con esto y el peso neto ya
-- calculado se puede mostrar el total a cobrar sin guardar un monto por
-- separado (se calcula al vuelo, así nunca queda desactualizado si se
-- borra o corrige una pesada). No aplica a recepciones normales.
alter table receptions add column precio_kg numeric(10,2);

-- el update de receptions ya lo cubre la política existente
-- "editar mis recepciones o si soy dueno" (creado por mí o dueño), no
-- hace falta ninguna política nueva para poder guardar el precio.

-- vista de reportes: agrega precio_kg y el monto ya calculado (peso neto
-- × precio_kg), null si el despacho no tiene precio cargado.
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
  r.precio_kg,
  coalesce(sum(w.cestas), 0) as cestas,
  coalesce(sum(w.peso), 0) as peso_bruto,
  coalesce(sum(w.cestas), 0) * coalesce(p.tara_kg, 0) as tara_total,
  coalesce(sum(w.peso), 0) - coalesce(sum(w.cestas), 0) * coalesce(p.tara_kg, 0) as peso_neto,
  case when r.precio_kg is not null
    then round((coalesce(sum(w.peso), 0) - coalesce(sum(w.cestas), 0) * coalesce(p.tara_kg, 0)) * r.precio_kg, 2)
    else null end as monto
from receptions r
join products p on p.id = r.product_id
left join clients c on c.id = r.client_id
left join weighings w on w.reception_id = r.id
group by r.id, p.id, c.id;
