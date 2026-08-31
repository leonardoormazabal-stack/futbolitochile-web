-- Evita que existan dos cuentas distintas con el mismo RUT/documento: la
-- creación automática de cuenta al reservar (ver api/registrar-cliente.js)
-- busca primero por "documento" en profiles, así que dos perfiles con el
-- mismo RUT romperían esa búsqueda (o crearían cuentas duplicadas para la
-- misma persona). Índice parcial: ignora los NULL para no bloquear perfiles
-- sin documento cargado.
create unique index if not exists profiles_documento_unique_idx
    on public.profiles (documento)
    where documento is not null;
