-- ============================================================================
-- FIX: una reserva cancelada dejaba su horario inutilizable para siempre.
--
-- El índice único original exigía que (cancha_id, fecha, hora) fuera único
-- entre TODAS las reservas, sin importar el estado. Al cancelar una reserva,
-- esa fila seguía "ocupando" el horario en el índice, así que nunca más se
-- podía volver a reservar esa cancha, fecha y hora exactas — ni desde la web
-- pública ni desde el panel de administrador.
--
-- La corrección: un índice único PARCIAL, que solo exige unicidad entre las
-- reservas con estado = 'confirmada'. Las canceladas dejan de contar, así
-- que el horario vuelve a estar disponible apenas se cancela la reserva
-- vigente.
--
-- Ya se aplicó directamente en producción (2026-08-25). Se deja este archivo
-- como registro histórico del cambio de esquema, por si hace falta
-- reaplicarlo en otro entorno (ej. un proyecto de desarrollo/staging).
-- ============================================================================

-- El unique original era una restricción de tabla (UNIQUE constraint), no un
-- simple índice: para reemplazarlo por uno parcial hay que borrar la
-- restricción (un índice parcial no puede respaldar un constraint).
alter table public.reservas drop constraint if exists reservas_cancha_id_fecha_hora_key;

create unique index if not exists reservas_cancha_id_fecha_hora_key
    on public.reservas (cancha_id, fecha, hora)
    where (estado = 'confirmada');
