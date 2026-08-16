-- ============================================================================
-- PARCHE: corrige la recursión infinita en las políticas de "admin ve todo"
-- Pégalo en el SQL Editor de Supabase y ejecútalo (Run). Es seguro de
-- correr aunque ya hayas ejecutado schema.sql una vez.
-- ============================================================================

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

drop policy if exists "admins_ven_todos_los_perfiles" on public.profiles;
create policy "admins_ven_todos_los_perfiles"
    on public.profiles for select
    using (public.is_admin());

drop policy if exists "admins_ven_todas_las_reservas" on public.reservas;
create policy "admins_ven_todas_las_reservas"
    on public.reservas for select
    using (public.is_admin());
