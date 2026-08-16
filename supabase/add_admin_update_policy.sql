-- ============================================================================
-- PARCHE: agrega el permiso para que administrador/superadministrador
-- puedan anular reservas (UPDATE) desde el panel de administración.
-- Pégalo en el SQL Editor de Supabase y ejecútalo (Run).
-- ============================================================================

drop policy if exists "admins_actualizan_reservas" on public.reservas;
create policy "admins_actualizan_reservas"
    on public.reservas for update
    using (public.is_admin())
    with check (public.is_admin());
