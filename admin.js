(function () {
    'use strict';

    var sb = window.sbClient;

    var SPORT_LABELS = { futbolito: 'Futbolito', padel: 'Pádel' };

    function formatCLP(n) {
        return '$' + Number(n || 0).toLocaleString('es-CL');
    }

    function generarId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function enviarCorreosReserva(reservaId) {
        fetch('/api/reserva-confirmacion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reservaId: reservaId })
        }).catch(function () {});
    }

    // Detecta que falta una columna nueva (falta correr un parche SQL en
    // Supabase). PostgREST no siempre devuelve el código Postgres crudo
    // "42703": cuando la columna ni siquiera está en su caché de esquema,
    // responde con su propio código "PGRST204" y el mensaje
    // "Could not find the '...' column ... in the schema cache".
    function esErrorColumnaFaltante(error) {
        return !!error && (
            error.code === '42703' ||
            error.code === 'PGRST204' ||
            (error.message && error.message.indexOf('schema cache') !== -1)
        );
    }

    function formatFechaCorta(iso) {
        var parts = iso.split('-');
        return parts[2] + '-' + parts[1] + '-' + parts[0];
    }

    // Convierte un teléfono de contacto (con o sin +56, espacios, guiones)
    // al formato que necesita un link wa.me. Un celular chileno normal son
    // 9 dígitos (9XXXXXXXX); si viene así, se le antepone el código de país.
    function telefonoParaWhatsapp(telefono) {
        var digitos = (telefono || '').replace(/\D/g, '');
        if (!digitos) return null;
        if (digitos.length === 9) return '56' + digitos;
        return digitos;
    }

    function startOfMonth(d) {
        return new Date(d.getFullYear(), d.getMonth(), 1);
    }

    function startOfWeek(d) {
        var offset = (d.getDay() + 6) % 7; // 0 = lunes
        return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
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
        usuarios: [],
        filtroFecha: '',
        mostrarCanceladas: false,
        viewMonth: startOfMonth(new Date()),
        esSuperadmin: false,
        accessToken: null,
        currentUserId: null,
        planId: null
    };

    var ROL_LABELS = {
        jugador: 'Jugador',
        administrador: 'Administrador',
        superadministrador: 'Super Administrador'
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

        pagosTbody: document.getElementById('pagosTableBody'),
        pagosEmptyMsg: document.getElementById('pagosEmptyMsg'),
        pagosResumen: document.getElementById('pagosResumen'),
        pagosPeriodo: document.getElementById('pagosPeriodo'),
        pagosFechaEspecificaWrap: document.getElementById('pagosFechaEspecificaWrap'),
        pagosFechaEspecifica: document.getElementById('pagosFechaEspecifica'),
        pagosFiltroNombre: document.getElementById('pagosFiltroNombre'),
        pagosFiltroHora: document.getElementById('pagosFiltroHora'),
        pagosFiltroDeporte: document.getElementById('pagosFiltroDeporte'),
        pagosFiltroCancha: document.getElementById('pagosFiltroCancha'),
        pagosFiltroTipoPago: document.getElementById('pagosFiltroTipoPago'),
        btnLimpiarFiltrosPagos: document.getElementById('btnLimpiarFiltrosPagos'),

        cuadraturaFecha: document.getElementById('cuadraturaFecha'),
        cuadraturaTbody: document.getElementById('cuadraturaTableBody'),
        cuadraturaEmptyMsg: document.getElementById('cuadraturaEmptyMsg'),
        cuadraturaResumenPago: document.getElementById('cuadraturaResumenPago'),
        cuadraturaOcupacionBody: document.getElementById('cuadraturaOcupacionBody'),

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
        admMontoPagado: document.getElementById('admMontoPagado'),
        admMetodoPago2: document.getElementById('admMetodoPago2'),
        admMontoPagado2: document.getElementById('admMontoPagado2'),
        admPagoPresencialNota: document.getElementById('admPagoPresencialNota'),
        admReservaError: document.getElementById('admReservaError'),

        reservaCreadaModalOverlay: document.getElementById('reservaCreadaModalOverlay'),
        btnCerrarReservaCreadaModal: document.getElementById('btnCerrarReservaCreadaModal'),
        btnCerrarReservaCreada: document.getElementById('btnCerrarReservaCreada'),
        btnEnviarComprobanteWhatsapp: document.getElementById('btnEnviarComprobanteWhatsapp'),
        reservaCreadaSinTelefono: document.getElementById('reservaCreadaSinTelefono'),

        tabUsuarios: document.getElementById('tabUsuarios'),
        btnNuevoUsuario: document.getElementById('btnNuevoUsuario'),
        usuariosTbody: document.getElementById('usuariosTableBody'),
        usuariosEmptyMsg: document.getElementById('usuariosEmptyMsg'),
        buscarUsuario: document.getElementById('buscarUsuario'),
        btnLimpiarBusquedaUsuario: document.getElementById('btnLimpiarBusquedaUsuario'),

        userModalOverlay: document.getElementById('userModalOverlay'),
        btnCerrarUserModal: document.getElementById('btnCerrarUserModal'),
        nuevoUsuarioForm: document.getElementById('nuevoUsuarioForm'),
        usrNombre: document.getElementById('usrNombre'),
        usrEmail: document.getElementById('usrEmail'),
        usrPassword: document.getElementById('usrPassword'),
        usrTelefono: document.getElementById('usrTelefono'),
        usrRol: document.getElementById('usrRol'),
        usrRolGrupo: document.getElementById('usrRolGrupo'),
        usrRolNota: document.getElementById('usrRolNota'),
        usrError: document.getElementById('usrError'),

        editUsuarioModalOverlay: document.getElementById('editUsuarioModalOverlay'),
        btnCerrarEditUsuarioModal: document.getElementById('btnCerrarEditUsuarioModal'),
        editUsuarioForm: document.getElementById('editUsuarioForm'),
        editUsrNombre: document.getElementById('editUsrNombre'),
        editLabelDocumento: document.getElementById('editLabelDocumento'),
        editUsrDocumento: document.getElementById('editUsrDocumento'),
        editUsrTelefono: document.getElementById('editUsrTelefono'),
        editUsrError: document.getElementById('editUsrError'),

        passwordModalOverlay: document.getElementById('passwordModalOverlay'),
        btnCerrarPasswordModal: document.getElementById('btnCerrarPasswordModal'),
        passwordForm: document.getElementById('passwordForm'),
        passwordFormUsuario: document.getElementById('passwordFormUsuario'),
        nuevaPassword: document.getElementById('nuevaPassword'),
        passwordError: document.getElementById('passwordError'),

        saldoModalOverlay: document.getElementById('saldoModalOverlay'),
        btnCerrarSaldoModal: document.getElementById('btnCerrarSaldoModal'),
        saldoForm: document.getElementById('saldoForm'),
        saldoFormReserva: document.getElementById('saldoFormReserva'),
        saldoMetodoPago: document.getElementById('saldoMetodoPago'),
        saldoError: document.getElementById('saldoError'),

        motivoModalOverlay: document.getElementById('motivoModalOverlay'),
        btnCerrarMotivoModal: document.getElementById('btnCerrarMotivoModal'),
        motivoForm: document.getElementById('motivoForm'),
        motivoFormReserva: document.getElementById('motivoFormReserva'),
        motivoTexto: document.getElementById('motivoTexto'),
        motivoError: document.getElementById('motivoError'),

        tabCancelaciones: document.getElementById('tabCancelaciones'),
        cancelacionesFiltroFecha: document.getElementById('cancelacionesFiltroFecha'),
        cancelacionesTbody: document.getElementById('cancelacionesTableBody'),
        cancelacionesEmptyMsg: document.getElementById('cancelacionesEmptyMsg'),

        tabContenido: document.getElementById('tabContenido'),
        tabTarifas: document.getElementById('tabTarifas'),

        cNosotrosImgPreview: document.getElementById('cNosotrosImgPreview'),
        cNosotrosImgInput: document.getElementById('cNosotrosImgInput'),
        guardadoNosotrosImg: document.getElementById('guardadoNosotrosImg'),
        formNosotros: document.getElementById('formNosotros'),
        cNosotrosTagline: document.getElementById('cNosotrosTagline'),
        cNosotrosParrafo1: document.getElementById('cNosotrosParrafo1'),
        cNosotrosParrafo2: document.getElementById('cNosotrosParrafo2'),
        cFeature1Titulo: document.getElementById('cFeature1Titulo'),
        cFeature1Texto: document.getElementById('cFeature1Texto'),
        cFeature2Titulo: document.getElementById('cFeature2Titulo'),
        cFeature2Texto: document.getElementById('cFeature2Texto'),
        cFeature3Titulo: document.getElementById('cFeature3Titulo'),
        cFeature3Texto: document.getElementById('cFeature3Texto'),
        cCtaTitulo: document.getElementById('cCtaTitulo'),
        cCtaTexto: document.getElementById('cCtaTexto'),
        guardadoNosotros: document.getElementById('guardadoNosotros'),

        contenidoCardsGrid: document.getElementById('contenidoCardsGrid'),

        tarifasGrid: document.getElementById('tarifasGrid'),
        btnGuardarTarifas: document.getElementById('btnGuardarTarifas'),
        guardadoTarifas: document.getElementById('guardadoTarifas'),

        formPlanMensual: document.getElementById('formPlanMensual'),
        cPlanNombre: document.getElementById('cPlanNombre'),
        cPlanHoras: document.getElementById('cPlanHoras'),
        cPlanPrecio: document.getElementById('cPlanPrecio'),
        guardadoPlan: document.getElementById('guardadoPlan'),

        equipamientoGrid: document.getElementById('equipamientoGrid'),
        btnGuardarEquipamiento: document.getElementById('btnGuardarEquipamiento'),
        guardadoEquipamiento: document.getElementById('guardadoEquipamiento'),

        metodosPagoGrid: document.getElementById('metodosPagoGrid'),
        btnGuardarMetodosPago: document.getElementById('btnGuardarMetodosPago'),
        guardadoMetodosPago: document.getElementById('guardadoMetodosPago')
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

    // Columnas de "reservas" que vinieron con parches SQL posteriores al
    // esquema original: si a alguna todavía le falta su migración, se quita
    // SOLO ESA (no todas) del select y se reintenta, para que una columna
    // pendiente no oculte datos de otras que sí están al día.
    var COLUMNAS_RESERVAS_OPCIONALES = ['origen', 'metodo_pago_2', 'monto_pagado_2', 'pago2_fecha', 'observacion', 'motivo_cancelacion', 'cancelado_por', 'cancelado_en'];
    var COLUMNAS_RESERVAS_BASE = ['id', 'fecha', 'hora', 'precio', 'nombre_contacto', 'documento_contacto', 'telefono_contacto', 'email_contacto', 'metodo_pago', 'monto_pagado', 'tipo_pago', 'estado', 'created_at'];

    // PostgREST nombra la columna exacta que falta en su mensaje de error
    // ("column reservas.X does not exist" o "Could not find the 'X' column").
    function extraerColumnaFaltante(error) {
        if (!error || !error.message) return null;
        var match = error.message.match(/column\s+(?:\w+\.)?([a-z0-9_]+)\s+does not exist/i) ||
            error.message.match(/Could not find the '([a-z0-9_]+)' column/i);
        return match ? match[1] : null;
    }

    function consultarReservasConColumnas(columnas) {
        var select = columnas.join(',') + ',canchas(nombre,deporte)';
        return sb.from('reservas').select(select)
            .order('fecha', { ascending: true })
            .order('hora', { ascending: true })
            .then(function (result) {
                if (!result.error) return result;

                var faltante = extraerColumnaFaltante(result.error);
                if (faltante && columnas.indexOf(faltante) !== -1) {
                    return consultarReservasConColumnas(columnas.filter(function (c) { return c !== faltante; }));
                }
                // No se pudo identificar cuál columna exacta falta: cae
                // directo al set base en vez de quedar sin datos.
                if (esErrorColumnaFaltante(result.error) && columnas.length > COLUMNAS_RESERVAS_BASE.length) {
                    return consultarReservasConColumnas(COLUMNAS_RESERVAS_BASE);
                }
                return result;
            });
    }

    function cargarReservas() {
        return consultarReservasConColumnas(COLUMNAS_RESERVAS_BASE.concat(COLUMNAS_RESERVAS_OPCIONALES)).then(function (result) {
            state.reservas = result.data || [];
            renderCalendarioAdmin();
            renderListado();
            renderPagos();
            renderCuadratura();
            renderCancelaciones();
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
        el.btnNuevaReserva.hidden = nombre !== 'calendario' && nombre !== 'listado';
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

            var origenBadge = '<span class="origen-badge ' + (r.origen || 'web') + '">' +
                (r.origen === 'admin' ? 'Administrador' : 'Web') + '</span>';

            var saldo = (r.precio || 0) - (r.monto_pagado != null ? r.monto_pagado : 0) - (r.monto_pagado_2 != null ? r.monto_pagado_2 : 0);
            var estadoPagoBadge = saldo > 0
                ? '<span class="estado-pago-badge abonado">Abonado</span>'
                : '<span class="estado-pago-badge al-dia">Al día</span>';

            var accion = r.estado === 'confirmada'
                ? '<button type="button" class="btn-cancelar" data-id="' + r.id + '">Cancelar</button>'
                : '';

            tr.innerHTML =
                '<td data-label="Fecha">' + formatFechaCorta(r.fecha) + '</td>' +
                '<td data-label="Hora">' + String(r.hora).padStart(2, '0') + ':00</td>' +
                '<td data-label="Cancha">' + canchaNombre + ' <small>(' + deporte + ')</small></td>' +
                '<td data-label="Contacto">' + (r.nombre_contacto || '') + '</td>' +
                '<td data-label="Teléfono">' + (r.telefono_contacto || '—') + '</td>' +
                '<td data-label="Precio">' + formatCLP(r.precio) + '</td>' +
                '<td data-label="Pago">' + (r.metodo_pago || '—') + '</td>' +
                '<td data-label="Estado de Pago">' + estadoPagoBadge + '</td>' +
                '<td data-label="Origen">' + origenBadge + '</td>' +
                '<td data-label="Estado">' + estadoBadge + '</td>' +
                '<td data-label="Acción" class="celda-accion">' + accion + '</td>';

            el.tbody.appendChild(tr);
        });

        el.tbody.querySelectorAll('.btn-cancelar').forEach(function (btn) {
            btn.addEventListener('click', function () {
                cancelarReserva(btn.getAttribute('data-id'));
            });
        });
    }

    function cancelarReserva(id) {
        abrirModalMotivo(id);
    }

    function abrirModalMotivo(id) {
        var reserva = state.reservas.find(function (r) { return r.id === id; });

        el.motivoForm.reset();
        el.motivoError.hidden = true;
        el.motivoForm.setAttribute('data-reserva-id', id);

        if (reserva) {
            var canchaNombre = reserva.canchas ? reserva.canchas.nombre : reserva.cancha_id;
            el.motivoFormReserva.textContent = 'Reserva de ' + (reserva.nombre_contacto || '—') + ' — ' + canchaNombre +
                ', ' + formatFechaCorta(reserva.fecha) + ' ' + String(reserva.hora).padStart(2, '0') + ':00. El horario quedará disponible nuevamente.';
        } else {
            el.motivoFormReserva.textContent = 'El horario quedará disponible nuevamente.';
        }

        el.motivoModalOverlay.hidden = false;
    }

    function cerrarModalMotivo() {
        el.motivoModalOverlay.hidden = true;
    }

    el.btnCerrarMotivoModal.addEventListener('click', cerrarModalMotivo);
    el.motivoModalOverlay.addEventListener('click', function (e) {
        if (e.target === el.motivoModalOverlay) cerrarModalMotivo();
    });

    el.motivoForm.addEventListener('submit', function (e) {
        e.preventDefault();

        var reservaId = el.motivoForm.getAttribute('data-reserva-id');
        var motivo = el.motivoTexto.value.trim();

        if (!motivo) {
            el.motivoError.textContent = 'Debes indicar un motivo para anular la reserva.';
            el.motivoError.className = 'auth-alert';
            el.motivoError.hidden = false;
            return;
        }

        sb.from('reservas').update({
            estado: 'cancelada',
            motivo_cancelacion: motivo,
            cancelado_por: state.currentUserId,
            cancelado_en: new Date().toISOString()
        }).eq('id', reservaId).select().then(function (result) {
            if (result.error) {
                el.motivoError.textContent = esErrorColumnaFaltante(result.error)
                    ? 'Falta aplicar el parche supabase/add_motivo_cancelacion.sql en el SQL Editor de Supabase antes de poder anular con motivo.'
                    : 'No pudimos anular la reserva: ' + result.error.message;
                el.motivoError.className = 'auth-alert';
                el.motivoError.hidden = false;
                return;
            }
            if (!result.data || !result.data.length) {
                el.motivoError.textContent = 'No se pudo anular (no se modificó ninguna fila). Puede ser un problema de permisos.';
                el.motivoError.className = 'auth-alert';
                el.motivoError.hidden = false;
                return;
            }
            cerrarModalMotivo();
            cargarReservas();
        });
    });

    if (el.cancelacionesFiltroFecha) {
        el.cancelacionesFiltroFecha.addEventListener('change', renderCancelaciones);
    }

    function renderCancelaciones() {
        if (!el.cancelacionesTbody) return;

        var filtro = el.cancelacionesFiltroFecha ? el.cancelacionesFiltroFecha.value : 'todos';
        var hoy = new Date();
        var hoyISO = toISODate(hoy);
        var rangoDesde = null;
        var rangoHasta = null;
        var soloFuturas = false;

        if (filtro === 'hoy') {
            rangoDesde = rangoHasta = hoyISO;
        } else if (filtro === 'ayer') {
            rangoDesde = rangoHasta = toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1));
        } else if (filtro === 'semana') {
            rangoDesde = toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 7));
            rangoHasta = hoyISO;
        } else if (filtro === 'mes') {
            rangoDesde = toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 30));
            rangoHasta = hoyISO;
        } else if (filtro === 'futuras') {
            soloFuturas = true;
        }

        var canceladas = state.reservas.filter(function (r) {
            if (r.estado !== 'cancelada') return false;
            if (soloFuturas) return r.fecha > hoyISO;
            if (rangoDesde && (r.fecha < rangoDesde || r.fecha > rangoHasta)) return false;
            return true;
        });

        canceladas.sort(function (a, b) {
            return new Date(b.cancelado_en || b.created_at) - new Date(a.cancelado_en || a.created_at);
        });

        el.cancelacionesTbody.innerHTML = '';
        el.cancelacionesEmptyMsg.hidden = canceladas.length > 0;

        canceladas.forEach(function (r) {
            var canchaNombre = r.canchas ? r.canchas.nombre : r.cancha_id;

            var canceladoPor = '—';
            if (r.cancelado_por) {
                var usuario = state.usuarios.find(function (u) { return u.id === r.cancelado_por; });
                canceladoPor = usuario ? usuario.nombre : '—';
            }

            var fechaCancelacion = r.cancelado_en ? formatFechaCorta(toISODate(new Date(r.cancelado_en))) : '—';

            var tr = document.createElement('tr');
            tr.innerHTML =
                '<td>' + formatFechaCorta(r.fecha) + '</td>' +
                '<td>' + String(r.hora).padStart(2, '0') + ':00</td>' +
                '<td>' + canchaNombre + '</td>' +
                '<td>' + (r.nombre_contacto || '') + '</td>' +
                '<td>' + (r.motivo_cancelacion || '—') + '</td>' +
                '<td>' + canceladoPor + '</td>' +
                '<td>' + fechaCancelacion + '</td>';
            el.cancelacionesTbody.appendChild(tr);
        });
    }

    /* ======================================================================
       PAGOS
       ====================================================================== */
    for (var h = 0; h < 24; h++) {
        var horaOption = document.createElement('option');
        horaOption.value = String(h);
        horaOption.textContent = String(h).padStart(2, '0') + ':00';
        el.pagosFiltroHora.appendChild(horaOption);
    }

    function poblarFiltroCanchaPagos() {
        el.pagosFiltroCancha.innerHTML = '<option value="">Todas</option>';
        state.canchas.forEach(function (c) {
            var option = document.createElement('option');
            option.value = c.id;
            option.textContent = c.nombre + ' (' + (SPORT_LABELS[c.deporte] || c.deporte) + ')';
            el.pagosFiltroCancha.appendChild(option);
        });
    }

    el.pagosPeriodo.addEventListener('change', function () {
        var esEspecifica = el.pagosPeriodo.value === 'especifica';
        el.pagosFechaEspecificaWrap.hidden = !esEspecifica;

        if (esEspecifica) {
            try { el.pagosFechaEspecifica.showPicker(); } catch (err) { el.pagosFechaEspecifica.focus(); }
        }

        renderPagos();
    });
    el.pagosFechaEspecifica.addEventListener('change', renderPagos);
    el.pagosFiltroNombre.addEventListener('input', renderPagos);
    el.pagosFiltroHora.addEventListener('change', renderPagos);
    el.pagosFiltroDeporte.addEventListener('change', renderPagos);
    el.pagosFiltroCancha.addEventListener('change', renderPagos);
    el.pagosFiltroTipoPago.addEventListener('change', renderPagos);

    el.btnLimpiarFiltrosPagos.addEventListener('click', function () {
        el.pagosPeriodo.value = 'todos';
        el.pagosFechaEspecificaWrap.hidden = true;
        el.pagosFechaEspecifica.value = '';
        el.pagosFiltroNombre.value = '';
        el.pagosFiltroHora.value = '';
        el.pagosFiltroDeporte.value = '';
        el.pagosFiltroCancha.value = '';
        el.pagosFiltroTipoPago.value = '';
        renderPagos();
    });

    function renderPagos() {
        var periodo = el.pagosPeriodo.value;
        var nombreFiltro = el.pagosFiltroNombre.value.trim().toLowerCase();
        var horaFiltro = el.pagosFiltroHora.value;
        var deporteFiltro = el.pagosFiltroDeporte.value;
        var canchaFiltro = el.pagosFiltroCancha.value;
        var tipoPagoFiltro = el.pagosFiltroTipoPago.value;

        var hoy = new Date();
        var rangoDesde = null;
        var rangoHasta = null;

        if (periodo === 'hoy') {
            rangoDesde = rangoHasta = toISODate(hoy);
        } else if (periodo === 'ayer') {
            var ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);
            rangoDesde = rangoHasta = toISODate(ayer);
        } else if (periodo === 'semana') {
            rangoDesde = toISODate(startOfWeek(hoy));
            rangoHasta = toISODate(hoy);
        } else if (periodo === 'mes') {
            rangoDesde = toISODate(startOfMonth(hoy));
            rangoHasta = toISODate(hoy);
        } else if (periodo === 'especifica' && el.pagosFechaEspecifica.value) {
            rangoDesde = rangoHasta = el.pagosFechaEspecifica.value;
        }

        var lista = state.reservas.filter(function (r) {
            if (r.estado !== 'confirmada') return false;
            var fechaPago = toISODate(new Date(r.created_at));
            if (rangoDesde && (fechaPago < rangoDesde || fechaPago > rangoHasta)) return false;
            if (nombreFiltro && (r.nombre_contacto || '').toLowerCase().indexOf(nombreFiltro) === -1) return false;
            if (horaFiltro && String(r.hora) !== horaFiltro) return false;
            if (deporteFiltro && (!r.canchas || r.canchas.deporte !== deporteFiltro)) return false;
            if (canchaFiltro && r.cancha_id !== canchaFiltro) return false;
            if (tipoPagoFiltro && r.tipo_pago !== tipoPagoFiltro) return false;
            return true;
        });

        lista.sort(function (a, b) {
            return new Date(b.created_at) - new Date(a.created_at);
        });

        el.pagosTbody.innerHTML = '';
        el.pagosEmptyMsg.hidden = lista.length > 0;

        var totalMonto = 0;
        lista.forEach(function (r) {
            var montoPagado1 = r.monto_pagado != null ? r.monto_pagado : 0;
            var montoPagado2 = r.monto_pagado_2 != null ? r.monto_pagado_2 : 0;
            var montoTotalPagado = montoPagado1 + montoPagado2;
            totalMonto += montoTotalPagado;

            var canchaNombre = r.canchas ? r.canchas.nombre : r.cancha_id;
            var deporte = r.canchas ? SPORT_LABELS[r.canchas.deporte] : '';
            var tipoPagoLabel = r.tipo_pago === 'abono' ? 'Abono' : 'Pago total';
            var saldo = (r.precio || 0) - montoTotalPagado;

            // Pago 2 (Saldo): si ya se registró un segundo pago, muestra lo
            // efectivamente cobrado; si todavía no se paga, muestra lo
            // adeudado en negativo para que se note de inmediato.
            var pago2Html = montoPagado2 > 0
                ? formatCLP(montoPagado2)
                : (saldo > 0 ? '<span class="saldo-pendiente-monto">-' + formatCLP(saldo) + '</span>' : formatCLP(0));

            var estadoPagoHtml = saldo > 0
                ? '<button type="button" class="btn-saldar" data-id="' + r.id + '" data-saldo="' + saldo + '" data-nuevo-monto2="' + (montoPagado2 + saldo) + '" data-nombre="' + (r.nombre_contacto || '').replace(/"/g, '&quot;') + '">Pendiente</button>'
                : '<span class="saldo-al-dia">Al día</span>';

            // El abono y el saldo suelen pagarse en días distintos, así que
            // cada monto muestra su propia fecha de pago debajo, en vez de
            // depender de una sola columna "Fecha de pago" para toda la fila.
            var pago1FechaHtml = '<div class="pago-fecha-hint">' + formatFechaCorta(toISODate(new Date(r.created_at))) + '</div>';
            var pago2FechaHtml = montoPagado2 > 0 && r.pago2_fecha
                ? '<div class="pago-fecha-hint">' + formatFechaCorta(r.pago2_fecha) + '</div>'
                : '';

            var tr = document.createElement('tr');
            tr.innerHTML =
                '<td>' + formatFechaCorta(toISODate(new Date(r.created_at))) + '</td>' +
                '<td>' + String(r.hora).padStart(2, '0') + ':00</td>' +
                '<td>' + (r.nombre_contacto || '') + '</td>' +
                '<td>' + deporte + '</td>' +
                '<td>' + canchaNombre + '</td>' +
                '<td>' + tipoPagoLabel + '</td>' +
                '<td>' + formatCLP(montoPagado1) + pago1FechaHtml + '</td>' +
                '<td>' + pago2Html + pago2FechaHtml + '</td>' +
                '<td>' + formatCLP(montoTotalPagado) + '</td>' +
                '<td>' + estadoPagoHtml + '</td>';
            el.pagosTbody.appendChild(tr);
        });

        el.pagosTbody.querySelectorAll('.btn-saldar').forEach(function (btn) {
            btn.addEventListener('click', function () {
                abrirModalSaldo(btn.getAttribute('data-id'), btn.getAttribute('data-saldo'), btn.getAttribute('data-nuevo-monto2'), btn.getAttribute('data-nombre'));
            });
        });

        el.pagosResumen.textContent = lista.length + (lista.length === 1 ? ' pago encontrado — ' : ' pagos encontrados — ') +
            'Acumulado: ' + formatCLP(totalMonto);
    }

    function abrirModalSaldo(reservaId, saldo, nuevoMonto2, nombre) {
        el.saldoForm.reset();
        el.saldoError.hidden = true;
        el.saldoForm.setAttribute('data-reserva-id', reservaId);
        el.saldoForm.setAttribute('data-nuevo-monto2', nuevoMonto2);
        el.saldoFormReserva.textContent = 'Reserva de ' + nombre + ' — Saldo pendiente: ' + formatCLP(parseInt(saldo, 10));
        el.saldoModalOverlay.hidden = false;
    }

    function cerrarModalSaldo() {
        el.saldoModalOverlay.hidden = true;
    }

    el.btnCerrarSaldoModal.addEventListener('click', cerrarModalSaldo);
    el.saldoModalOverlay.addEventListener('click', function (e) {
        if (e.target === el.saldoModalOverlay) cerrarModalSaldo();
    });

    el.saldoForm.addEventListener('submit', function (e) {
        e.preventDefault();

        var reservaId = el.saldoForm.getAttribute('data-reserva-id');
        var nuevoMonto2 = parseInt(el.saldoForm.getAttribute('data-nuevo-monto2'), 10);
        var metodoPago = el.saldoMetodoPago.value;

        sb.from('reservas').update({
            monto_pagado_2: nuevoMonto2,
            metodo_pago_2: metodoPago,
            pago2_fecha: toISODate(new Date())
        }).eq('id', reservaId).select().then(function (result) {
            if (result.error) {
                el.saldoError.textContent = esErrorColumnaFaltante(result.error)
                    ? 'Falta aplicar algún parche pendiente en Supabase (add_cuadratura_reservas.sql y/o add_pago2_fecha.sql) antes de poder saldar pagos.'
                    : 'No pudimos registrar el pago: ' + result.error.message;
                el.saldoError.className = 'auth-alert';
                el.saldoError.hidden = false;
                return;
            }
            // Con Row Level Security, un update que no encuentra permiso
            // sobre la fila no siempre devuelve error: puede "tener éxito"
            // sin cambiar 0 filas. Si no volvió ninguna fila, avisamos en
            // vez de cerrar el modal como si hubiese funcionado.
            if (!result.data || !result.data.length) {
                el.saldoError.textContent = 'No se pudo actualizar la reserva (no se modificó ninguna fila). Puede ser un problema de permisos.';
                el.saldoError.className = 'auth-alert';
                el.saldoError.hidden = false;
                return;
            }
            cerrarModalSaldo();
            cargarReservas();
        });
    });

    /* ======================================================================
       CUADRATURA DIARIA
       ====================================================================== */
    var METODOS_PAGO_OPCIONES = ['Efectivo', 'Transferencia', 'Mercado Pago', 'Webpay (Transbank)', 'GetNet', 'Tarjeta de Crédito/Débito', 'Pago Presencial'];
    var METODOS_TARJETA = ['Mercado Pago', 'Webpay (Transbank)', 'GetNet', 'Tarjeta de Crédito/Débito'];

    function opcionesMetodoPago(seleccionado, permitirVacio) {
        var html = permitirVacio ? '<option value=""' + (!seleccionado ? ' selected' : '') + '>—</option>' : '';
        html += METODOS_PAGO_OPCIONES.map(function (m) {
            return '<option value="' + m + '"' + (m === seleccionado ? ' selected' : '') + '>' + m + '</option>';
        }).join('');
        return html;
    }

    function renderCuadratura() {
        if (!el.cuadraturaTbody) return;

        var hoy = toISODate(new Date());
        el.cuadraturaFecha.textContent = 'Cuadratura del ' + formatFechaCorta(hoy);

        // Incluye tanto las canchas que se juegan hoy como cualquier pago
        // que haya entrado hoy para una reserva de otro día (ej. alguien que
        // reserva y paga hoy para jugar la próxima semana): la cuadratura de
        // caja debe cuadrar todo el dinero que entró en el día, sin importar
        // para cuándo es la reserva.
        var lista = state.reservas.filter(function (r) {
            if (r.estado !== 'confirmada') return false;
            var fechaDePago = toISODate(new Date(r.created_at));
            return r.fecha === hoy || fechaDePago === hoy;
        });

        lista.sort(function (a, b) {
            if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
            if (a.hora !== b.hora) return a.hora - b.hora;
            var nombreA = a.canchas ? a.canchas.nombre : a.cancha_id;
            var nombreB = b.canchas ? b.canchas.nombre : b.cancha_id;
            return nombreA.localeCompare(nombreB);
        });

        el.cuadraturaTbody.innerHTML = '';
        el.cuadraturaEmptyMsg.hidden = lista.length > 0;

        lista.forEach(function (r) {
            var canchaNombre = r.canchas ? r.canchas.nombre : r.cancha_id;
            var montoPagado1 = r.monto_pagado != null ? r.monto_pagado : 0;
            var montoPagado2 = r.monto_pagado_2 != null ? r.monto_pagado_2 : 0;
            var saldo = (r.precio || 0) - montoPagado1 - montoPagado2;

            var pago2Html =
                '<input type="number" class="cuadratura-pago2" min="0" step="1" value="' + montoPagado2 + '">' +
                (saldo > 0 ? '<div class="cuadratura-saldo-hint">Pendiente: -' + formatCLP(saldo) + '</div>' : '');

            var row = document.createElement('tr');
            row.setAttribute('data-id', r.id);
            row.innerHTML =
                '<td>' + (r.fecha === hoy ? 'Hoy' : formatFechaCorta(r.fecha)) + '</td>' +
                '<td>' + String(r.hora).padStart(2, '0') + ':00</td>' +
                '<td>' + canchaNombre + '</td>' +
                '<td><input type="number" class="cuadratura-abono" min="0" step="1" value="' + montoPagado1 + '"></td>' +
                '<td>' + pago2Html + '</td>' +
                '<td><input type="number" class="cuadratura-total" min="0" step="1" value="' + (r.precio != null ? r.precio : 0) + '"></td>' +
                '<td><select class="cuadratura-metodo1">' + opcionesMetodoPago(r.metodo_pago, false) + '</select></td>' +
                '<td><select class="cuadratura-metodo2">' + opcionesMetodoPago(r.metodo_pago_2, true) + '</select></td>' +
                '<td><input type="text" class="cuadratura-observacion" value="' + (r.observacion || '').replace(/"/g, '&quot;') + '"></td>' +
                '<td class="celda-accion cuadratura-celda-guardar">' +
                '<button type="button" class="btn-guardar-cuadratura cuadratura-guardar">Guardar</button>' +
                '<span class="contenido-guardado cuadratura-guardado" hidden>Guardado ✓</span>' +
                '</td>';
            el.cuadraturaTbody.appendChild(row);
        });

        el.cuadraturaTbody.querySelectorAll('.cuadratura-guardar').forEach(function (btn) {
            btn.addEventListener('click', function () {
                guardarFilaCuadratura(btn.closest('tr'));
            });
        });

        // El resumen de pagos cuadra todo el dinero que entró hoy (lista
        // completa), pero el % de arriendo por bloque horario es sobre el
        // uso real de las canchas hoy, así que solo cuenta las reservas
        // cuya fecha de cancha es hoy (no las pagadas hoy para otro día).
        var listaCanchasHoy = lista.filter(function (r) { return r.fecha === hoy; });

        renderResumenPagoCuadratura(lista);
        renderOcupacionCuadratura(listaCanchasHoy);
    }

    function guardarFilaCuadratura(row) {
        var id = row.getAttribute('data-id');
        var abono = parseInt(row.querySelector('.cuadratura-abono').value, 10);
        var montoPagado2 = parseInt(row.querySelector('.cuadratura-pago2').value, 10);
        var total = parseInt(row.querySelector('.cuadratura-total').value, 10);
        var metodo1 = row.querySelector('.cuadratura-metodo1').value;
        var metodo2 = row.querySelector('.cuadratura-metodo2').value;
        var observacion = row.querySelector('.cuadratura-observacion').value.trim();
        var guardadoSpan = row.querySelector('.cuadratura-guardado');
        var boton = row.querySelector('.cuadratura-guardar');

        if (isNaN(abono) || isNaN(montoPagado2) || isNaN(total) || abono < 0 || montoPagado2 < 0 || total < 0) {
            window.alert('El abono, el pago 2 y el pago total deben ser números válidos.');
            return;
        }

        if (montoPagado2 > 0 && !metodo2) {
            window.alert('Indicaste un monto en Pago 2, pero falta elegir su medio de pago.');
            return;
        }

        // Conserva la fecha original del Pago 2 si el monto no cambió; si es
        // nuevo o se modificó, queda registrado con la fecha de hoy.
        var original = state.reservas.find(function (r) { return r.id === id; });
        var pago2Fecha;
        if (montoPagado2 <= 0) {
            pago2Fecha = null;
        } else if (original && original.monto_pagado_2 === montoPagado2 && original.pago2_fecha) {
            pago2Fecha = original.pago2_fecha;
        } else {
            pago2Fecha = toISODate(new Date());
        }

        guardadoSpan.hidden = true;
        boton.disabled = true;

        sb.from('reservas').update({
            monto_pagado: abono,
            precio: total,
            metodo_pago: metodo1,
            metodo_pago_2: metodo2 || null,
            monto_pagado_2: montoPagado2,
            pago2_fecha: pago2Fecha,
            observacion: observacion || null
        }).eq('id', id).select().then(function (result) {
            boton.disabled = false;
            if (result.error) {
                window.alert(esErrorColumnaFaltante(result.error)
                    ? 'Falta aplicar algún parche pendiente en Supabase (add_cuadratura_reservas.sql y/o add_pago2_fecha.sql) antes de poder guardar estos campos.'
                    : 'No pudimos guardar los cambios: ' + result.error.message);
                return;
            }
            if (!result.data || !result.data.length) {
                window.alert('No se pudo guardar (no se modificó ninguna fila). Puede ser un problema de permisos.');
                return;
            }
            guardadoSpan.hidden = false;
            cargarReservas();
        });
    }

    function renderResumenPagoCuadratura(lista) {
        if (!el.cuadraturaResumenPago) return;

        var totales = { tarjetas: 0, efectivo: 0, transferencia: 0, otros: 0 };

        function sumar(metodo, monto) {
            if (!monto) return;
            if (METODOS_TARJETA.indexOf(metodo) !== -1) totales.tarjetas += monto;
            else if (metodo === 'Efectivo') totales.efectivo += monto;
            else if (metodo === 'Transferencia') totales.transferencia += monto;
            else totales.otros += monto;
        }

        lista.forEach(function (r) {
            sumar(r.metodo_pago, r.monto_pagado != null ? r.monto_pagado : 0);
            sumar(r.metodo_pago_2, r.monto_pagado_2 != null ? r.monto_pagado_2 : 0);
        });

        var html =
            '<div class="cuadratura-resumen-item"><span>Tarjetas</span><strong>' + formatCLP(totales.tarjetas) + '</strong></div>' +
            '<div class="cuadratura-resumen-item"><span>Efectivo</span><strong>' + formatCLP(totales.efectivo) + '</strong></div>' +
            '<div class="cuadratura-resumen-item"><span>Transferencia</span><strong>' + formatCLP(totales.transferencia) + '</strong></div>';

        if (totales.otros > 0) {
            html += '<div class="cuadratura-resumen-item"><span>Otros</span><strong>' + formatCLP(totales.otros) + '</strong></div>';
        }

        el.cuadraturaResumenPago.innerHTML = html;
    }

    function renderOcupacionCuadratura(lista) {
        if (!el.cuadraturaOcupacionBody) return;

        el.cuadraturaOcupacionBody.innerHTML = '';

        state.tarifas.forEach(function (t) {
            var canchasDeporte = state.canchas.filter(function (c) { return c.deporte === t.deporte; }).length;
            var horasEnBloque = t.hora_hasta - t.hora_desde;
            var horasDisponibles = canchasDeporte * horasEnBloque;
            var horasArrendadas = lista.filter(function (r) {
                return r.canchas && r.canchas.deporte === t.deporte && r.hora >= t.hora_desde && r.hora < t.hora_hasta;
            }).length;
            var porcentaje = horasDisponibles > 0 ? (horasArrendadas / horasDisponibles * 100) : 0;

            var bloqueLabel = (SPORT_LABELS[t.deporte] || t.deporte) + ' ' +
                String(t.hora_desde).padStart(2, '0') + ':00–' + String(t.hora_hasta).padStart(2, '0') + ':00';

            var tr = document.createElement('tr');
            tr.innerHTML =
                '<td>' + bloqueLabel + '</td>' +
                '<td>' + horasDisponibles + '</td>' +
                '<td>' + horasArrendadas + '</td>' +
                '<td>' + porcentaje.toFixed(0) + '%</td>';
            el.cuadraturaOcupacionBody.appendChild(tr);
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
        aplicarEstadoPagoPresencial();
        el.modalOverlay.hidden = false;
    }

    // "Pago Presencial" significa que todavía no se cobra nada: la reserva
    // queda con $0 pagado hasta que un administrador confirme el pago real
    // después, en Pagos o en Cuadratura Diaria.
    function aplicarEstadoPagoPresencial() {
        var esPresencial = el.admMetodoPago.value === 'Pago Presencial';

        el.admPagoPresencialNota.hidden = !esPresencial;

        el.admMontoPagado.disabled = esPresencial;
        el.admMontoPagado.value = esPresencial ? '0' : '';

        el.admMetodoPago2.disabled = esPresencial;
        el.admMontoPagado2.disabled = esPresencial;
        if (esPresencial) {
            el.admMetodoPago2.value = '';
            el.admMontoPagado2.value = '0';
        }
    }

    el.admMetodoPago.addEventListener('change', aplicarEstadoPagoPresencial);

    function cerrarModal() {
        el.modalOverlay.hidden = true;
    }

    el.btnNuevaReserva.addEventListener('click', abrirModal);
    el.btnCerrarModal.addEventListener('click', cerrarModal);
    el.modalOverlay.addEventListener('click', function (e) {
        if (e.target === el.modalOverlay) cerrarModal();
    });

    // Al terminar de crear una reserva, se ofrece enviar el comprobante por
    // WhatsApp al teléfono del jugador (no al de la empresa).
    function abrirModalReservaCreada(datos) {
        var numero = telefonoParaWhatsapp(datos.telefono);

        if (numero) {
            var estadoPago = datos.metodoPago === 'Pago Presencial'
                ? 'Pago pendiente: ' + formatCLP(datos.precio) + ' a pagar en el recinto.'
                : 'Pagado: ' + formatCLP(datos.montoPagado + datos.montoPagado2) + ' de ' + formatCLP(datos.precio) + '.';

            var mensaje = 'Hola ' + datos.nombre + ', te confirmamos tu reserva en Futbolito Chile: ' +
                (SPORT_LABELS[datos.deporte] || datos.deporte) + ' — ' + datos.canchaNombre +
                ' el ' + formatFechaCorta(datos.fecha) + ' a las ' + String(datos.hora).padStart(2, '0') + ':00 hrs. ' +
                estadoPago;

            el.btnEnviarComprobanteWhatsapp.href = 'https://wa.me/' + numero + '?text=' + encodeURIComponent(mensaje);
            el.btnEnviarComprobanteWhatsapp.hidden = false;
            el.reservaCreadaSinTelefono.hidden = true;
        } else {
            el.btnEnviarComprobanteWhatsapp.hidden = true;
            el.reservaCreadaSinTelefono.hidden = false;
        }

        el.reservaCreadaModalOverlay.hidden = false;
    }

    function cerrarModalReservaCreada() {
        el.reservaCreadaModalOverlay.hidden = true;
    }

    el.btnCerrarReservaCreadaModal.addEventListener('click', cerrarModalReservaCreada);
    el.btnCerrarReservaCreada.addEventListener('click', cerrarModalReservaCreada);
    el.reservaCreadaModalOverlay.addEventListener('click', function (e) {
        if (e.target === el.reservaCreadaModalOverlay) cerrarModalReservaCreada();
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
        var montoTexto = el.admMontoPagado.value.trim();

        el.admReservaError.hidden = true;

        if (!deporte || !canchaId || !fecha || !hora || !nombre || !montoTexto) {
            el.admReservaError.textContent = 'Completa deporte, cancha, fecha, horario, nombre de contacto y monto pagado.';
            el.admReservaError.className = 'auth-alert';
            el.admReservaError.hidden = false;
            return;
        }

        var precio = getPrecioPorHora(deporte, parseInt(hora, 10));
        var montoPagado = parseInt(montoTexto, 10);

        if (isNaN(montoPagado) || montoPagado < 0) {
            el.admReservaError.textContent = 'El monto pagado debe ser un número válido.';
            el.admReservaError.className = 'auth-alert';
            el.admReservaError.hidden = false;
            return;
        }

        var metodoPago2 = el.admMetodoPago2.value;
        var montoPagado2 = metodoPago2 ? (parseInt(el.admMontoPagado2.value, 10) || 0) : 0;

        if (metodoPago2 && (isNaN(parseInt(el.admMontoPagado2.value, 10)) || montoPagado2 <= 0)) {
            el.admReservaError.textContent = 'Si eliges un segundo método de pago, indica el monto pagado con ese medio.';
            el.admReservaError.className = 'auth-alert';
            el.admReservaError.hidden = false;
            return;
        }

        var metodoPago = el.admMetodoPago.value;
        var esPagoPresencial = metodoPago === 'Pago Presencial';

        // Refuerza el estado sin cobro, sin importar lo que hayan quedado
        // los campos (que ya se deshabilitan y ponen en 0 al elegir este
        // método, ver aplicarEstadoPagoPresencial).
        if (esPagoPresencial) {
            montoPagado = 0;
            metodoPago2 = null;
            montoPagado2 = 0;
        }

        var reservaId = generarId();
        var reserva = {
            id: reservaId,
            cancha_id: canchaId,
            fecha: fecha,
            hora: parseInt(hora, 10),
            precio: precio,
            nombre_contacto: nombre,
            documento_contacto: el.admDocumento.value.trim() || null,
            telefono_contacto: el.admTelefono.value.trim() || null,
            email_contacto: el.admEmail.value.trim() || null,
            metodo_pago: metodoPago,
            monto_pagado: montoPagado,
            metodo_pago_2: metodoPago2 || null,
            monto_pagado_2: montoPagado2,
            tipo_pago: (montoPagado + montoPagado2) >= precio ? 'completo' : 'abono',
            origen: 'admin'
        };

        sb.from('reservas').insert([reserva]).then(function (result) {
            // Si "origen" y/o "metodo_pago_2"/"monto_pagado_2" todavía no
            // existen (falta correr add_origen_reservas.sql y/o
            // add_cuadratura_reservas.sql), reintenta sin esas columnas en
            // vez de bloquear la creación de la reserva.
            if (esErrorColumnaFaltante(result.error)) {
                delete reserva.origen;
                delete reserva.metodo_pago_2;
                delete reserva.monto_pagado_2;
                return sb.from('reservas').insert([reserva]).then(manejarResultadoReservaAdmin);
            }
            return manejarResultadoReservaAdmin(result);
        });

        function manejarResultadoReservaAdmin(result) {
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

            enviarCorreosReserva(reservaId);

            var canchaOption = el.admCancha.options[el.admCancha.selectedIndex];

            cerrarModal();
            cargarReservas();
            abrirModalReservaCreada({
                telefono: el.admTelefono.value.trim(),
                nombre: nombre,
                deporte: deporte,
                canchaNombre: canchaOption ? canchaOption.textContent : '',
                fecha: fecha,
                hora: parseInt(hora, 10),
                precio: precio,
                montoPagado: montoPagado,
                montoPagado2: montoPagado2,
                metodoPago: metodoPago
            });
        }
    });

    /* ======================================================================
       SECCIÓN USUARIOS (solo superadministrador)
       ====================================================================== */
    function llamarApiAdmin(endpoint, payload) {
        return fetch('/api/' + endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + state.accessToken
            },
            body: JSON.stringify(payload)
        }).then(function (res) {
            return res.json().then(function (data) {
                if (!res.ok) {
                    throw new Error(data.error || 'Ocurrió un error inesperado.');
                }
                return data;
            });
        });
    }

    function cargarUsuarios() {
        return sb.from('profiles')
            .select('id,nombre,email,tipo_documento,documento,telefono,rol,created_at')
            .order('created_at', { ascending: false })
            .then(function (result) {
                state.usuarios = result.data || [];
                renderUsuarios();
            });
    }

    // Normaliza texto y RUTs (sin puntos/guión) para poder buscar sin
    // preocuparse del formato exacto que haya escrito el admin.
    function normalizarBusqueda(texto) {
        return (texto || '').toString().toLowerCase().replace(/[.\-\s]/g, '');
    }

    function usuariosFiltrados() {
        var termino = normalizarBusqueda(el.buscarUsuario.value);
        if (!termino) return state.usuarios;

        return state.usuarios.filter(function (u) {
            var nombre = normalizarBusqueda(u.nombre);
            var documento = normalizarBusqueda(u.documento);
            return nombre.indexOf(termino) !== -1 || documento.indexOf(termino) !== -1;
        });
    }

    function renderUsuarios() {
        var usuarios = usuariosFiltrados();

        el.usuariosTbody.innerHTML = '';
        el.usuariosEmptyMsg.hidden = usuarios.length > 0;
        el.usuariosEmptyMsg.textContent = state.usuarios.length === 0
            ? 'No hay usuarios para mostrar.'
            : 'No encontramos usuarios que coincidan con la búsqueda.';

        usuarios.forEach(function (u) {
            var tr = document.createElement('tr');
            var esUnoMismo = u.id === state.currentUserId;

            var rolSelectHtml = '<select class="rol-select" data-id="' + u.id + '"' + (esUnoMismo ? ' disabled' : '') + '>' +
                Object.keys(ROL_LABELS).map(function (key) {
                    return '<option value="' + key + '"' + (key === u.rol ? ' selected' : '') + '>' + ROL_LABELS[key] + '</option>';
                }).join('') +
                '</select>';

            var acciones = '<div class="admin-table-actions">' +
                '<button type="button" class="btn-secundario btn-editar-usuario" data-id="' + u.id + '">Editar</button>' +
                '<button type="button" class="btn-secundario btn-reset-password" data-id="' + u.id + '" data-nombre="' + (u.nombre || '') + '">Contraseña</button>' +
                (esUnoMismo ? '' : '<button type="button" class="btn-cancelar btn-eliminar-usuario" data-id="' + u.id + '" data-nombre="' + (u.nombre || '') + '">Eliminar</button>') +
                '</div>';

            tr.innerHTML =
                '<td>' + (u.nombre || '—') + (esUnoMismo ? ' <small>(tú)</small>' : '') + '</td>' +
                '<td>' + (u.documento || '—') + '</td>' +
                '<td>' + (u.email || '—') + '</td>' +
                '<td>' + rolSelectHtml + '</td>' +
                '<td>' + new Date(u.created_at).toLocaleDateString('es-CL') + '</td>' +
                '<td>' + acciones + '</td>';

            el.usuariosTbody.appendChild(tr);
        });

        el.usuariosTbody.querySelectorAll('.rol-select').forEach(function (select) {
            select.addEventListener('change', function () {
                cambiarRol(select.getAttribute('data-id'), select.value);
            });
        });
        el.usuariosTbody.querySelectorAll('.btn-eliminar-usuario').forEach(function (btn) {
            btn.addEventListener('click', function () {
                eliminarUsuario(btn.getAttribute('data-id'), btn.getAttribute('data-nombre'));
            });
        });
        el.usuariosTbody.querySelectorAll('.btn-reset-password').forEach(function (btn) {
            btn.addEventListener('click', function () {
                abrirModalPassword(btn.getAttribute('data-id'), btn.getAttribute('data-nombre'));
            });
        });
        el.usuariosTbody.querySelectorAll('.btn-editar-usuario').forEach(function (btn) {
            btn.addEventListener('click', function () {
                abrirModalEditarUsuario(btn.getAttribute('data-id'));
            });
        });
    }

    el.buscarUsuario.addEventListener('input', renderUsuarios);
    el.btnLimpiarBusquedaUsuario.addEventListener('click', function () {
        el.buscarUsuario.value = '';
        renderUsuarios();
    });

    function cambiarRol(userId, nuevoRol) {
        if (!window.confirm('¿Cambiar el rol de este usuario a "' + ROL_LABELS[nuevoRol] + '"?')) {
            cargarUsuarios(); // revierte el <select> a su valor real
            return;
        }
        sb.from('profiles').update({ rol: nuevoRol }).eq('id', userId).then(function (result) {
            if (result.error) {
                window.alert('No pudimos cambiar el rol: ' + result.error.message);
            }
            cargarUsuarios();
        });
    }

    function eliminarUsuario(userId, nombre) {
        if (!window.confirm('¿Eliminar definitivamente a "' + nombre + '"? Esta acción no se puede deshacer.')) return;

        llamarApiAdmin('admin-delete-user', { userId: userId })
            .then(function () {
                cargarUsuarios();
            })
            .catch(function (err) {
                window.alert('No pudimos eliminar el usuario: ' + err.message);
            });
    }

    function abrirModalPassword(userId, nombre) {
        el.passwordForm.reset();
        el.passwordError.hidden = true;
        el.passwordForm.setAttribute('data-user-id', userId);
        el.passwordFormUsuario.textContent = 'Usuario: ' + nombre;
        el.passwordModalOverlay.hidden = false;
    }

    function cerrarModalPassword() {
        el.passwordModalOverlay.hidden = true;
    }

    el.btnCerrarPasswordModal.addEventListener('click', cerrarModalPassword);
    el.passwordModalOverlay.addEventListener('click', function (e) {
        if (e.target === el.passwordModalOverlay) cerrarModalPassword();
    });

    el.passwordForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var userId = el.passwordForm.getAttribute('data-user-id');
        var nuevaPassword = el.nuevaPassword.value;

        if (nuevaPassword.length < 6) {
            el.passwordError.textContent = 'La contraseña debe tener al menos 6 caracteres.';
            el.passwordError.className = 'auth-alert';
            el.passwordError.hidden = false;
            return;
        }

        llamarApiAdmin('admin-set-password', { userId: userId, newPassword: nuevaPassword })
            .then(function () {
                cerrarModalPassword();
                window.alert('Contraseña actualizada correctamente.');
            })
            .catch(function (err) {
                el.passwordError.textContent = err.message;
                el.passwordError.className = 'auth-alert';
                el.passwordError.hidden = false;
            });
    });

    function abrirModalUsuario() {
        el.nuevoUsuarioForm.reset();
        el.usrError.hidden = true;
        // Solo el superadministrador puede elegir el rol; un administrador
        // únicamente puede crear cuentas de jugador (el backend lo refuerza
        // igual, esto es solo para no confundir con una opción que no aplica).
        el.usrRolGrupo.hidden = !state.esSuperadmin;
        el.usrRolNota.hidden = state.esSuperadmin;
        el.userModalOverlay.hidden = false;
    }

    function cerrarModalUsuario() {
        el.userModalOverlay.hidden = true;
    }

    el.btnNuevoUsuario.addEventListener('click', abrirModalUsuario);
    el.btnCerrarUserModal.addEventListener('click', cerrarModalUsuario);
    el.userModalOverlay.addEventListener('click', function (e) {
        if (e.target === el.userModalOverlay) cerrarModalUsuario();
    });

    el.nuevoUsuarioForm.addEventListener('submit', function (e) {
        e.preventDefault();

        var payload = {
            nombre: el.usrNombre.value.trim(),
            email: el.usrEmail.value.trim(),
            password: el.usrPassword.value,
            telefono: el.usrTelefono.value.trim() || null,
            // El backend igual lo obliga a 'jugador' si quien llama no es
            // superadministrador; esto solo evita mandar un rol que ni
            // siquiera se le muestra en el formulario.
            rol: state.esSuperadmin ? el.usrRol.value : 'jugador'
        };

        if (!payload.nombre || !payload.email || !payload.password) {
            el.usrError.textContent = 'Completa nombre, email y contraseña.';
            el.usrError.className = 'auth-alert';
            el.usrError.hidden = false;
            return;
        }

        llamarApiAdmin('admin-create-user', payload)
            .then(function () {
                cerrarModalUsuario();
                cargarUsuarios();
            })
            .catch(function (err) {
                el.usrError.textContent = err.message;
                el.usrError.className = 'auth-alert';
                el.usrError.hidden = false;
            });
    });

    /* ======================================================================
       MODAL: EDITAR USUARIO (solo superadministrador)
       ====================================================================== */
    function tipoDocumentoEditActual() {
        var seleccionado = el.editUsuarioForm.querySelector('input[name="editTipoDocumento"]:checked');
        return seleccionado ? seleccionado.value : 'rut';
    }

    function actualizarLabelDocumentoEdit() {
        if (tipoDocumentoEditActual() === 'rut') {
            el.editLabelDocumento.textContent = 'RUT';
            el.editUsrDocumento.placeholder = '12.345.678-9';
        } else {
            el.editLabelDocumento.textContent = 'Pasaporte';
            el.editUsrDocumento.placeholder = 'AB123456';
        }
    }

    el.editUsuarioForm.querySelectorAll('input[name="editTipoDocumento"]').forEach(function (radio) {
        radio.addEventListener('change', actualizarLabelDocumentoEdit);
    });

    function abrirModalEditarUsuario(userId) {
        var usuario = state.usuarios.find(function (u) { return u.id === userId; });
        if (!usuario) return;

        el.editUsuarioForm.reset();
        el.editUsrError.hidden = true;
        el.editUsuarioForm.setAttribute('data-user-id', usuario.id);

        el.editUsrNombre.value = usuario.nombre || '';
        el.editUsrTelefono.value = usuario.telefono || '';
        el.editUsuarioForm.querySelector('input[name="editTipoDocumento"][value="' + (usuario.tipo_documento || 'rut') + '"]').checked = true;
        el.editUsrDocumento.value = usuario.documento || '';
        actualizarLabelDocumentoEdit();

        el.editUsuarioModalOverlay.hidden = false;
    }

    function cerrarModalEditarUsuario() {
        el.editUsuarioModalOverlay.hidden = true;
    }

    el.btnCerrarEditUsuarioModal.addEventListener('click', cerrarModalEditarUsuario);
    el.editUsuarioModalOverlay.addEventListener('click', function (e) {
        if (e.target === el.editUsuarioModalOverlay) cerrarModalEditarUsuario();
    });

    el.editUsuarioForm.addEventListener('submit', function (e) {
        e.preventDefault();

        var userId = el.editUsuarioForm.getAttribute('data-user-id');
        var nombre = el.editUsrNombre.value.trim();
        var documento = el.editUsrDocumento.value.trim();
        var tipoDocumento = tipoDocumentoEditActual();

        if (!nombre) {
            el.editUsrError.textContent = 'El nombre no puede estar vacío.';
            el.editUsrError.className = 'auth-alert';
            el.editUsrError.hidden = false;
            return;
        }

        if (documento && tipoDocumento === 'rut' && !window.FutbolitoAuth.validarRut(documento)) {
            el.editUsrError.textContent = 'RUT inválido. Verifica el dígito verificador.';
            el.editUsrError.className = 'auth-alert';
            el.editUsrError.hidden = false;
            return;
        }
        if (documento && tipoDocumento === 'pasaporte' && !window.FutbolitoAuth.validarPasaporte(documento)) {
            el.editUsrError.textContent = 'Pasaporte inválido (5 a 15 caracteres alfanuméricos).';
            el.editUsrError.className = 'auth-alert';
            el.editUsrError.hidden = false;
            return;
        }
        if (documento && tipoDocumento === 'rut') {
            documento = window.FutbolitoAuth.formatearRut(documento);
        }

        sb.from('profiles').update({
            nombre: nombre,
            tipo_documento: documento ? tipoDocumento : null,
            documento: documento || null,
            telefono: el.editUsrTelefono.value.trim() || null
        }).eq('id', userId).then(function (result) {
            if (result.error) {
                el.editUsrError.textContent = 'No pudimos guardar los cambios: ' + result.error.message;
                el.editUsrError.className = 'auth-alert';
                el.editUsrError.hidden = false;
                return;
            }
            cerrarModalEditarUsuario();
            cargarUsuarios();
        });
    });

    /* ======================================================================
       SECCIÓN CONTENIDO (solo superadministrador)
       ====================================================================== */
    var CARDS_INFO = [
        { id: 'canchas', nombre: 'Canchas de Futbolito' },
        { id: 'padel', nombre: 'Canchas de Pádel' },
        { id: 'piscina', nombre: 'Piscina' },
        { id: 'quinchos', nombre: 'Zona de Quinchos' },
        { id: 'camarines', nombre: 'Camarines y Baños' },
        { id: 'kiosco', nombre: 'Kiosco y Snack Bar' }
    ];

    function mostrarGuardado(el) {
        el.hidden = false;
        setTimeout(function () { el.hidden = true; }, 2500);
    }

    function guardarSiteContent(pares) {
        var filas = Object.keys(pares).map(function (key) {
            return { key: key, value: pares[key] };
        });
        return sb.from('site_content').upsert(filas, { onConflict: 'key' });
    }

    function subirImagen(file, prefijo) {
        var ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        var path = prefijo + '-' + Date.now() + '.' + ext;

        return sb.storage.from('site-images').upload(path, file, {
            upsert: true,
            contentType: file.type
        }).then(function (result) {
            if (result.error) throw result.error;
            var publicUrlResult = sb.storage.from('site-images').getPublicUrl(path);
            return publicUrlResult.data.publicUrl;
        });
    }

    // Si la columna "abono" todavía no existe (falta correr el parche SQL),
    // reintenta sin ella en vez de dejar la grilla de tarifas vacía.
    function cargarTarifasConFallback() {
        return sb.from('tarifas').select('id,deporte,hora_desde,hora_hasta,precio,abono').order('deporte', { ascending: true }).order('hora_desde', { ascending: true })
            .then(function (res) {
                if (esErrorColumnaFaltante(res.error)) {
                    return sb.from('tarifas').select('id,deporte,hora_desde,hora_hasta,precio').order('deporte', { ascending: true }).order('hora_desde', { ascending: true });
                }
                return res;
            });
    }

    function cargarContenido() {
        return Promise.all([
            sb.from('site_content').select('key,value'),
            sb.from('instalaciones_cards').select('id,titulo,descripcion,imagen_url').order('orden', { ascending: true }),
            cargarTarifasConFallback(),
            sb.from('planes_mensuales').select('id,nombre,horas_incluidas,precio').order('orden', { ascending: true }),
            sb.from('equipamiento').select('id,nombre,precio').order('orden', { ascending: true }),
            sb.from('metodos_pago').select('id,nombre,activo').order('orden', { ascending: true })
        ]).then(function (resultados) {
            var contenidoRes = resultados[0];
            var cardsRes = resultados[1];
            var tarifasRes = resultados[2];
            var planesRes = resultados[3];
            var equipamientoRes = resultados[4];
            var metodosPagoRes = resultados[5];

            var c = {};
            (contenidoRes.data || []).forEach(function (fila) { c[fila.key] = fila.value; });

            el.cNosotrosImgPreview.src = c.nosotros_imagen_url || '';
            el.cNosotrosTagline.value = c.nosotros_tagline || '';
            el.cNosotrosParrafo1.value = c.nosotros_parrafo1 || '';
            el.cNosotrosParrafo2.value = c.nosotros_parrafo2 || '';
            el.cFeature1Titulo.value = c.nosotros_feature1_titulo || '';
            el.cFeature1Texto.value = c.nosotros_feature1_texto || '';
            el.cFeature2Titulo.value = c.nosotros_feature2_titulo || '';
            el.cFeature2Texto.value = c.nosotros_feature2_texto || '';
            el.cFeature3Titulo.value = c.nosotros_feature3_titulo || '';
            el.cFeature3Texto.value = c.nosotros_feature3_texto || '';
            el.cCtaTitulo.value = c.nosotros_cta_titulo || '';
            el.cCtaTexto.value = c.nosotros_cta_texto || '';

            renderCardsEditor(cardsRes.data || []);
            renderTarifasEditor(tarifasRes.data || []);
            renderEquipamientoEditor(equipamientoRes.data || []);
            renderMetodosPagoEditor(metodosPagoRes.data || []);

            var plan = (planesRes.data || [])[0];
            if (plan) {
                state.planId = plan.id;
                el.cPlanNombre.value = plan.nombre || '';
                el.cPlanHoras.value = plan.horas_incluidas || '';
                el.cPlanPrecio.value = plan.precio || 0;
            }
        });
    }

    function renderTarifasEditor(tarifas) {
        el.tarifasGrid.innerHTML = '';

        tarifas.forEach(function (t) {
            var row = document.createElement('div');
            row.className = 'tarifa-editor-row';
            row.setAttribute('data-id', t.id);
            row.innerHTML =
                '<span class="tarifa-editor-deporte">' + (SPORT_LABELS[t.deporte] || t.deporte) + '</span>' +
                '<label>Desde <input type="number" class="tarifa-desde" min="0" max="23" value="' + t.hora_desde + '"></label>' +
                '<label>Hasta <input type="number" class="tarifa-hasta" min="0" max="23" value="' + t.hora_hasta + '"></label>' +
                '<label>Precio <input type="number" class="tarifa-precio" min="0" step="1" value="' + t.precio + '"></label>' +
                '<label>Abono <input type="number" class="tarifa-abono" min="0" step="1" value="' + (t.abono != null ? t.abono : 10000) + '"></label>';
            el.tarifasGrid.appendChild(row);
        });
    }

    function renderEquipamientoEditor(items) {
        el.equipamientoGrid.innerHTML = '';

        items.forEach(function (item) {
            var row = document.createElement('div');
            row.className = 'equipamiento-editor-row';
            row.setAttribute('data-id', item.id);
            row.innerHTML =
                '<label>Artículo <input type="text" class="equip-nombre" value="' + (item.nombre || '').replace(/"/g, '&quot;') + '"></label>' +
                '<label>Precio <input type="number" class="equip-precio" min="0" step="1" value="' + item.precio + '"></label>';
            el.equipamientoGrid.appendChild(row);
        });
    }

    function renderMetodosPagoEditor(metodos) {
        el.metodosPagoGrid.innerHTML = '';

        metodos.forEach(function (m) {
            var row = document.createElement('div');
            row.className = 'metodo-pago-row';
            row.setAttribute('data-id', m.id);
            row.innerHTML =
                '<span class="metodo-pago-nombre">' + m.nombre + '</span>' +
                '<label class="metodo-pago-switch">' +
                '<input type="checkbox" class="metodo-pago-activo"' + (m.activo ? ' checked' : '') + '>' +
                '<span class="metodo-pago-switch-track"></span>' +
                '</label>';
            el.metodosPagoGrid.appendChild(row);
        });
    }

    el.btnGuardarTarifas.addEventListener('click', function () {
        var filas = Array.from(el.tarifasGrid.querySelectorAll('.tarifa-editor-row')).map(function (row) {
            return {
                id: parseInt(row.getAttribute('data-id'), 10),
                hora_desde: parseInt(row.querySelector('.tarifa-desde').value, 10),
                hora_hasta: parseInt(row.querySelector('.tarifa-hasta').value, 10),
                precio: parseInt(row.querySelector('.tarifa-precio').value, 10),
                abono: parseInt(row.querySelector('.tarifa-abono').value, 10)
            };
        });

        var invalida = filas.some(function (f) {
            return isNaN(f.hora_desde) || isNaN(f.hora_hasta) || isNaN(f.precio) || isNaN(f.abono);
        });
        if (invalida) {
            window.alert('Revisa que todos los horarios, precios y abonos sean números válidos.');
            return;
        }

        var faltoColumnaAbono = false;

        Promise.all(filas.map(function (fila) {
            return sb.from('tarifas').update({
                hora_desde: fila.hora_desde,
                hora_hasta: fila.hora_hasta,
                precio: fila.precio,
                abono: fila.abono
            }).eq('id', fila.id).then(function (res) {
                // Si la columna "abono" todavía no existe (falta correr el parche SQL),
                // reintenta guardando solo horario y precio para no bloquear la edición.
                if (esErrorColumnaFaltante(res.error)) {
                    faltoColumnaAbono = true;
                    return sb.from('tarifas').update({
                        hora_desde: fila.hora_desde,
                        hora_hasta: fila.hora_hasta,
                        precio: fila.precio
                    }).eq('id', fila.id);
                }
                return res;
            });
        })).then(function (resultados) {
            var conError = resultados.find(function (r) { return r.error; });
            if (conError) {
                window.alert('No pudimos guardar algunas tarifas: ' + conError.error.message);
                return;
            }
            mostrarGuardado(el.guardadoTarifas);
            if (faltoColumnaAbono) {
                window.alert('Se guardaron los horarios y precios, pero el abono no se pudo guardar todavía: falta correr el parche supabase/add_abono_tarifas.sql en Supabase.');
            }
            cargarCatalogo().then(renderCuadratura); // refresca precios y el % de arriendo
        });
    });

    el.btnGuardarEquipamiento.addEventListener('click', function () {
        var filas = Array.from(el.equipamientoGrid.querySelectorAll('.equipamiento-editor-row')).map(function (row) {
            return {
                id: row.getAttribute('data-id'),
                nombre: row.querySelector('.equip-nombre').value.trim(),
                precio: parseInt(row.querySelector('.equip-precio').value, 10)
            };
        });

        var invalida = filas.some(function (f) { return !f.nombre || isNaN(f.precio); });
        if (invalida) {
            window.alert('Revisa que cada artículo tenga nombre y un precio válido.');
            return;
        }

        Promise.all(filas.map(function (fila) {
            return sb.from('equipamiento').update({ nombre: fila.nombre, precio: fila.precio }).eq('id', fila.id);
        })).then(function (resultados) {
            var conError = resultados.find(function (r) { return r.error; });
            if (conError) {
                window.alert('No pudimos guardar algunos artículos: ' + conError.error.message);
                return;
            }
            mostrarGuardado(el.guardadoEquipamiento);
        });
    });

    el.btnGuardarMetodosPago.addEventListener('click', function () {
        var filas = Array.from(el.metodosPagoGrid.querySelectorAll('.metodo-pago-row')).map(function (row) {
            return {
                id: row.getAttribute('data-id'),
                activo: row.querySelector('.metodo-pago-activo').checked
            };
        });

        Promise.all(filas.map(function (fila) {
            return sb.from('metodos_pago').update({ activo: fila.activo }).eq('id', fila.id);
        })).then(function (resultados) {
            var conError = resultados.find(function (r) { return r.error; });
            if (conError) {
                window.alert('No pudimos guardar los métodos de pago: ' + conError.error.message);
                return;
            }
            mostrarGuardado(el.guardadoMetodosPago);
        });
    });

    el.formPlanMensual.addEventListener('submit', function (e) {
        e.preventDefault();

        var precio = parseInt(el.cPlanPrecio.value, 10);
        if (!el.cPlanNombre.value.trim() || !el.cPlanHoras.value.trim() || isNaN(precio)) {
            window.alert('Completa nombre, horas incluidas y un precio válido.');
            return;
        }
        if (!state.planId) {
            window.alert('No pudimos identificar el plan a actualizar. Recarga la página.');
            return;
        }

        sb.from('planes_mensuales').update({
            nombre: el.cPlanNombre.value.trim(),
            horas_incluidas: el.cPlanHoras.value.trim(),
            precio: precio
        }).eq('id', state.planId).then(function (result) {
            if (result.error) {
                window.alert('No pudimos guardar el plan: ' + result.error.message);
                return;
            }
            mostrarGuardado(el.guardadoPlan);
        });
    });

    function renderCardsEditor(cards) {
        el.contenidoCardsGrid.innerHTML = '';

        CARDS_INFO.forEach(function (info) {
            var card = cards.find(function (c) { return c.id === info.id; }) || {};

            var bloque = document.createElement('div');
            bloque.className = 'contenido-card-editor';
            bloque.innerHTML =
                '<img class="contenido-preview-img" src="' + (card.imagen_url || '') + '" alt="Vista previa">' +
                '<label class="btn btn-outline contenido-upload-btn">Cambiar Imagen' +
                '<input type="file" accept="image/*" hidden class="card-img-input"></label>' +
                '<div class="form-group"><label>Título</label><input type="text" class="card-titulo-input" value="' + (card.titulo || '').replace(/"/g, '&quot;') + '"></div>' +
                '<div class="form-group"><label>Descripción</label><textarea rows="3" class="card-desc-input">' + (card.descripcion || '') + '</textarea></div>' +
                '<div class="contenido-form-actions">' +
                '<button type="button" class="btn btn-primary btn-guardar-card">Guardar</button>' +
                '<span class="contenido-guardado card-guardado" hidden>Guardado ✓</span>' +
                '</div>';

            var imgPreview = bloque.querySelector('.contenido-preview-img');
            var imgInput = bloque.querySelector('.card-img-input');
            var tituloInput = bloque.querySelector('.card-titulo-input');
            var descInput = bloque.querySelector('.card-desc-input');
            var btnGuardar = bloque.querySelector('.btn-guardar-card');
            var guardadoSpan = bloque.querySelector('.card-guardado');

            var imagenActualUrl = card.imagen_url || null;

            imgInput.addEventListener('change', function () {
                var file = imgInput.files[0];
                if (!file) return;

                subirImagen(file, 'card-' + info.id).then(function (url) {
                    imagenActualUrl = url;
                    imgPreview.src = url;
                    return sb.from('instalaciones_cards').update({ imagen_url: url }).eq('id', info.id);
                }).then(function () {
                    mostrarGuardado(guardadoSpan);
                }).catch(function (err) {
                    window.alert('No pudimos subir la imagen: ' + err.message);
                });
            });

            btnGuardar.addEventListener('click', function () {
                sb.from('instalaciones_cards').update({
                    titulo: tituloInput.value.trim(),
                    descripcion: descInput.value.trim()
                }).eq('id', info.id).then(function (result) {
                    if (result.error) {
                        window.alert('No pudimos guardar: ' + result.error.message);
                        return;
                    }
                    mostrarGuardado(guardadoSpan);
                });
            });

            el.contenidoCardsGrid.appendChild(bloque);
        });
    }

    el.formNosotros.addEventListener('submit', function (e) {
        e.preventDefault();
        guardarSiteContent({
            nosotros_tagline: el.cNosotrosTagline.value.trim(),
            nosotros_parrafo1: el.cNosotrosParrafo1.value.trim(),
            nosotros_parrafo2: el.cNosotrosParrafo2.value.trim(),
            nosotros_feature1_titulo: el.cFeature1Titulo.value.trim(),
            nosotros_feature1_texto: el.cFeature1Texto.value.trim(),
            nosotros_feature2_titulo: el.cFeature2Titulo.value.trim(),
            nosotros_feature2_texto: el.cFeature2Texto.value.trim(),
            nosotros_feature3_titulo: el.cFeature3Titulo.value.trim(),
            nosotros_feature3_texto: el.cFeature3Texto.value.trim(),
            nosotros_cta_titulo: el.cCtaTitulo.value.trim(),
            nosotros_cta_texto: el.cCtaTexto.value.trim()
        }).then(function (result) {
            if (result.error) {
                window.alert('No pudimos guardar: ' + result.error.message);
                return;
            }
            mostrarGuardado(el.guardadoNosotros);
        });
    });

    el.cNosotrosImgInput.addEventListener('change', function () {
        var file = el.cNosotrosImgInput.files[0];
        if (!file) return;

        subirImagen(file, 'nosotros').then(function (url) {
            el.cNosotrosImgPreview.src = url;
            return guardarSiteContent({ nosotros_imagen_url: url });
        }).then(function () {
            mostrarGuardado(el.guardadoNosotrosImg);
        }).catch(function (err) {
            window.alert('No pudimos subir la imagen: ' + err.message);
        });
    });

    /* ======================================================================
       INICIALIZACIÓN (con control de acceso)
       ====================================================================== */
    window.FutbolitoAuth.requireAdmin().then(function (info) {
        if (!info) return; // requireAdmin ya redirigió

        state.accessToken = info.session.access_token;
        state.currentUserId = info.session.user.id;
        state.esSuperadmin = info.rol === 'superadministrador';

        el.gate.hidden = true;
        el.page.hidden = false;

        var tareas = [cargarCatalogo().then(function () {
            poblarFiltroCanchaPagos();
            renderCuadratura(); // recalcula el % de arriendo si las tarifas llegaron después que las reservas
        }), cargarReservas()];

        // Se carga para administrador y superadministrador: Cancelaciones
        // (visible para ambos) necesita los nombres para "Cancelado por".
        tareas.push(cargarUsuarios().then(renderCancelaciones));

        if (state.esSuperadmin) {
            el.tabUsuarios.hidden = false;
            el.tabContenido.hidden = false;
            el.tabTarifas.hidden = false;
            tareas.push(cargarContenido());
        }

        Promise.all(tareas);
    });
})();
