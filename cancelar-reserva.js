(function () {
    'use strict';

    var SPORT_LABELS = { futbolito: 'Futbolito', padel: 'Pádel' };

    function formatCLP(n) {
        return '$' + Number(n || 0).toLocaleString('es-CL');
    }

    var el = {
        cargando: document.getElementById('cancelacionCargando'),
        detalle: document.getElementById('cancelacionDetalle'),
        detDeporte: document.getElementById('detDeporte'),
        detCancha: document.getElementById('detCancha'),
        detFecha: document.getElementById('detFecha'),
        detHora: document.getElementById('detHora'),
        detMonto: document.getElementById('detMonto'),
        btnAnular: document.getElementById('btnAnular'),
        error: document.getElementById('cancelacionError'),
        exito: document.getElementById('cancelacionExito')
    };

    function mostrarError(mensaje) {
        el.cargando.hidden = true;
        el.detalle.hidden = true;
        el.error.hidden = false;
        el.error.textContent = mensaje;
    }

    function pintarDetalle(reserva) {
        el.detDeporte.textContent = SPORT_LABELS[reserva.deporte] || reserva.deporte;
        el.detCancha.textContent = reserva.cancha;
        el.detFecha.textContent = reserva.fechaTexto;
        el.detHora.textContent = String(reserva.hora).padStart(2, '0') + ':00 hrs';
        el.detMonto.textContent = formatCLP(reserva.montoPagado);
    }

    var id = new URLSearchParams(window.location.search).get('id');

    if (!id) {
        mostrarError('Este link no incluye una reserva válida. Revisa que copiaste la URL completa del correo.');
        return;
    }

    fetch('/api/cancelar-reserva?id=' + encodeURIComponent(id))
        .then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body }; }); })
        .then(function (result) {
            if (!result.ok) {
                mostrarError(result.body.error || 'No pudimos cargar tu reserva.');
                return;
            }

            var reserva = result.body.reserva;
            el.cargando.hidden = true;
            el.detalle.hidden = false;
            pintarDetalle(reserva);

            if (reserva.estado === 'cancelada') {
                el.btnAnular.hidden = true;
                el.exito.hidden = false;
                el.exito.textContent = 'Esta reserva ya estaba anulada.';
                return;
            }

            if (reserva.yaPaso) {
                el.btnAnular.hidden = true;
                el.error.hidden = false;
                el.error.textContent = 'Esta reserva ya pasó, no se puede anular desde aquí.';
                return;
            }

            el.btnAnular.addEventListener('click', function () {
                if (!window.confirm('¿Confirmas que quieres anular esta reserva? El horario quedará disponible para otras personas.')) return;

                el.btnAnular.disabled = true;
                el.btnAnular.textContent = 'Anulando...';

                fetch('/api/cancelar-reserva', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: id })
                })
                    .then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body }; }); })
                    .then(function (result) {
                        if (!result.ok) {
                            el.btnAnular.disabled = false;
                            el.btnAnular.textContent = 'Anular mi Reserva';
                            el.error.hidden = false;
                            el.error.textContent = result.body.error || 'No pudimos anular tu reserva. Intenta de nuevo.';
                            return;
                        }

                        el.btnAnular.hidden = true;
                        el.exito.hidden = false;
                        el.exito.textContent = 'Tu reserva fue anulada correctamente.';
                    })
                    .catch(function () {
                        el.btnAnular.disabled = false;
                        el.btnAnular.textContent = 'Anular mi Reserva';
                        el.error.hidden = false;
                        el.error.textContent = 'No pudimos anular tu reserva. Intenta de nuevo.';
                    });
            });
        })
        .catch(function () {
            mostrarError('No pudimos cargar tu reserva. Intenta de nuevo más tarde.');
        });
})();
