-- ============================================================================
-- PARCHE: permite que una promoción de horario también admita abono (pagar
-- solo una parte online y el resto en el recinto), no solo pago completo.
-- Si "abono" queda en null, esa promo sigue siendo pago completo únicamente
-- (comportamiento anterior) — es decisión del superadministrador activarlo
-- poniéndole un monto desde el panel (Tarifas → Promoción de Horario).
-- Pégalo en el SQL Editor de Supabase y ejecútalo (Run).
-- ============================================================================

alter table public.promos_horario
    add column if not exists abono integer;

update public.promos_horario set abono = 10000 where abono is null;
