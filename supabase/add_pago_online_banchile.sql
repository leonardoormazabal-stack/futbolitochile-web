-- ============================================================================
-- PARCHE: agrega soporte para pagos online con tarjeta vía Banchile Pagos
-- (Web Checkout). Agrega el estado "pendiente" (una reserva que bloqueó el
-- horario mientras el cliente está pagando en Banchile, todavía sin
-- confirmar) y las columnas para rastrear esa transacción.
--
-- Busca dinámicamente el nombre real del check constraint de "estado" en
-- vez de asumirlo, para no romper si Supabase le puso un nombre distinto al
-- que genera Postgres por defecto.
-- Pégalo en el SQL Editor de Supabase y ejecútalo (Run).
-- ============================================================================

do $$
declare
    nombre_constraint text;
begin
    select con.conname into nombre_constraint
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'reservas'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%estado%';

    if nombre_constraint is not null then
        execute format('alter table public.reservas drop constraint %I', nombre_constraint);
    end if;
end $$;

alter table public.reservas
    add constraint reservas_estado_check check (estado in ('confirmada', 'pendiente', 'cancelada'));

alter table public.reservas
    add column if not exists pago_online_request_id text,
    add column if not exists pago_online_estado text,
    add column if not exists pendiente_expira_en timestamptz;

-- Un horario con un pago online en curso (pendiente, todavía no expirado)
-- también debe verse como ocupado, para que nadie más lo reserve mientras
-- el cliente está pagando en Banchile.
create or replace view public.disponibilidad as
    select cancha_id, fecha, hora
    from public.reservas
    where estado = 'confirmada'
       or (estado = 'pendiente' and pendiente_expira_en > now());
