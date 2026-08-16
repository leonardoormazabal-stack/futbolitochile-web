-- Borra la fila incompleta que dejó el intento anterior de crear el bucket
-- "site-images" directo por SQL, para poder crearlo limpio desde la
-- interfaz de Supabase (Storage → New bucket).
delete from storage.buckets where id = 'site-images';
