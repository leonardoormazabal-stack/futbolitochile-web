-- ============================================================================
-- PARCHE: bloquea a nivel de base de datos anular (pasar a estado
-- 'cancelada') una reserva cuya fecha ya pasó. Antes esto solo se validaba
-- en el link público de cancelación (api/cancelar-reserva.js); el panel
-- admin no tenía ningún control y permitió anular por error una reserva de
-- un día anterior que sí se había jugado. Con este trigger, ese error queda
-- bloqueado sin importar desde dónde se intente (panel admin, el link
-- público, o cualquier otro acceso futuro a la base de datos).
-- Pégalo en el SQL Editor de Supabase y ejecútalo (Run).
-- ============================================================================

create or replace function public.bloquear_cancelacion_reserva_pasada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.estado = 'cancelada' and old.estado <> 'cancelada'
        and new.fecha < (now() at time zone 'America/Santiago')::date then
        raise exception 'No se puede anular una reserva de un día que ya pasó (%).', new.fecha;
    end if;
    return new;
end;
$$;

drop trigger if exists trigger_bloquear_cancelacion_pasada on public.reservas;

create trigger trigger_bloquear_cancelacion_pasada
    before update on public.reservas
    for each row
    execute function public.bloquear_cancelacion_reserva_pasada();
