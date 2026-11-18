/* ============================================================================
   Popup de promoción de temporada en la portada: aparece a los 5 segundos
   solo si hay alguna fila activa en "promos_horario" (el mismo interruptor
   que controla el precio promocional en Tarifas → Promoción de Horario del
   panel admin). Si la tabla todavía no existe (falta correr
   add_promos_horario.sql) o la consulta falla, el popup simplemente no
   aparece en vez de romper el resto de la portada.

   No vuelve a aparecer en la misma pestaña una vez que el visitante lo
   cierra (o hace clic en "Reservar ahora"): se recuerda en sessionStorage,
   no en la cuenta del cliente.
   ============================================================================ */
(function () {
    'use strict';

    var sb = window.sbClient;
    var overlay = document.getElementById('promoPopupOverlay');
    var btnCerrar = document.getElementById('promoPopupClose');
    var btnReservar = document.getElementById('promoPopupReservar');
    if (!sb || !overlay || !btnCerrar) return;

    function noMolestarDeNuevo() {
        try { sessionStorage.setItem('promoPopupCerrado', '1'); } catch (e) {}
    }

    function cerrarPopup() {
        overlay.hidden = true;
        noMolestarDeNuevo();
    }

    btnCerrar.addEventListener('click', cerrarPopup);
    if (btnReservar) btnReservar.addEventListener('click', noMolestarDeNuevo);
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) cerrarPopup();
    });

    var yaCerrado = false;
    try { yaCerrado = sessionStorage.getItem('promoPopupCerrado') === '1'; } catch (e) {}
    if (yaCerrado) return;

    sb.from('promos_horario').select('activo').then(function (result) {
        var hayPromoActiva = (result.data || []).some(function (p) { return p.activo; });
        if (!hayPromoActiva) return;

        setTimeout(function () {
            overlay.hidden = false;
        }, 5000);
    }).catch(function () {});
})();
