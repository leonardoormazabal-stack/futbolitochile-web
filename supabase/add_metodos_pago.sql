-- ============================================================================
-- PARCHE: permite habilitar/deshabilitar medios de pago desde el panel
-- (solo superadministrador), sección Tarifas → Métodos de Pago.
-- Pégalo en el SQL Editor de Supabase y ejecútalo (Run).
-- ============================================================================

create table if not exists public.metodos_pago (
    id text primary key,
    orden smallint not null,
    nombre text not null,
    activo boolean not null default true,
    updated_at timestamptz not null default now()
);

-- El "nombre" debe coincidir exactamente con el atributo data-method de los
-- botones de pago en reservas.html, ya que así se cruzan para saber cuáles
-- mostrar habilitados.
insert into public.metodos_pago (id, orden, nombre, activo) values
    ('mercadopago', 1, 'Mercado Pago', true),
    ('webpay', 2, 'Webpay (Transbank)', true),
    ('getnet', 3, 'GetNet', true),
    ('tarjeta', 4, 'Tarjeta de Crédito/Débito', true),
    ('transferencia', 5, 'Transferencia', true),
    ('efectivo', 6, 'Efectivo', true)
on conflict (id) do nothing;

alter table public.metodos_pago enable row level security;

drop policy if exists "cualquiera_ve_metodos_pago" on public.metodos_pago;
create policy "cualquiera_ve_metodos_pago"
    on public.metodos_pago for select
    using (true);

drop policy if exists "superadmin_actualiza_metodos_pago" on public.metodos_pago;
create policy "superadmin_actualiza_metodos_pago"
    on public.metodos_pago for update
    using (public.is_superadmin())
    with check (public.is_superadmin());
