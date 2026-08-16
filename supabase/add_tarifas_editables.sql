-- ============================================================================
-- PARCHE: permite editar Tarifas y Horarios desde el panel (solo
-- superadministrador): arriendo por hora, plan mensual y equipamiento.
-- Pégalo en el SQL Editor de Supabase y ejecútalo (Run).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. La tabla "tarifas" ya existe (se usa para calcular el precio de las
--    reservas), pero nunca tuvo política de UPDATE. La agregamos.
-- ----------------------------------------------------------------------------
drop policy if exists "superadmin_actualiza_tarifas" on public.tarifas;
create policy "superadmin_actualiza_tarifas"
    on public.tarifas for update
    using (public.is_superadmin())
    with check (public.is_superadmin());

-- ----------------------------------------------------------------------------
-- 2. PLAN MENSUAL (hoy es texto fijo en el HTML)
-- ----------------------------------------------------------------------------
create table if not exists public.planes_mensuales (
    id text primary key,
    orden smallint not null,
    nombre text not null,
    horas_incluidas text not null,
    precio integer not null,
    updated_at timestamptz not null default now()
);

insert into public.planes_mensuales (id, orden, nombre, horas_incluidas, precio) values
    ('plan-4-horas', 1, 'Plan 4 Horas al Mes', '4 horas (franja horaria asegurada)', 60000)
on conflict (id) do nothing;

alter table public.planes_mensuales enable row level security;

drop policy if exists "cualquiera_ve_planes" on public.planes_mensuales;
create policy "cualquiera_ve_planes"
    on public.planes_mensuales for select
    using (true);

drop policy if exists "superadmin_actualiza_planes" on public.planes_mensuales;
create policy "superadmin_actualiza_planes"
    on public.planes_mensuales for update
    using (public.is_superadmin())
    with check (public.is_superadmin());

-- ----------------------------------------------------------------------------
-- 3. ARRIENDO DE EQUIPAMIENTO (hoy es texto fijo en el HTML)
-- ----------------------------------------------------------------------------
create table if not exists public.equipamiento (
    id text primary key,
    orden smallint not null,
    nombre text not null,
    precio integer not null,
    updated_at timestamptz not null default now()
);

insert into public.equipamiento (id, orden, nombre, precio) values
    ('balon', 1, 'Balón de fútbol', 2000),
    ('guantes', 2, 'Guantes de arquero', 3000),
    ('ropa', 3, 'Set de ropa deportiva', 4000)
on conflict (id) do nothing;

alter table public.equipamiento enable row level security;

drop policy if exists "cualquiera_ve_equipamiento" on public.equipamiento;
create policy "cualquiera_ve_equipamiento"
    on public.equipamiento for select
    using (true);

drop policy if exists "superadmin_actualiza_equipamiento" on public.equipamiento;
create policy "superadmin_actualiza_equipamiento"
    on public.equipamiento for update
    using (public.is_superadmin())
    with check (public.is_superadmin());
