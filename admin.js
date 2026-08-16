(function () {
    'use strict';

    var sb = window.sbClient;

    var SPORT_LABELS = { futbolito: 'Futbolito', padel: 'Pádel' };

    function formatCLP(n) {
        return '$' + Number(n || 0).toLocaleString('es-CL');
    }

    function formatFechaCorta(iso) {
        var parts = iso.split('-');
        return parts[2] + '-' + parts[1] + '-' + parts[0];
    }

    function startOfMonth(d) {
        return new Date(d.getFullYear(), d.getMonth(), 1);
    }

    function toISODate(d) {
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }

    /* ======================================================================
       ESTADO
       ====================================================================== */
    var state = {
        reservas: [],
        canchas: [],
        tarifas: [],
        filtroFecha: '',
        mostrarCanceladas: false,
        viewMonth: startOfMonth(new Date())
    };

    var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

    function getPrecioPorHora(sport, horaInicio) {
        var tabla = state.tarifas.filter(function (t) { return t.deporte === sport; });
        for (var i = 0; i < tabla.length; i++) {
            if (horaInicio >= tabla[i].hora_desde && horaInicio < tabla[i].hora_hasta) {
                return tabla[i].precio;
            }
        }
        return tabla.length ? tabla[0].precio : 0;
    }

    /* ======================================================================
       REFERENCIAS AL DOM
       ====================================================================== */
    var el = {
        gate: document.getElementById('adminGate'),
        page: document.getElementById('adminPage'),
        tabs: document.querySelectorAll('.admin-tab'),
        views: document.querySelectorAll('.admin-view'),
        calendarMonthLabel: document.getElementById('adminCalendarMonthLabel'),
        calendarGrid: document.getElementById('adminCalendarGrid'),
        prevMonth: document.getElementById('adminPrevMonth'),
        nextMonth: document.getElementById('adminNextMonth'),
        filtroFecha: document.getElementById('filtroFecha'),
        filtroCanceladas: document.getElementById('filtroCanceladas'),
        btnLimpiarFiltro: document.getElementById('btnLimpiarFiltro'),
        tbody: document.getElementById('reservasTableBody'),
        emptyMsg: document.getElementById('adminEmptyMsg'),
        btnNuevaReserva: document.getElementById('btnNuevaReserva'),
        modalOverlay: document.getElementById('modalOverlay'),
        btnCerrarModal: document.getElementById('btnCerrarModal'),
        form: document.getElementById('adminReservaForm'),
        admDeporte: document.getElementById('admDeporte'),
        admCancha: document.getElementById('admCancha'),
        admFecha: document.getElementById('admFecha'),
        admHora: document.getElementById('admHora'),
        admNombre: document.getElementById('admNombre'),
        admDocumento: document.getElementById('admDocumento'),
        admTelefono: document.getElementById('admTelefono'),
        admEmail: document.getElementById('admEmail'),
        admMetodoPago: document.getElementById('admMetodoPago'),
        admReservaError: document.getElementById('admReservaError')
    };

    /* ======================================================================
       CARGA DE DATOS
       ====================================================================== */
    function cargarCatalogo() {
        return Promise.all([
            sb.from('canchas').select('id,nombre,deporte,descripcion'),
            sb.from('tarifas').select('deporte,hora_desde,hora_hasta,precio')
        ]).then(function (resultados) {
            state.canchas = resultados[0].data || [];
            state.tarifas = resultados[1].data || [];
        });
    }

    function cargarReservas() {
        return sb.from('reservas')
            .select('id,fecha,hora,precio,nombre_contacto,documento_contacto,telefono_contacto,email_contacto,metodo_pago,estado,canchas(nombre,deporte)')
            .order('fecha', { ascending: true })
            .order('hora', { ascending: true })
            .then(function (result) {
                state.reservas = result.data || [];
                renderCalendarioAdmin();
                renderListado();
            });
    }

    /* ======================================================================
       TABS
       ====================================================================== */
    el.tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            activarTab(tab.getAttribute('data-tab'));
        });
    });

    function activarTab(nombre) {
        el.tabs.forEach(function (t) {
            t.classList.toggle('active', t.getAttribute('data-tab') === nombre);
        });
        el.views.forEach(function (v) {
            v.classList.toggle('active', v.id === 'view-' + nombre);
        });
    }

    /* ======================================================================
       CALENDARIO
       ====================================================================== */
    function renderCalendarioAdmin() {
        var year = state.viewMonth.getFullYear();
        var month = state.viewMonth.getMonth();

        el.calendarMonthLabel.textContent = MESES[month] + ' ' + year;
        el.calendarGrid.innerHTML = '';

        var firstDay = new Date(year, month, 1);
        var startOffset = (firstDay.getDay() + 6) % 7;
        var daysInMonth = new Date(year, month + 1, 0).getDate();
        var todayISO = toISODate(new Date());

        var conteoPorDia = {};
        state.reservas.forEach(function (r) {
            if (r.estado !== 'confirmada') return;
            conteoPorDia[r.fecha] = (conteoPorDia[r.fecha] || 0) + 1;
        });

        for (var i = 0; i < startOffset; i++) {
            var empty = document.createElement('span');
            empty.className = 'calendar-day empty';
            el.calendarGrid.appendChild(empty);
        }

        for (var day = 1; day <= daysInMonth; day++) {
            var date = new Date(year, month, day);
            var iso = toISODate(date);
            var count = conteoPorDia[iso] || 0;

            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'calendar-day';
            btn.textContent = String(day);

            if (iso === todayISO) btn.classList.add('today');
            if (count > 0) {
                btn.classList.add('has-reservas');
                var badge = document.createElement('span');
                badge.className = 'badge-count';
                badge.textContent = String(count);
                btn.appendChild(badge);
            }

            btn.addEventListener('click', function (evtIso) {
                return function () {
                    state.filtroFecha = evtIso;
                    el.filtroFecha.value = evtIso;
                    renderListado();
                    activarTab('listado');
                };
            }(iso));

            el.calendarGrid.appendChild(btn);
        }
    }

    el.prevMonth.addEventListener('click', function () {
        var d = new Date(state.viewMonth);
        d.setMonth(d.getMonth() - 1);
        state.viewMonth = d;
        renderCalendarioAdmin();
    });

    el.nextMonth.addEventListener('click', function () {
        var d = new Date(state.viewMonth);
        d.setMonth(d.getMonth() + 1);
        state.viewMonth = d;
        renderCalendarioAdmin();
    });

    /* ======================================================================
       LISTADO
       ====================================================================== */
    el.filtroFecha.addEventListener('change', function () {
        state.filtroFecha = el.filtroFecha.value;
        renderListado();
    });

    el.filtroCanceladas.addEventListener('change', function () {
        state.mostrarCanceladas = el.filtroCanceladas.checked;
        renderListado();
    });

    el.btnLimpiarFiltro.addEventListener('click', function () {
        state.filtroFecha = '';
        el.filtroFecha.value = '';
        renderListado();
    });

    function renderListado() {
        var lista = state.reservas.filter(function (r) {
            if (state.filtroFecha && r.fecha !== state.filtroFecha) return false;
            if (!state.mostrarCanceladas && r.estado === 'cancelada') return false;
            return true;
        });

        el.tbody.innerHTML = '';
        el.emptyMsg.hidden = lista.length > 0;

        lista.forEach(function (r) {
            var tr = document.createElement('tr');

            var canchaNombre = r.canchas ? r.canchas.nombre : r.cancha_id;
            var deporte = r.canchas ? SPORT_LABELS[r.canchas.deporte] : '';

            var estadoBadge = '<span class="estado-badge ' + r.estado + '">' +
                (r.estado === 'confirmada' ? 'Confirmada' : 'Cancelada') + '</span>';

            var accion = r.estado === 'confirmada'
                ? '<button type="button" class="btn-cancelar" data-id="' + r.id + '">Cancelar</button>'
                : '';

            tr.innerHTML =
                '<td>' + formatFechaCorta(r.fecha) + '</td>' +
                '<td>' + String(r.hora).padStart(2, '0') + ':00</td>' +
                '<td>' + canchaNombre + ' <small>(' + deporte + ')</small></td>' +
                '<td>' + (r.nombre_contacto || '') + '</td>' +
                '<td>' + (r.documento_contacto || '—') + '</td>' +
                '<td>' + (r.telefono_contacto || '—') + '</td>' +
                '<td>' + formatCLP(r.precio) + '</td>' +
                '<td>' + (r.metodo_pago || '—') + '</td>' +
                '<td>' + estadoBadge + '</td>' +
                '<td>' + accion + '</td>';

            el.tbody.appendChild(tr);
        });

        el.tbody.querySelectorAll('.btn-cancelar').forEach(function (btn) {
            btn.addEventListener('click', function () {
                cancelarReserva(btn.getAttribute('data-id'));
            });
        });
    }

    function cancelarReserva(id) {
        if (!window.confirm('¿Anular esta reserva? El horario quedará disponible nuevamente.')) return;

        sb.from('reservas').update({ estado: 'cancelada' }).eq('id', id).then(function (result) {
            if (result.error) {
                window.alert('No pudimos anular la reserva: ' + result.error.message);
                return;
            }
            cargarReservas();
        });
    }

    /* ======================================================================
       MODAL: NUEVA RESERVA
       ====================================================================== */
    function abrirModal() {
        el.form.reset();
        el.admReservaError.hidden = true;
        el.admCancha.innerHTML = '<option value="">Primero elige un deporte</option>';
        el.admCancha.disabled = true;
        el.admHora.innerHTML = '<option value="">Elige cancha y fecha primero</option>';
        el.admHora.disabled = true;
        el.admFecha.min = toISODate(new Date());
        el.modalOverlay.hidden = false;
    }

    function cerrarModal() {
        el.modalOverlay.hidden = true;
    }

    el.btnNuevaReserva.addEventListener('click', abrirModal);
    el.btnCerrarModal.addEventListener('click', cerrarModal);
    el.modalOverlay.addEventListener('click', function (e) {
        if (e.target === el.modalOverlay) cerrarModal();
    });

    el.admDeporte.addEventListener('change', function () {
        var deporte = el.admDeporte.value;
        el.admCancha.innerHTML = '';
        el.admHora.innerHTML = '<option value="">Elige cancha y fecha primero</option>';
        el.admHora.disabled = true;

        if (!deporte) {
            el.admCancha.innerHTML = '<option value="">Primero elige un deporte</option>';
            el.admCancha.disabled = true;
            return;
        }

        var opciones = '<option value="">Selecciona una cancha</option>';
        state.canchas.filter(function (c) { return c.deporte === deporte; }).forEach(function (c) {
            opciones += '<option value="' + c.id + '">' + c.nombre + '</option>';
        });
        el.admCancha.innerHTML = opciones;
        el.admCancha.disabled = false;
    });

    function actualizarHorasDisponibles() {
        var canchaId = el.admCancha.value;
        var fecha = el.admFecha.value;

        el.admHora.innerHTML = '<option value="">Cargando...</option>';
        el.admHora.disabled = true;

        if (!canchaId || !fecha) {
            el.admHora.innerHTML = '<option value="">Elige cancha y fecha primero</option>';
            return;
        }

        sb.from('disponibilidad')
            .select('hora')
            .eq('cancha_id', canchaId)
            .eq('fecha', fecha)
            .then(function (result) {
                var ocupadas = (result.data || []).map(function (r) { return r.hora; });
                var opciones = '<option value="">Selecciona un horario</option>';
                for (var hora = 12; hora < 23; hora++) {
                    if (ocupadas.indexOf(hora) !== -1) continue;
                    opciones += '<option value="' + hora + '">' + String(hora).padStart(2, '0') + ':00</option>';
                }
                el.admHora.innerHTML = opciones;
                el.admHora.disabled = false;
            });
    }

    el.admCancha.addEventListener('change', actualizarHorasDisponibles);
    el.admFecha.addEventListener('change', actualizarHorasDisponibles);

    el.form.addEventListener('submit', function (e) {
        e.preventDefault();

        var deporte = el.admDeporte.value;
        var canchaId = el.admCancha.value;
        var fecha = el.admFecha.value;
        var hora = el.admHora.value;
        var nombre = el.admNombre.value.trim();

        el.admReservaError.hidden = true;

        if (!deporte || !canchaId || !fecha || !hora || !nombre) {
            el.admReservaError.textContent = 'Completa deporte, cancha, fecha, horario y nombre de contacto.';
            el.admReservaError.className = 'auth-alert';
            el.admReservaError.hidden = false;
            return;
        }

        var reserva = {
            cancha_id: canchaId,
            fecha: fecha,
            hora: parseInt(hora, 10),
            precio: getPrecioPorHora(deporte, parseInt(hora, 10)),
            nombre_contacto: nombre,
            documento_contacto: el.admDocumento.value.trim() || null,
            telefono_contacto: el.admTelefono.value.trim() || null,
            email_contacto: el.admEmail.value.trim() || null,
            metodo_pago: el.admMetodoPago.value
        };

        sb.from('reservas').insert([reserva]).then(function (result) {
            if (result.error) {
                if (result.error.code === '23505') {
                    el.admReservaError.textContent = 'Ese horario ya está ocupado. Elige otro.';
                } else {
                    el.admReservaError.textContent = 'No pudimos crear la reserva: ' + result.error.message;
                }
                el.admReservaError.className = 'auth-alert';
                el.admReservaError.hidden = false;
                return;
            }

            cerrarModal();
            cargarReservas();
        });
    });

    /* ======================================================================
       INICIALIZACIÓN (con control de acceso)
       ====================================================================== */
    window.FutbolitoAuth.requireAdmin().then(function (info) {
        if (!info) return; // requireAdmin ya redirigió

        el.gate.hidden = true;
        el.page.hidden = false;

        Promise.all([cargarCatalogo(), cargarReservas()]);
    });
})();
