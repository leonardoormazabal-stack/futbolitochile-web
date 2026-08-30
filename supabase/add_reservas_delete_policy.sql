-- ============================================================================
-- PARCHE: agrega el permiso para que SOLO el superadministrador pueda
-- eliminar reservas (DELETE) desde la pestaña Clientes del panel de
-- administración, al eliminar por completo el historial de un cliente.
-- Pégalo en el SQL Editor de Supabase y ejecútalo (Run).
-- ============================================================================

drop policy if exists "superadmin_elimina_reservas" on public.reservas;
create policy "superadmin_elimina_reservas"
    on public.reservas for delete
    using (public.is_superadmin());
