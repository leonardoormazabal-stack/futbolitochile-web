-- Permite que un administrador/superadministrador deje de recibir el correo
-- de "Nueva reserva" por cada reserva individual (api/reserva-confirmacion.js),
-- sin afectar el correo resumen diario (api/reporte-diario.js), que sigue
-- yendo a todos los administradores sin importar este valor.
alter table public.profiles
    add column if not exists notificar_nuevas_reservas boolean not null default true;
