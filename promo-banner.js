/* ============================================================================
   Muestra el banner de promoción de temporada en la portada solo si hay
   alguna fila activa en "promos_horario" (el mismo interruptor que controla
   el precio promocional en Tarifas → Promoción de Horario del panel admin).
   Si la tabla todavía no existe (falta correr add_promos_horario.sql) o la
   consulta falla, el banner simplemente se queda oculto en vez de romper el
   resto de la portada.
   ============================================================================ */
(function () {
    'use strict';

    var sb = window.sbClient;
    var banner = document.getElementById('promoBanner');
    if (!sb || !banner) return;

    sb.from('promos_horario').select('activo').then(function (result) {
        var hayPromoActiva = (result.data || []).some(function (p) { return p.activo; });
        banner.hidden = !hayPromoActiva;
    }).catch(function () {});
})();
