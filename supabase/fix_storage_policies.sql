-- Vuelve a crear las políticas de storage.objects para el bucket
-- "site-images" (por si se perdieron al borrar/recrear el bucket).

drop policy if exists "lectura_publica_site_images" on storage.objects;
create policy "lectura_publica_site_images"
    on storage.objects for select
    using (bucket_id = 'site-images');

drop policy if exists "superadmin_sube_site_images" on storage.objects;
create policy "superadmin_sube_site_images"
    on storage.objects for insert
    with check (bucket_id = 'site-images' and public.is_superadmin());

drop policy if exists "superadmin_actualiza_site_images" on storage.objects;
create policy "superadmin_actualiza_site_images"
    on storage.objects for update
    using (bucket_id = 'site-images' and public.is_superadmin());

drop policy if exists "superadmin_elimina_site_images" on storage.objects;
create policy "superadmin_elimina_site_images"
    on storage.objects for delete
    using (bucket_id = 'site-images' and public.is_superadmin());

-- Diagnóstico: confirma que quedaron creadas.
select policyname, cmd from pg_policies where tablename = 'objects' and schemaname = 'storage';
