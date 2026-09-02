-- ============================================================================
-- PARCHE: agrega un tercer medio/monto de pago a "reservas" (para cuando el
-- pago de una reserva se dividió en tres partes) y la fecha en que se
-- registró ese Pago 3, igual que se hizo para el Pago 2 en add_pago2_fecha.sql.
-- Pégalo en el SQL Editor de Supabase y ejecútalo (Run).
-- ============================================================================

alter table public.reservas
    add column if not exists metodo_pago_3 text,
    add column if not exists monto_pagado_3 integer not null default 0,
    add column if not exists pago3_fecha date;
