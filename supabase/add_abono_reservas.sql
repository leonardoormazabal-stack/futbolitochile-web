-- ============================================================================
-- PARCHE: soporta "abonar $10.000" vs "pagar total" en las reservas.
-- Pégalo en el SQL Editor de Supabase y ejecútalo (Run).
-- ============================================================================

alter table public.reservas add column if not exists monto_pagado integer;
alter table public.reservas add column if not exists tipo_pago text check (tipo_pago in ('completo', 'abono'));

-- Las reservas que ya existían se asumen pagadas por completo.
update public.reservas
set monto_pagado = precio, tipo_pago = 'completo'
where monto_pagado is null;
