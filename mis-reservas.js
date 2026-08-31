(function () {
    'use strict';

    var sb = window.sbClient;
    var SPORT_LABELS = { futbolito: 'Futbolito', padel: 'Pádel' };
    var userId = null;

    function formatCLP(n) {
        return '$' + Number(n || 0).toLocaleString('es-CL');
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatFechaLarga(fechaISO) {
        var partes = fechaISO.split('-');
        var d = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
        return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    function toISODateHoy() {
        var hoy = new Date();
        return hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
    }

    var el = {
        saludo: document.getElementById('misReservasSaludo'),
        cargando: document.getElementById('misReservasCargando'),
        error: document.getElementById('misReservasError'),
        contenido: document.getElementById('misReservasContenido'),
        proximas: document.getElementById('misReservasProximas'),
        proximasVacio: document.getElementById('misReservasProximasVacio'),
        historial: document.getElementById('misReservasHistorial'),
        historialVacio: document.getElementById('misReservasHistorialVacio')
    };

    function mostrarError(mensaje) {
        el.cargando.hidden = true;
        el.error.hidden = false;
        el.error.textContent = mensaje;
    }

    function detallePago(r) {
        var pagado1 = r.monto_pagado != null ? r.monto_pagado : 0;
        var pagado2 = r.monto_pagado_2 != null ? r.monto_pagado_2 : 0;
        var totalPagado = pagado1 + pagado2;
        var saldo = (r.precio || 0) - totalPagado;

        if (r.metodo_pago === 'Pago Presencial' && totalPagado === 0) {
            return 'Pago pendiente: ' + formatCLP(r.precio) + ' a pagar en el recinto.';
        }
        if (saldo > 0) {
            return 'Pagado: ' + formatCLP(totalPagado) + ' — saldo pendiente: ' + formatCLP(saldo) + '.';
        }
        return 'Total pagado: ' + formatCLP(totalPagado) + '.';
    }

    function crearTarjeta(r, esProxima) {
        var deporte = r.canchas ? (SPORT_LABELS[r.canchas.deporte] || r.canchas.deporte) : '';
        var cancha = r.canchas ? r.canchas.nombre : '—';
        var horaTexto = String(r.hora).padStart(2, '0') + ':00 hrs';

        var estadoTexto = r.estado === 'cancelada' ? 'Cancelada' : (esProxima ? 'Confirmada' : 'Jugada');
        var estadoClase = r.estado === 'cancelada' ? 'reserva-card-estado-cancelada' : 'reserva-card-estado-ok';

        var div = document.createElement('div');
        div.className = 'reserva-card';
        div.innerHTML =
            '<div class="reserva-card-header">' +
            '<strong>' + escapeHtml(deporte) + ' — ' + escapeHtml(cancha) + '</strong>' +
            '<span class="reserva-card-estado ' + estadoClase + '">' + estadoTexto + '</span>' +
            '</div>' +
            '<p class="reserva-card-fecha">' + escapeHtml(formatFechaLarga(r.fecha)) + ', ' + horaTexto + '</p>' +
            '<p class="reserva-card-pago">' + escapeHtml(detallePago(r)) + '</p>' +
            (r.estado === 'cancelada' && r.motivo_cancelacion
                ? '<p class="reserva-card-motivo">Motivo: ' + escapeHtml(r.motivo_cancelacion) + '</p>'
                : '') +
            (esProxima
                ? '<div class="reserva-card-acciones">' +
                    '<button type="button" class="btn btn-outline btn-sm" data-action="editar">Editar contacto</button>' +
                    '<button type="button" class="btn btn-outline btn-sm" data-action="cancelar">Cancelar reserva</button>' +
                    '</div>' +
                    '<form class="reserva-card-editar" hidden>' +
                    '<div class="form-group">' +
                    '<label>Teléfono</label>' +
                    '<input type="tel" class="input-telefono" value="' + escapeHtml(r.telefono_contacto || '') + '" required>' +
                    '</div>' +
                    '<div class="form-group">' +
                    '<label>Email</label>' +
                    '<input type="email" class="input-email" value="' + escapeHtml(r.email_contacto || '') + '" required>' +
                    '</div>' +
                    '<p class="form-error"></p>' +
                    '<div class="reserva-card-acciones">' +
                    '<button type="submit" class="btn btn-primary btn-sm">Guardar</button>' +
                    '<button type="button" class="btn btn-outline btn-sm" data-action="cancelar-edicion">Cerrar</button>' +
                    '</div>' +
                    '</form>'
                : '');

        if (!esProxima) return div;

        var btnEditar = div.querySelector('[data-action="editar"]');
        var btnCancelar = div.querySelector('[data-action="cancelar"]');
        var form = div.querySelector('.reserva-card-editar');
        var btnCerrarEdicion = div.querySelector('[data-action="cancelar-edicion"]');
        var formError = div.querySelector('.form-error');

        btnEditar.addEventListener('click', function () {
            form.hidden = !form.hidden;
        });

        btnCerrarEdicion.addEventListener('click', function () {
            form.hidden = true;
        });

        form.addEventListener('submit', function (evt) {
            evt.preventDefault();
            var telefono = form.querySelector('.input-telefono').value.trim();
            var email = form.querySelector('.input-email').value.trim();
            var submitBtn = form.querySelector('button[type="submit"]');

            formError.textContent = '';
            submitBtn.disabled = true;
            submitBtn.textContent = 'Guardando...';

            sb.auth.getSession().then(function (result) {
                var token = result.data.session ? result.data.session.access_token : null;
                return fetch('/api/mis-reservas-actualizar-contacto', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({ reservaId: r.id, telefono: telefono, email: email })
                });
            }).then(function (resp) {
                return resp.json().then(function (body) { return { ok: resp.ok, body: body }; });
            }).then(function (result) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Guardar';

                if (!result.ok) {
                    formError.textContent = result.body.error || 'No pudimos actualizar tus datos.';
                    return;
                }

                r.telefono_contacto = telefono;
                r.email_contacto = email;
                form.hidden = true;
            }).catch(function () {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Guardar';
                formError.textContent = 'No pudimos actualizar tus datos. Intenta de nuevo.';
            });
        });

        btnCancelar.addEventListener('click', function () {
            if (!window.confirm('¿Confirmas que quieres cancelar esta reserva? El horario quedará disponible para otras personas.')) return;

            btnCancelar.disabled = true;
            btnCancelar.textContent = 'Cancelando...';

            fetch('/api/cancelar-reserva', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: r.id })
            }).then(function (resp) {
                return resp.json().then(function (body) { return { ok: resp.ok, body: body }; });
            }).then(function (result) {
                if (!result.ok) {
                    btnCancelar.disabled = false;
                    btnCancelar.textContent = 'Cancelar reserva';
                    window.alert(result.body.error || 'No pudimos cancelar tu reserva.');
                    return;
                }
                r.estado = 'cancelada';
                cargarYPintar(userId);
            }).catch(function () {
                btnCancelar.disabled = false;
                btnCancelar.textContent = 'Cancelar reserva';
                window.alert('No pudimos cancelar tu reserva. Intenta de nuevo.');
            });
        });

        return div;
    }

    function pintarListas(reservas) {
        var hoyISO = toISODateHoy();

        var proximas = reservas.filter(function (r) { return r.estado === 'confirmada' && r.fecha >= hoyISO; });
        var historial = reservas.filter(function (r) { return !(r.estado === 'confirmada' && r.fecha >= hoyISO); });

        proximas.sort(function (a, b) { return a.fecha === b.fecha ? a.hora - b.hora : (a.fecha < b.fecha ? -1 : 1); });
        historial.sort(function (a, b) { return a.fecha === b.fecha ? b.hora - a.hora : (a.fecha < b.fecha ? 1 : -1); });

        el.proximas.innerHTML = '';
        el.historial.innerHTML = '';

        el.proximasVacio.hidden = proximas.length > 0;
        proximas.forEach(function (r) { el.proximas.appendChild(crearTarjeta(r, true)); });

        el.historialVacio.hidden = historial.length > 0;
        historial.forEach(function (r) { el.historial.appendChild(crearTarjeta(r, false)); });
    }

    function cargarYPintar(userId) {
        sb.from('reservas')
            .select('id,fecha,hora,precio,monto_pagado,monto_pagado_2,tipo_pago,metodo_pago,telefono_contacto,email_contacto,estado,motivo_cancelacion,canchas(nombre,deporte)')
            .eq('user_id', userId)
            .then(function (result) {
                if (result.error) {
                    mostrarError('No pudimos cargar tus reservas. Intenta de nuevo más tarde.');
                    return;
                }

                el.cargando.hidden = true;
                el.contenido.hidden = false;
                pintarListas(result.data || []);
            })
            .catch(function () {
                mostrarError('No pudimos cargar tus reservas. Intenta de nuevo más tarde.');
            });
    }

    window.FutbolitoAuth.requireLogin().then(function (sesion) {
        if (!sesion) return; // requireLogin ya redirigió a login.html

        userId = sesion.session.user.id;

        if (sesion.nombre) {
            el.saludo.textContent = 'Hola ' + sesion.nombre + ', revisa tus reservas y gestiona tus datos';
        }

        cargarYPintar(userId);
    });
})();
