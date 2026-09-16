-- ============================================================================
-- PARCHE: hace editable la página eventos.html desde la sección "Contenido"
-- del panel (solo superadministrador) — textos y la galería de fotos
-- (agregar/quitar fotos libremente, no un número fijo de tarjetas).
-- Pégalo en el SQL Editor de Supabase y ejecútalo (Run).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TEXTOS EDITABLES (usa la misma tabla site_content de add_site_content.sql)
-- ----------------------------------------------------------------------------
insert into public.site_content (key, value) values
    ('eventos_intro_texto', 'Arrienda nuestros espacios integrados —salón de eventos, piscina, quinchos y canchas— para cumpleaños, celebraciones familiares o eventos corporativos. Cotiza tu evento y te ayudamos a organizar todo para que solo te preocupes de disfrutar.'),
    ('eventos_galeria_titulo', 'Nuestro salón de eventos'),
    ('eventos_cta_texto', '¿Tienes en mente un cumpleaños, matrimonio o evento de empresa? Cuéntanos qué necesitas y armamos tu cotización.')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 2. GALERÍA DE FOTOS (cantidad libre: se puede agregar o quitar cualquiera)
-- ----------------------------------------------------------------------------
create table if not exists public.eventos_fotos (
    id uuid primary key default gen_random_uuid(),
    orden smallint not null default 0,
    imagen_url text not null,
    alt_text text,
    created_at timestamptz not null default now()
);

-- Siembra la galería con las fotos que ya están publicadas en eventos.html,
-- para que el panel arranque mostrando exactamente lo que ya está en línea.
-- Solo inserta si la tabla está vacía, para que este script se pueda volver
-- a correr sin duplicar filas.
insert into public.eventos_fotos (orden, imagen_url, alt_text)
select * from (values
    (1, 'pictures/evento-01.jpeg', 'Salón de eventos decorado en blanco y azul, con arco de globos'),
    (2, 'pictures/evento-02.jpeg', 'Salón de eventos decorado en blanco y azul, con lámparas de cristal'),
    (3, 'pictures/evento-03.jpeg', 'Salón de eventos con pista de baile y sillas rojas'),
    (4, 'pictures/evento-04.jpeg', 'Mesas decoradas en blanco y azul para celebración'),
    (5, 'pictures/evento-05.jpeg', 'Equipo de sonido y música para eventos'),
    (6, 'pictures/evento-06.jpeg', 'Mesa decorada con sillas rojas para cena de celebración'),
    (7, 'pictures/evento-07.jpeg', 'Salón de eventos con mesas y sillas rojas, servicio de garzones'),
    (8, 'pictures/evento-08.jpeg', 'Terraza con vista a las canchas, ideal para cóctel'),
    (9, 'pictures/evento-09.jpeg', 'Mesa de honor con arreglos florales'),
    (10, 'pictures/evento-10.jpeg', 'Mesa decorada con centro de flores altas'),
    (11, 'pictures/evento-11.jpeg', 'Salón de eventos completo con mesas y sillas rojas'),
    (12, 'pictures/evento-12.jpeg', 'Mesa servida con vajilla y flores para celebración'),
    (13, 'pictures/evento-13.jpeg', 'Mesa servida con vajilla, copas y flores para celebración')
) as v(orden, imagen_url, alt_text)
where not exists (select 1 from public.eventos_fotos);

-- ----------------------------------------------------------------------------
-- 3. SEGURIDAD: lectura pública, agregar/quitar solo superadministrador
-- ----------------------------------------------------------------------------
alter table public.eventos_fotos enable row level security;

drop policy if exists "cualquiera_ve_eventos_fotos" on public.eventos_fotos;
create policy "cualquiera_ve_eventos_fotos"
    on public.eventos_fotos for select
    using (true);

drop policy if exists "superadmin_inserta_eventos_fotos" on public.eventos_fotos;
create policy "superadmin_inserta_eventos_fotos"
    on public.eventos_fotos for insert
    with check (public.is_superadmin());

drop policy if exists "superadmin_elimina_eventos_fotos" on public.eventos_fotos;
create policy "superadmin_elimina_eventos_fotos"
    on public.eventos_fotos for delete
    using (public.is_superadmin());
