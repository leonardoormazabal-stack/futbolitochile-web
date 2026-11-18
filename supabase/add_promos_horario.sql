-- ============================================================================
-- PARCHE: precio promocional por día de la semana + horario (ej. "Sábados y
-- Domingos de 19:00 a 22:00, $30.000"). La tabla "tarifas" no tiene ningún
-- concepto de día de la semana (solo deporte + rango de horas), así que en
-- vez de forzarlo ahí se agrega esta tabla aparte: igual patrón que
-- "metodos_pago", con un interruptor "activo" que el superadministrador
-- prende/apaga a mano desde el panel (Tarifas → Promoción de Horario) cuando
-- empiece/termine la temporada.
--
-- dias_semana usa el mismo valor que JS Date.getDay(): 0 = domingo ... 6 =
-- sábado. El precio promocional es pago completo únicamente (no admite
-- abonar solo una parte): api/banchile.js y api/reserva-transferencia.js
-- fuerzan tipo_pago = 'completo' cuando la promo aplica.
--
-- Pégalo en el SQL Editor de Supabase y ejecútalo (Run).
-- ============================================================================

create table if not exists public.promos_horario (
    id uuid primary key default gen_random_uuid(),
    deporte text not null check (deporte in ('futbolito', 'padel')),
    dias_semana smallint[] not null,
    hora_desde smallint not null,
    hora_hasta smallint not null,
    precio integer not null,
    activo boolean not null default false,
    updated_at timestamptz not null default now()
);

insert into public.promos_horario (deporte, dias_semana, hora_desde, hora_hasta, precio, activo)
values ('futbolito', array[0, 6], 19, 22, 30000, false);

alter table public.promos_horario enable row level security;

drop policy if exists "cualquiera_ve_promos_horario" on public.promos_horario;
create policy "cualquiera_ve_promos_horario"
    on public.promos_horario for select
    using (true);

drop policy if exists "superadmin_actualiza_promos_horario" on public.promos_horario;
create policy "superadmin_actualiza_promos_horario"
    on public.promos_horario for update
    using (public.is_superadmin())
    with check (public.is_superadmin());
