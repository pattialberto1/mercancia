-- ============================================================
-- Mercancía SaaS · migración 0004: tasa BCV y total en bolívares
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- (proyecto ya existente; no vuelvas a correr schema.sql entero)
-- ============================================================

-- se guarda la tasa que estaba vigente cuando se cargó el precio del
-- despacho (no se recalcula sola después) para que el histórico de
-- reportes en bolívares no cambie con el tiempo si la tasa sube o baja.
alter table receptions add column tasa_bcv numeric(12,4);

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
