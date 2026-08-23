-- ============================================================================
-- PARCHE: registra el motivo de cada cancelación de reserva, quién la
-- canceló y cuándo, para mostrarlo en la pestaña "Cancelaciones" del panel
-- (solo superadministrador).
-- Pégalo en el SQL Editor de Supabase y ejecútalo (Run).
-- ============================================================================

alter table public.reservas
    add column if not exists motivo_cancelacion text,
    add column if not exists cancelado_por uuid references auth.users(id) on delete set null,
    add column if not exists cancelado_en timestamptz;
