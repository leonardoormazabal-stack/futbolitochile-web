-- ============================================================================
-- PARCHE: agrega "Bloqueos" — permite al superadministrador cerrar una
-- cancha específica o todas, en un horario puntual o el día completo, para
-- que esas horas dejen de estar disponibles para reservar desde el sitio
-- (se ven "ocupadas", igual que si tuvieran una reserva real).
--
-- cancha_id = NULL  -> aplica a todas las canchas
-- hora = NULL       -> aplica a todo el día
-- Pégalo en el SQL Editor de Supabase y ejecútalo (Run).
-- ============================================================================

create table if not exists public.bloqueos (
    id uuid primary key default gen_random_uuid(),
    fecha date not null,
    hora smallint check (hora between 0 and 23),
    cancha_id text references public.canchas (id) on delete cascade,
    motivo text,
    creado_por uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now()
);

alter table public.bloqueos enable row level security;

drop policy if exists "cualquiera_ve_bloqueos" on public.bloqueos;
create policy "cualquiera_ve_bloqueos"
    on public.bloqueos for select
    using (true);

drop policy if exists "superadmin_crea_bloqueos" on public.bloqueos;
create policy "superadmin_crea_bloqueos"
    on public.bloqueos for insert
    with check (public.is_superadmin());

drop policy if exists "superadmin_elimina_bloqueos" on public.bloqueos;
create policy "superadmin_elimina_bloqueos"
    on public.bloqueos for delete
    using (public.is_superadmin());

-- Un horario bloqueado también cuenta como ocupado para el sitio de
-- reservas: se agrega al mismo cálculo de disponibilidad que ya usan las
-- reservas confirmadas/pendientes, expandiendo cada bloqueo a todas las
-- canchas y/o todas las horas que le correspondan.
create or replace view public.disponibilidad as
    select cancha_id, fecha, hora
    from public.reservas
    where estado = 'confirmada'
       or (estado = 'pendiente' and pendiente_expira_en > now())
    union
    select c.id as cancha_id, b.fecha, h.hora::smallint as hora
    from public.bloqueos b
    cross join public.canchas c
    cross join generate_series(0, 23) as h(hora)
    where (b.cancha_id is null or b.cancha_id = c.id)
      and (b.hora is null or b.hora = h.hora);
