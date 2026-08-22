-- ============================================================================
-- PARCHE: distingue en el panel admin si una reserva la hizo el jugador
-- desde la web o un administrador desde "+ Nueva Reserva".
-- Pégalo en el SQL Editor de Supabase y ejecútalo (Run).
-- ============================================================================

alter table public.reservas
    add column if not exists origen text not null default 'web' check (origen in ('web', 'admin'));
