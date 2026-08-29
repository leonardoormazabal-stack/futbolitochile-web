-- ============================================================================
-- PARCHE: hace editables los textos del menú de navegación y los títulos de
-- cada sección del sitio, desde la sección "Contenido" del panel (solo
-- superadministrador). Usa la misma tabla site_content ya creada por
-- add_site_content.sql.
-- Pégalo en el SQL Editor de Supabase y ejecútalo (Run).
-- ============================================================================

insert into public.site_content (key, value) values
    ('menu_reservas', 'Reservas'),
    ('menu_tarifas', 'Tarifas y Planes'),
    ('menu_eventos', 'Eventos'),
    ('menu_escuelas', 'Escuelas y Ligas'),
    ('menu_nosotros', 'Quiénes Somos'),
    ('menu_contacto', 'Contacto'),
    ('section_instalaciones_titulo', 'Nuestras Instalaciones'),
    ('section_tarifas_titulo', 'Tarifas y Planes'),
    ('section_eventos_titulo', 'Eventos y Cumpleaños'),
    ('section_escuelas_titulo', 'Escuelas y Ligas'),
    ('section_publicidad_titulo', 'Publicidad y Convenios'),
    ('section_reserva_titulo', '¿Listo para jugar?'),
    ('nosotros_titulo', '¿Quiénes Somos?')
on conflict (key) do nothing;
