-- ============================================================================
-- PARCHE: agrega el monto de abono editable por franja horaria en "tarifas".
-- Pégalo en el SQL Editor de Supabase y ejecútalo (Run).
-- ============================================================================

alter table public.tarifas add column if not exists abono integer;

-- Las tarifas que ya existían quedan con el abono fijo que se usaba antes ($10.000).
update public.tarifas
set abono = 10000
where abono is null;
