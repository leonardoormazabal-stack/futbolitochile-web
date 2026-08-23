-- ============================================================================
-- Ejecuta esto en el SQL Editor de Supabase cuando, después de correr un
-- parche que agrega columnas nuevas (ALTER TABLE ... ADD COLUMN), el sitio
-- siga mostrando errores como "Could not find the 'X' column of 'Y' in the
-- schema cache" a pesar de que la columna sí existe en la tabla.
--
-- Esto pasa porque PostgREST (la capa API que usa Supabase) mantiene su
-- propia copia en memoria de la estructura de la base de datos, y a veces no
-- se entera de inmediato de un ALTER TABLE reciente. Este comando le avisa
-- que debe releer el esquema ahora mismo, sin esperar su próximo ciclo
-- automático.
-- ============================================================================

NOTIFY pgrst, 'reload schema';
