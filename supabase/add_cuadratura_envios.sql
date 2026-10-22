/* ============================================================================
   Problema: la cuadratura diaria se enviaba 2 veces por correo: primero la
   automática (cron de la madrugada) y luego la "corregida" que manda un
   administrador (ej. David) al cerrar caja desde el panel admin.

   Fix: esta tabla deja constancia de cada envío de cuadratura por fecha y
   tipo. El cron automático (api/reporte-diario.js) revisa antes de enviar si
   ya existe un envío "corregida" para ese día; si existe, se salta el envío
   automático. El envío manual (api/cuadratura-corregida.js) registra su
   propio envío como "corregida" apenas termina de mandar el correo.

   Solo la usan las funciones serverless con el cliente de service-role
   (getSupabaseAdmin), que ignora RLS, así que no se necesitan políticas
   públicas ni una pantalla en el panel admin para esta tabla.
   ============================================================================ */

create table public.cuadratura_envios (
    id uuid primary key default gen_random_uuid(),
    fecha date not null,
    tipo text not null check (tipo in ('automatica', 'corregida')),
    enviado_en timestamptz not null default now()
);

create index cuadratura_envios_fecha_tipo_idx on public.cuadratura_envios (fecha, tipo);

alter table public.cuadratura_envios enable row level security;
