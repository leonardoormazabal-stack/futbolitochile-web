/* ============================================================================
   Bug encontrado: cuando Banchile confirma un pago pero su respuesta no trae
   el monto exacto cobrado (payment[0].amount.total ausente), el código caía
   a un "fallback" que daba por pagado el PRECIO COMPLETO de la reserva
   (reserva.precio), sin importar si el cliente había elegido pagar solo el
   abono. Pasó en una reserva real: Banchile cobró $10.000 de abono, pero la
   reserva quedó marcada con monto_pagado = $37.000 (precio completo),
   dejando un saldo de $27.000 sin cobrar que el sistema daba por "Al día".

   Fix: en vez de asumir el precio completo, el fallback ahora usa el monto
   que efectivamente le pedimos a Banchile que cobrara al crear la sesión de
   pago (el abono o el precio completo, según lo que eligió el cliente), que
   es un dato mucho más confiable que adivinar "pagó todo". Esta columna
   guarda ese monto solicitado en el momento de crear la transacción.
   ============================================================================ */

alter table public.reservas
    add column if not exists monto_solicitado_online integer;
