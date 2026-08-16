-- Falta la política de UPDATE para "canchas" (se pudo crear el catálogo
-- inicial, pero nunca se agregó permiso para editarlo después).
drop policy if exists "superadmin_actualiza_canchas" on public.canchas;
create policy "superadmin_actualiza_canchas"
    on public.canchas for update
    using (public.is_superadmin())
    with check (public.is_superadmin());
