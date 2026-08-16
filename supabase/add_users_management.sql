-- ============================================================================
-- PARCHE: soporte para la sección "Usuarios" del panel de administración.
-- Pégalo en el SQL Editor de Supabase y ejecútalo (Run).
-- ============================================================================

-- 1. Agrega la columna email a profiles (para poder listar usuarios sin
--    necesitar acceso a auth.users, que no es accesible desde el frontend).
alter table public.profiles add column if not exists email text;

-- 2. Rellena el email de los usuarios que ya existían antes de este parche.
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

-- 3. Actualiza el trigger para que los nuevos registros guarden su email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.profiles (id, nombre, email, tipo_documento, documento, telefono, rol)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'nombre', ''),
        new.email,
        new.raw_user_meta_data ->> 'tipo_documento',
        new.raw_user_meta_data ->> 'documento',
        new.raw_user_meta_data ->> 'telefono',
        'jugador'
    );
    return new;
end;
$$;

-- 4. Función para saber si el usuario actual es superadministrador
--    (igual que is_admin(), pero exclusiva para ese rol).
create or replace function public.is_superadmin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and rol = 'superadministrador'
    );
$$;

-- 5. Solo el superadministrador puede cambiar el rol/datos de otro usuario.
drop policy if exists "superadmin_actualiza_cualquier_perfil" on public.profiles;
create policy "superadmin_actualiza_cualquier_perfil"
    on public.profiles for update
    using (public.is_superadmin())
    with check (public.is_superadmin());

-- 6. Promueve la cuenta leonardo.ormazabal@powerenergy.cl (ya creada) a
--    superadministrador. Es el único bootstrap manual necesario: desde
--    aquí en adelante, esa cuenta gestiona el resto de los usuarios
--    directamente desde la sección "Usuarios" del panel.
update public.profiles
set rol = 'superadministrador'
where id = 'e0635b99-2417-487f-9224-b21d2eaa4a52';
