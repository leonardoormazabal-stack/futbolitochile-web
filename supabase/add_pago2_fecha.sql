-- ============================================================================
-- PARCHE: registra en qué fecha se pagó el "Pago 2 (Saldo)" de una reserva,
-- ya que puede ocurrir en un día distinto al del abono (Pago 1, que usa la
-- fecha de creación de la reserva como su propia fecha de pago).
-- Pégalo en el SQL Editor de Supabase y ejecútalo (Run).
-- ============================================================================

alter table public.reservas
    add column if not exists pago2_fecha date;
