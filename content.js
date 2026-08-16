(function () {
    'use strict';

    var sb = window.sbClient;
    if (!sb) return;

    // Mismo degradado que usan las tarjetas en style.css — se reaplica aquí
    // porque al fijar background-image por JS se pierde el que definía la clase CSS.
    var GRADIENTE_CARD = 'linear-gradient(180deg, rgba(0, 0, 0, 0.35) 0%, rgba(0, 0, 0, 0.25) 40%, rgba(0, 0, 0, 0.75) 100%)';

    function aplicarTextosEImagenes(filas) {
        var contenido = {};
        filas.forEach(function (fila) { contenido[fila.key] = fila.value; });

        document.querySelectorAll('[data-content-text]').forEach(function (el) {
            var key = el.getAttribute('data-content-text');
            if (contenido[key]) el.textContent = contenido[key];
        });

        document.querySelectorAll('[data-content-img]').forEach(function (el) {
            var key = el.getAttribute('data-content-img');
            if (contenido[key]) el.src = contenido[key];
        });
    }

    function aplicarCards(cards) {
        cards.forEach(function (card) {
            var el = document.querySelector('.card[data-card-id="' + card.id + '"]');
            if (!el) return;

            var h3 = el.querySelector('h3');
            var p = el.querySelector('p');
            if (h3 && card.titulo) h3.textContent = card.titulo;
            if (p && card.descripcion) p.textContent = card.descripcion;
            if (card.imagen_url) {
                el.style.backgroundImage = GRADIENTE_CARD + ', url("' + card.imagen_url + '")';
            }
        });
    }

    Promise.all([
        sb.from('site_content').select('key,value'),
        sb.from('instalaciones_cards').select('id,titulo,descripcion,imagen_url').order('orden', { ascending: true })
    ]).then(function (resultados) {
        var contenidoRes = resultados[0];
        var cardsRes = resultados[1];

        if (!contenidoRes.error && contenidoRes.data) {
            aplicarTextosEImagenes(contenidoRes.data);
        }
        if (!cardsRes.error && cardsRes.data) {
            aplicarCards(cardsRes.data);
        }
    }).catch(function () {
        // Si falla la carga, el sitio simplemente conserva el contenido
        // estático que ya trae el HTML — no hay pantalla en blanco.
    });
})();
