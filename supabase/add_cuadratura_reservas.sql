-- ============================================================================
-- PARCHE: agrega los campos que usa la pestaña "Cuadratura Diaria" del panel
-- admin: un segundo medio/monto de pago (para cuando el abono y el saldo se
-- pagaron con medios distintos) y una observación libre por reserva.
-- Pégalo en el SQL Editor de Supabase y ejecútalo (Run).
-- ============================================================================

alter table public.reservas
    add column if not exists metodo_pago_2 text,
    add column if not exists monto_pagado_2 integer not null default 0,
    add column if not exists observacion text;
