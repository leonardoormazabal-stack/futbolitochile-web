-- ============================================================================
-- FUTBOLITO CHILE — ESQUEMA DE BASE DE DATOS PARA SUPABASE
-- ============================================================================
-- Cómo usarlo:
-- 1. Entra a tu proyecto en https://supabase.com/dashboard
-- 2. Ve a "SQL Editor" → "New query"
-- 3. Pega todo este archivo y ejecútalo (Run)
-- 4. Debería crear todo sin errores en una base de datos nueva
--
-- Este esquema reemplaza el localStorage que usan hoy auth.js y reservas.js:
--   - Autenticación real vía Supabase Auth (auth.users) en vez de contraseñas
--     en texto plano guardadas en el navegador.
--   - profiles: datos adicionales del usuario (nombre, documento, rol).
--   - canchas / tarifas: catálogo de canchas y precios (hoy hardcodeados en
--     reservas.js).
--   - reservas: reservas reales, con una restricción UNIQUE que impide que
--     dos personas reserven la misma cancha/fecha/hora (hoy la
--     "disponibilidad" en reservas.js es solo una simulación con hash, sin
--     protección real contra reservas duplicadas).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ROLES DE USUARIO
-- ----------------------------------------------------------------------------
create type public.user_role as enum ('jugador', 'administrador', 'superadministrador');

-- ----------------------------------------------------------------------------
-- 2. PERFILES (extiende auth.users con los datos propios del negocio)
-- ----------------------------------------------------------------------------
create table public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    nombre text not null,
    tipo_documento text check (tipo_documento in ('rut', 'pasaporte')),
    documento text,
    telefono text,
    rol public.user_role not null default 'jugador',
    created_at timestamptz not null default now()
);

comment on table public.profiles is 'Datos de perfil de cada usuario. Se crea automáticamente al registrarse (ver trigger handle_new_user).';

-- Crea el perfil automáticamente cuando alguien se registra con supabase.auth.signUp()
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.profiles (id, nombre, tipo_documento, documento, telefono, rol)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'nombre', ''),
        new.raw_user_meta_data ->> 'tipo_documento',
        new.raw_user_meta_data ->> 'documento',
        new.raw_user_meta_data ->> 'telefono',
        'jugador'
    );
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- Función auxiliar para las políticas de "admin ve todo".
-- OJO: si esas políticas consultaran directamente "select ... from
-- public.profiles" para saber el rol del usuario, Postgres dispara la
-- política de nuevo al evaluar esa misma consulta → recursión infinita.
-- security definer hace que esta función corra sin RLS, evitando el problema.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and rol in ('administrador', 'superadministrador')
    );
$$;

-- ----------------------------------------------------------------------------
-- 3. CANCHAS (catálogo)
-- ----------------------------------------------------------------------------
create table public.canchas (
    id text primary key,
    nombre text not null,
    deporte text not null check (deporte in ('futbolito', 'padel')),
    descripcion text
);

insert into public.canchas (id, nombre, deporte, descripcion) values
    ('F1', 'Cancha F1', 'futbolito', 'Techada, pasto sintético de última generación.'),
    ('F2', 'Cancha F2', 'futbolito', 'Al aire libre, con iluminación LED nocturna.'),
    ('F3', 'Cancha F3', 'futbolito', 'Techada, ideal para partidos nocturnos.'),
    ('F4', 'Cancha F4', 'futbolito', 'Al aire libre, la más amplia del recinto.'),
    ('F5', 'Cancha F5', 'futbolito', 'Techada, con graderías para público.'),
    ('F6', 'Cancha F6', 'futbolito', 'Al aire libre, cercana al kiosco y camarines.'),
    ('P1', 'Cancha P1', 'padel', 'Panorámica, con paredes de vidrio templado.'),
    ('P2', 'Cancha P2', 'padel', 'Techada, disponible de día y de noche.');

-- ----------------------------------------------------------------------------
-- 4. TARIFAS (precio por hora según deporte y franja horaria)
-- ----------------------------------------------------------------------------
create table public.tarifas (
    id serial primary key,
    deporte text not null check (deporte in ('futbolito', 'padel')),
    hora_desde smallint not null,
    hora_hasta smallint not null,
    precio integer not null
);

insert into public.tarifas (deporte, hora_desde, hora_hasta, precio) values
    ('futbolito', 12, 18, 27000),
    ('futbolito', 18, 20, 32000),
    ('futbolito', 20, 23, 37000),
    ('padel', 12, 18, 35000),
    ('padel', 18, 20, 40000),
    ('padel', 20, 23, 45000);

-- ----------------------------------------------------------------------------
-- 5. RESERVAS
-- ----------------------------------------------------------------------------
create table public.reservas (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users (id) on delete set null,
    cancha_id text not null references public.canchas (id),
    fecha date not null,
    hora smallint not null check (hora between 0 and 23),
    precio integer not null,
    nombre_contacto text not null,
    documento_contacto text,
    telefono_contacto text,
    email_contacto text,
    metodo_pago text,
    estado text not null default 'confirmada' check (estado in ('confirmada', 'cancelada')),
    created_at timestamptz not null default now(),
    unique (cancha_id, fecha, hora)
);

comment on constraint reservas_cancha_id_fecha_hora_key on public.reservas is 'Evita que dos reservas ocupen la misma cancha en la misma fecha y hora.';

-- Vista pública y segura: solo expone qué horarios están ocupados,
-- sin datos personales, para que el calendario de reservas.html pueda
-- pintar los bloques disponibles/ocupados sin necesidad de sesión.
create view public.disponibilidad as
    select cancha_id, fecha, hora
    from public.reservas
    where estado = 'confirmada';

-- ----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.canchas enable row level security;
alter table public.tarifas enable row level security;
alter table public.reservas enable row level security;

-- Perfiles: cada usuario ve y edita el suyo; admins ven todos.
create policy "usuarios_ven_su_perfil"
    on public.profiles for select
    using (auth.uid() = id);

create policy "usuarios_actualizan_su_perfil"
    on public.profiles for update
    using (auth.uid() = id);

create policy "admins_ven_todos_los_perfiles"
    on public.profiles for select
    using (public.is_admin());

-- Canchas y tarifas: catálogo público, cualquiera las puede leer.
create policy "cualquiera_ve_canchas"
    on public.canchas for select
    using (true);

create policy "cualquiera_ve_tarifas"
    on public.tarifas for select
    using (true);

-- Reservas: cualquiera puede crear una (hoy el sitio no exige login para
-- reservar); cada usuario ve solo las suyas; admins ven todas.
create policy "cualquiera_puede_reservar"
    on public.reservas for insert
    with check (true);

create policy "usuarios_ven_sus_reservas"
    on public.reservas for select
    using (auth.uid() = user_id);

create policy "admins_ven_todas_las_reservas"
    on public.reservas for select
    using (public.is_admin());

-- Admins pueden crear reservas para terceros, y anular (estado = 'cancelada')
-- cualquier reserva desde el panel de administración.
create policy "admins_actualizan_reservas"
    on public.reservas for update
    using (public.is_admin())
    with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 7. NOTA IMPORTANTE SOBRE ADMINISTRADORES
-- ----------------------------------------------------------------------------
-- Este esquema NO precrea cuentas de Administrador ni Super Administrador
-- (a diferencia de la demo en localStorage, que usaba admin123/super123 en
-- texto plano — eso NUNCA debe replicarse en una base de datos real).
--
-- Para crear esas dos cuentas reales:
--   1. Regístralas normalmente desde registro.html (quedan como 'jugador'),
--      o créalas desde Supabase → Authentication → Add user.
--   2. Luego, en el SQL Editor, sube su rol manualmente:
--        update public.profiles set rol = 'administrador'
--        where id = '<uuid del usuario, visible en Authentication → Users>';
