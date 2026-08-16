-- ============================================================================
-- PARCHE: contenido editable del sitio (Hero, Quiénes Somos, Instalaciones)
-- desde la sección "Contenido" del panel, solo para superadministrador.
-- Pégalo en el SQL Editor de Supabase y ejecútalo (Run).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TEXTOS EDITABLES (clave/valor)
-- ----------------------------------------------------------------------------
create table if not exists public.site_content (
    key text primary key,
    value text not null default '',
    updated_at timestamptz not null default now()
);

insert into public.site_content (key, value) values
    ('hero_title', 'Ven a disfrutar nuestras canchas'),
    ('hero_subtitle', 'FutbolitoChile es tu centro deportivo familiar'),
    ('nosotros_imagen_url', 'pictures/quienes-somos.png'),
    ('nosotros_tagline', 'Pasión, Deporte y Comunidad en La Pintana'),
    ('nosotros_parrafo1', 'En Futbolito Chile, nos destacamos por entregar un excelente espacio para disfrutar del deporte más lindo del mundo. Con una amplia y consolidada trayectoria en la comuna de La Pintana, nos hemos posicionado como el recinto deportivo de referencia para familias, amigos y deportistas que buscan infraestructura de primer nivel y un ambiente seguro.'),
    ('nosotros_parrafo2', 'Nuestra misión es brindar una experiencia integral alrededor del fútbol, combinando tecnología de vanguardia, instalaciones de alto rendimiento y espacios diseñados para el encuentro y la camaradería.'),
    ('nosotros_feature1_titulo', 'Juega Seguro'),
    ('nosotros_feature1_texto', 'Tu tranquilidad y la de tu familia es nuestra prioridad. Contamos con cámaras de seguridad HD en todo el perímetro del sector de canchas y más de 60 estacionamientos interiores monitoreados por CCTV, además de personal de seguridad capacitado a tu disposición.'),
    ('nosotros_feature2_titulo', 'Partidos de Alto Nivel'),
    ('nosotros_feature2_texto', 'Disponemos de 6 canchas de futbolito (20×40 mts), cada una equipada con pasto sintético certificado de excelente calidad, ideal para la práctica deportiva de alto rendimiento. Además, contamos con iluminación LED de alta tecnología configurada bajo estándares y normas FIFA para garantizar un juego óptimo a cualquier hora.'),
    ('nosotros_feature3_titulo', 'Cómodas Instalaciones'),
    ('nosotros_feature3_texto', 'El partido no termina en la cancha. Previo o posterior a tus encuentros, puedes disfrutar de nuestro recinto equipado con amplias áreas verdes, quinchos pensados para el esparcimiento familiar y la convivencia del tercer tiempo, y una cafetería con cómodas terrazas.'),
    ('nosotros_cta_titulo', '¡Súmate a nuestra comunidad deportiva!'),
    ('nosotros_cta_texto', 'Ven a vivir el fútbol con la calidad, seguridad y trayectoria que nos caracteriza.')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 2. TARJETAS DE INSTALACIONES (editables)
-- ----------------------------------------------------------------------------
create table if not exists public.instalaciones_cards (
    id text primary key,
    orden smallint not null,
    titulo text not null,
    descripcion text not null,
    imagen_url text,
    updated_at timestamptz not null default now()
);

insert into public.instalaciones_cards (id, orden, titulo, descripcion, imagen_url) values
    ('canchas', 1, '6 Canchas de Futbolito', 'Canchas renovadas y bien mantenidas con césped sintético de alta calidad, iluminación LED y medidas oficiales para fútbol 5 y 7.', 'pictures/cancha-sintetica.jpg'),
    ('padel', 2, '2 Canchas de Pádel', 'Canchas de pádel de primera, ideales para jugar de día o de noche.', 'pictures/cancha_padel.png'),
    ('piscina', 3, 'Piscina al aire libre', 'Espacio de recreación y descanso para toda la familia, disponible también como parte de nuestros paquetes de eventos.', 'pictures/piscina.jpeg'),
    ('quinchos', 4, 'Zona de Quinchos', 'Áreas equipadas para asados y celebraciones, perfectas para después del partido o para tu próximo evento.', 'pictures/estacionamiento.jpg'),
    ('camarines', 5, 'Camarines y Baños', 'Amplios camarines equipados con duchas de agua caliente, casilleros seguros y todas las comodidades para tu equipo.', 'pictures/camarines.jpg'),
    ('kiosco', 6, 'Kiosco y Snack Bar', 'Bebidas, snacks y comida rápida disponibles durante toda tu estadía en el recinto.', 'pictures/kiosco.jpg')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 3. SEGURIDAD: lectura pública, edición solo superadministrador
-- ----------------------------------------------------------------------------
alter table public.site_content enable row level security;
alter table public.instalaciones_cards enable row level security;

drop policy if exists "cualquiera_ve_site_content" on public.site_content;
create policy "cualquiera_ve_site_content"
    on public.site_content for select
    using (true);

drop policy if exists "superadmin_actualiza_site_content" on public.site_content;
create policy "superadmin_actualiza_site_content"
    on public.site_content for update
    using (public.is_superadmin())
    with check (public.is_superadmin());

drop policy if exists "superadmin_inserta_site_content" on public.site_content;
create policy "superadmin_inserta_site_content"
    on public.site_content for insert
    with check (public.is_superadmin());

drop policy if exists "cualquiera_ve_instalaciones_cards" on public.instalaciones_cards;
create policy "cualquiera_ve_instalaciones_cards"
    on public.instalaciones_cards for select
    using (true);

drop policy if exists "superadmin_actualiza_instalaciones_cards" on public.instalaciones_cards;
create policy "superadmin_actualiza_instalaciones_cards"
    on public.instalaciones_cards for update
    using (public.is_superadmin())
    with check (public.is_superadmin());

drop policy if exists "superadmin_inserta_instalaciones_cards" on public.instalaciones_cards;
create policy "superadmin_inserta_instalaciones_cards"
    on public.instalaciones_cards for insert
    with check (public.is_superadmin());

-- ----------------------------------------------------------------------------
-- 4. STORAGE: bucket público para las imágenes subidas desde el panel
-- ----------------------------------------------------------------------------
-- OJO: el bucket "site-images" NO se crea aquí. Insertarlo directo por SQL
-- (insert into storage.buckets ...) deja una fila incompleta que el
-- servicio de Storage no reconoce ("Bucket not found" aunque la fila
-- exista). Créalo desde el dashboard: Storage → New bucket → nombre
-- "site-images" → marca "Public bucket". Luego corre las políticas de
-- abajo, que sí funcionan bien por SQL.

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
