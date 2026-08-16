(function () {
    'use strict';

    var sb = window.sbClient;

    var SPORT_LABELS = { futbolito: 'Futbolito', padel: 'Pádel' };
    var PANEL_ORDER = ['deporte', 'fecha', 'horario', 'cancha', 'datos', 'pago'];

    function formatCLP(n) {
        return '$' + n.toLocaleString('es-CL');
    }

    /* ======================================================================
       ESTADO
       ====================================================================== */
    var state = {
        sport: null,
        canchaId: null,      // cancha elegida por el jugador en el paso "Elige tu cancha"
        canchaNombre: null,
        viewMonth: startOfMonth(new Date()),
        selectedDate: null, // 'YYYY-MM-DD'
        selectedHour: null, // number 12-22
        precio: 0,
        abono: 0,
        tipoPago: null,       // 'completo' | 'abono'
        montoAPagar: 0,
        canchas: [],           // desde Supabase: {id, nombre, deporte, descripcion}
        tarifas: [],            // desde Supabase: {deporte, hora_desde, hora_hasta, precio}
        ocupadosPorHora: {},    // { hora: cantidadDeCanchasOcupadas } para el deporte/fecha elegidos
        totalCanchasDeporte: 0, // cuántas canchas tiene el deporte elegido
        catalogoListo: false,
        userId: null
    };

    /* ======================================================================
       UTILIDADES DE FECHA
       ====================================================================== */
    function startOfMonth(d) {
        return new Date(d.getFullYear(), d.getMonth(), 1);
    }

    function toISODate(d) {
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }

    function isBeforeToday(d) {
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var cmp = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        return cmp < today;
    }

    var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

    function formatFechaLarga(iso) {
        var parts = iso.split('-').map(Number);
        var d = new Date(parts[0], parts[1] - 1, parts[2]);
        var dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
        return dias[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear();
    }

    function formatFechaCorta(iso) {
        var parts = iso.split('-').map(Number);
        var d = new Date(parts[0], parts[1] - 1, parts[2]);
        return d.getDate() + ' ' + MESES[d.getMonth()].slice(0, 3) + '.';
    }

    /* ======================================================================
       PRECIOS (a partir de las tarifas cargadas desde Supabase)
       ====================================================================== */
    function getPrecioPorHora(sport, horaInicio) {
        var tabla = state.tarifas.filter(function (t) { return t.deporte === sport; });
        for (var i = 0; i < tabla.length; i++) {
            if (horaInicio >= tabla[i].hora_desde && horaInicio < tabla[i].hora_hasta) {
                return tabla[i].precio;
            }
        }
        return tabla.length ? tabla[0].precio : 0;
    }

    function getAbonoPorHora(sport, horaInicio) {
        var tabla = state.tarifas.filter(function (t) { return t.deporte === sport; });
        for (var i = 0; i < tabla.length; i++) {
            if (horaInicio >= tabla[i].hora_desde && horaInicio < tabla[i].hora_hasta) {
                return tabla[i].abono != null ? tabla[i].abono : 10000;
            }
        }
        return tabla.length && tabla[0].abono != null ? tabla[0].abono : 10000;
    }

    /* ======================================================================
       VALIDACIÓN DE RUT CHILENO
       ====================================================================== */
    function limpiarRut(rut) {
        return rut.replace(/[^0-9kK]/g, '').toUpperCase();
    }

    function validarRut(rutCompleto) {
        var limpio = limpiarRut(rutCompleto);
        if (limpio.length < 2) return false;

        var cuerpo = limpio.slice(0, -1);
        var dv = limpio.slice(-1);
        if (!/^\d+$/.test(cuerpo)) return false;

        var suma = 0;
        var multiplo = 2;
        for (var i = cuerpo.length - 1; i >= 0; i--) {
            suma += parseInt(cuerpo.charAt(i), 10) * multiplo;
            multiplo = multiplo < 7 ? multiplo + 1 : 2;
        }
        var resto = 11 - (suma % 11);
        var dvEsperado;
        if (resto === 11) dvEsperado = '0';
        else if (resto === 10) dvEsperado = 'K';
        else dvEsperado = String(resto);

        return dv === dvEsperado;
    }

    function formatearRut(rut) {
        var limpio = limpiarRut(rut);
        if (limpio.length < 2) return limpio;
        var cuerpo = limpio.slice(0, -1);
        var dv = limpio.slice(-1);
        var cuerpoFormateado = '';
        for (var i = 0; i < cuerpo.length; i++) {
            var posDesdeFinal = cuerpo.length - i;
            cuerpoFormateado += cuerpo.charAt(i);
            if (posDesdeFinal > 1 && (posDesdeFinal - 1) % 3 === 0) {
                cuerpoFormateado += '.';
            }
        }
        return cuerpoFormateado + '-' + dv;
    }

    /* ======================================================================
       REFERENCIAS AL DOM
       ====================================================================== */
    var el = {
        catalogoError: document.getElementById('catalogoError'),
        calendarMonthLabel: document.getElementById('calendarMonthLabel'),
        calendarGrid: document.getElementById('calendarGrid'),
        prevMonth: document.getElementById('prevMonth'),
        nextMonth: document.getElementById('nextMonth'),
        horarioGrid: document.getElementById('horarioGrid'),
        canchaGrid: document.getElementById('canchaGrid'),
        reservaForm: document.getElementById('reservaForm'),
        paymentStatus: document.getElementById('paymentStatus'),
        paymentConfirmation: document.getElementById('paymentConfirmation'),
        paymentMethodsWrap: document.getElementById('paymentMethodsWrap'),
        montoOpcionCompleto: document.getElementById('montoOpcionCompleto'),
        montoOpcionAbono: document.getElementById('montoOpcionAbono'),
        summarySport: document.getElementById('summarySport'),
        summaryFecha: document.getElementById('summaryFecha'),
        summaryHora: document.getElementById('summaryHora'),
        summaryCancha: document.getElementById('summaryCancha'),
        summaryTotal: document.getElementById('summaryTotal'),
        resumenDeporte: document.getElementById('resumenDeporte'),
        resumenFecha: document.getElementById('resumenFecha'),
        resumenHorario: document.getElementById('resumenHorario'),
        resumenCancha: document.getElementById('resumenCancha'),
        resumenDatos: document.getElementById('resumenDatos'),
        resumenPago: document.getElementById('resumenPago')
    };

    /* ======================================================================
       ACORDEÓN: abrir / bloquear / completar paneles
       ====================================================================== */
    function panelEl(name) {
        return document.getElementById('panel-' + name);
    }

    function openPanel(name) {
        PANEL_ORDER.forEach(function (n) {
            var panel = panelEl(n);
            if (!panel || panel.classList.contains('locked')) return;
            panel.classList.toggle('open', n === name);
        });
    }

    function unlockPanel(name) {
        var panel = panelEl(name);
        panel.classList.remove('locked');
        panel.querySelector('.accordion-header').disabled = false;
    }

    function lockPanel(name) {
        var panel = panelEl(name);
        panel.classList.add('locked');
        panel.classList.remove('completed', 'open');
        panel.querySelector('.accordion-header').disabled = true;
    }

    function completePanel(name) {
        panelEl(name).classList.add('completed');
    }

    // Bloquea de nuevo todos los paneles posteriores a `name` y limpia sus resúmenes.
    function resetDownstreamFrom(name) {
        var idx = PANEL_ORDER.indexOf(name);
        for (var i = idx + 1; i < PANEL_ORDER.length; i++) {
            lockPanel(PANEL_ORDER[i]);
        }
        if (idx < PANEL_ORDER.indexOf('fecha')) { el.resumenFecha.textContent = ''; state.selectedDate = null; }
        if (idx < PANEL_ORDER.indexOf('horario')) { el.resumenHorario.textContent = ''; state.selectedHour = null; state.precio = 0; state.abono = 0; }
        if (idx < PANEL_ORDER.indexOf('cancha')) { el.resumenCancha.textContent = ''; state.canchaId = null; state.canchaNombre = null; }
        if (idx < PANEL_ORDER.indexOf('datos')) { el.resumenDatos.textContent = ''; }
        if (idx < PANEL_ORDER.indexOf('pago')) {
            el.resumenPago.textContent = '';
            state.tipoPago = null;
            state.montoAPagar = 0;
            el.paymentMethodsWrap.hidden = true;
            el.paymentStatus.hidden = true;
            el.paymentConfirmation.hidden = true;
            document.querySelectorAll('.tipo-pago-card').forEach(function (c) { c.classList.remove('selected'); });
            document.querySelectorAll('.payment-card').forEach(function (c) { c.classList.remove('selected'); c.disabled = false; });
        }
    }

    /* ======================================================================
       CARGA DE CATÁLOGO (canchas + tarifas) DESDE SUPABASE
       ====================================================================== */
    function cargarCatalogo() {
        return Promise.all([
            sb.from('canchas').select('id,nombre,deporte,descripcion'),
            sb.from('tarifas').select('deporte,hora_desde,hora_hasta,precio,abono')
        ]).then(function (resultados) {
            var canchasRes = resultados[0];
            var tarifasRes = resultados[1];

            // Si la columna "abono" todavía no existe (falta correr el parche SQL),
            // reintentamos sin ella en vez de bloquear toda la reserva: el abono
            // simplemente usa el valor por defecto de $10.000 (ver getAbonoPorHora).
            if (tarifasRes.error && tarifasRes.error.code === '42703') {
                return sb.from('tarifas').select('deporte,hora_desde,hora_hasta,precio').then(function (fallbackRes) {
                    return finalizarCatalogo(canchasRes, fallbackRes);
                });
            }

            return finalizarCatalogo(canchasRes, tarifasRes);
        });
    }

    function finalizarCatalogo(canchasRes, tarifasRes) {
        if (canchasRes.error || tarifasRes.error) {
            el.catalogoError.hidden = false;
            el.catalogoError.textContent = 'No pudimos cargar los deportes disponibles. Intenta recargar la página.';
            return;
        }

        state.canchas = canchasRes.data || [];
        state.tarifas = tarifasRes.data || [];
        state.catalogoListo = true;

        document.querySelectorAll('.sport-card').forEach(function (card) {
            card.disabled = false;
        });
    }

    function obtenerSesionActual() {
        return sb.auth.getSession().then(function (result) {
            var session = result.data.session;
            state.userId = session ? session.user.id : null;
            return precargarDatosDelPerfil();
        });
    }

    function canchasDelDeporte(sport) {
        return state.canchas.filter(function (c) { return c.deporte === sport; }).map(function (c) { return c.id; });
    }

    /* ======================================================================
       PANEL 1: DEPORTE
       ====================================================================== */
    var sportCards = document.querySelectorAll('.sport-card');
    sportCards.forEach(function (card) {
        card.disabled = true; // se habilitan cuando termina de cargar el catálogo

        card.addEventListener('click', function () {
            if (!state.catalogoListo) return;

            sportCards.forEach(function (c) { c.classList.remove('selected'); });
            card.classList.add('selected');

            state.sport = card.getAttribute('data-sport');
            state.totalCanchasDeporte = canchasDelDeporte(state.sport).length;

            completePanel('deporte');
            el.resumenDeporte.textContent = SPORT_LABELS[state.sport];

            resetDownstreamFrom('deporte');
            renderCalendario();
            unlockPanel('fecha');
            openPanel('fecha');

            updateSummary();
        });
    });

    /* ======================================================================
       PANEL 2: CALENDARIO
       ====================================================================== */
    function renderCalendario() {
        var year = state.viewMonth.getFullYear();
        var month = state.viewMonth.getMonth();

        el.calendarMonthLabel.textContent = MESES[month] + ' ' + year;

        var currentMonthStart = startOfMonth(new Date());
        el.prevMonth.disabled = state.viewMonth.getTime() <= currentMonthStart.getTime();

        el.calendarGrid.innerHTML = '';

        var firstDay = new Date(year, month, 1);
        // Lunes = 0 ... Domingo = 6
        var startOffset = (firstDay.getDay() + 6) % 7;
        var daysInMonth = new Date(year, month + 1, 0).getDate();

        for (var i = 0; i < startOffset; i++) {
            var empty = document.createElement('span');
            empty.className = 'calendar-day empty';
            el.calendarGrid.appendChild(empty);
        }

        var todayISO = toISODate(new Date());

        for (var day = 1; day <= daysInMonth; day++) {
            var date = new Date(year, month, day);
            var iso = toISODate(date);

            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'calendar-day';
            btn.textContent = String(day);

            if (iso === todayISO) btn.classList.add('today');
            if (iso === state.selectedDate) btn.classList.add('selected');

            if (isBeforeToday(date)) {
                btn.disabled = true;
            } else {
                btn.addEventListener('click', function (evtIso) {
                    return function () {
                        state.selectedDate = evtIso;
                        renderCalendario();

                        completePanel('fecha');
                        el.resumenFecha.textContent = formatFechaCorta(evtIso);

                        resetDownstreamFrom('fecha');
                        unlockPanel('horario');
                        openPanel('horario');
                        cargarDisponibilidadYRenderizar();

                        updateSummary();
                    };
                }(iso));
            }

            el.calendarGrid.appendChild(btn);
        }
    }

    el.prevMonth.addEventListener('click', function () {
        var d = new Date(state.viewMonth);
        d.setMonth(d.getMonth() - 1);
        if (d.getTime() < startOfMonth(new Date()).getTime()) return;
        state.viewMonth = d;
        renderCalendario();
    });

    el.nextMonth.addEventListener('click', function () {
        var d = new Date(state.viewMonth);
        d.setMonth(d.getMonth() + 1);
        state.viewMonth = d;
        renderCalendario();
    });

    /* ======================================================================
       PANEL 3: HORARIOS (disponibilidad real desde Supabase)
       ====================================================================== */
    function cargarDisponibilidadYRenderizar() {
        el.horarioGrid.innerHTML = '<p class="wizard-loading">Cargando horarios...</p>';

        var idsCanchas = canchasDelDeporte(state.sport);
        state.totalCanchasDeporte = idsCanchas.length;

        sb.from('disponibilidad')
            .select('cancha_id,hora')
            .eq('fecha', state.selectedDate)
            .in('cancha_id', idsCanchas)
            .then(function (result) {
                if (result.error) {
                    el.horarioGrid.innerHTML = '<p class="wizard-error">No pudimos cargar los horarios. Intenta de nuevo.</p>';
                    return;
                }
                var conteo = {};
                (result.data || []).forEach(function (r) {
                    conteo[r.hora] = (conteo[r.hora] || 0) + 1;
                });
                state.ocupadosPorHora = conteo;
                renderHorarios();
            });
    }

    function renderHorarios() {
        el.horarioGrid.innerHTML = '';

        for (var hora = 12; hora < 23; hora++) {
            var ocupadas = state.ocupadosPorHora[hora] || 0;
            var ocupado = ocupadas >= state.totalCanchasDeporte;
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'horario-slot';
            btn.textContent = String(hora).padStart(2, '0') + ':00';

            if (ocupado) {
                btn.disabled = true;
            } else {
                if (hora === state.selectedHour) {
                    btn.classList.add('seleccionado');
                }
                btn.addEventListener('click', function (evtHora) {
                    return function () {
                        state.selectedHour = evtHora;
                        state.precio = getPrecioPorHora(state.sport, evtHora);
                        state.abono = getAbonoPorHora(state.sport, evtHora);
                        renderHorarios();

                        completePanel('horario');
                        el.resumenHorario.textContent = String(evtHora).padStart(2, '0') + ':00';

                        resetDownstreamFrom('horario');
                        unlockPanel('cancha');
                        openPanel('cancha');
                        cargarCanchasDisponiblesYRenderizar();

                        updateSummary();
                    };
                }(hora));
            }

            el.horarioGrid.appendChild(btn);
        }
    }

    /* ======================================================================
       PANEL 4: CANCHA (disponibilidad real desde Supabase)
       ====================================================================== */
    function cargarCanchasDisponiblesYRenderizar() {
        el.canchaGrid.innerHTML = '<p class="wizard-loading">Cargando canchas...</p>';

        var canchasDelSport = state.canchas.filter(function (c) { return c.deporte === state.sport; });
        var idsCanchas = canchasDelSport.map(function (c) { return c.id; });

        sb.from('disponibilidad')
            .select('cancha_id')
            .eq('fecha', state.selectedDate)
            .eq('hora', state.selectedHour)
            .in('cancha_id', idsCanchas)
            .then(function (result) {
                if (result.error) {
                    el.canchaGrid.innerHTML = '<p class="wizard-error">No pudimos cargar las canchas. Intenta de nuevo.</p>';
                    return;
                }
                var ocupadas = (result.data || []).map(function (r) { return r.cancha_id; });
                renderCanchas(canchasDelSport, ocupadas);
            });
    }

    function renderCanchas(canchasDelSport, ocupadas) {
        el.canchaGrid.innerHTML = '';

        if (!canchasDelSport.length) {
            el.canchaGrid.innerHTML = '<p class="wizard-error">No hay canchas configuradas para este deporte.</p>';
            return;
        }

        canchasDelSport.forEach(function (c) {
            var ocupada = ocupadas.indexOf(c.id) !== -1;
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cancha-card';
            btn.innerHTML = '<span class="cancha-nombre">' + c.nombre + '</span>' +
                (c.descripcion ? '<span class="cancha-desc">' + c.descripcion + '</span>' : '');

            if (ocupada) {
                btn.disabled = true;
            } else {
                if (c.id === state.canchaId) btn.classList.add('seleccionada');
                btn.addEventListener('click', function () {
                    state.canchaId = c.id;
                    state.canchaNombre = c.nombre;

                    completePanel('cancha');
                    el.resumenCancha.textContent = c.nombre;

                    resetDownstreamFrom('cancha');
                    unlockPanel('datos');
                    openPanel('datos');

                    updateSummary();
                });
            }

            el.canchaGrid.appendChild(btn);
        });
    }

    /* ======================================================================
       RESUMEN
       ====================================================================== */
    function updateSummary() {
        el.summarySport.textContent = state.sport ? SPORT_LABELS[state.sport] : '—';
        el.summaryFecha.textContent = state.selectedDate ? formatFechaLarga(state.selectedDate) : '—';
        el.summaryHora.textContent = (state.selectedHour !== null && state.selectedHour !== undefined)
            ? String(state.selectedHour).padStart(2, '0') + ':00 - ' + String(state.selectedHour + 1).padStart(2, '0') + ':00'
            : '—';
        el.summaryCancha.textContent = state.canchaNombre || '—';
        el.summaryTotal.textContent = formatCLP(state.precio || 0);
    }

    /* ======================================================================
       PANEL 5: FORMULARIO
       ====================================================================== */
    var campos = {
        nombre: document.getElementById('nombre'),
        rut: document.getElementById('rut'),
        telefono: document.getElementById('telefono'),
        email: document.getElementById('email')
    };
    var errores = {
        nombre: document.getElementById('error-nombre'),
        rut: document.getElementById('error-rut'),
        telefono: document.getElementById('error-telefono'),
        email: document.getElementById('error-email')
    };

    // Si hay una sesión activa, precarga "Tus Datos" con el perfil del
    // usuario logueado para que no tenga que volver a escribirlos.
    function precargarDatosDelPerfil() {
        if (!state.userId) return;

        return sb.from('profiles').select('nombre,documento,telefono,email').eq('id', state.userId).maybeSingle().then(function (result) {
            if (result.error || !result.data) return;
            var perfil = result.data;

            if (perfil.nombre && !campos.nombre.value) campos.nombre.value = perfil.nombre;
            if (perfil.documento && !campos.rut.value) campos.rut.value = formatearRut(perfil.documento);
            if (perfil.telefono && !campos.telefono.value) campos.telefono.value = perfil.telefono;
            if (perfil.email && !campos.email.value) campos.email.value = perfil.email;
        });
    }

    function validarNombre() {
        var valor = campos.nombre.value.trim();
        var ok = valor.length >= 3 && /\s/.test(valor);
        errores.nombre.textContent = ok ? '' : 'Ingresa tu nombre y apellido.';
        campos.nombre.classList.toggle('invalid', !ok);
        return ok;
    }

    function validarRutCampo() {
        var valor = campos.rut.value.trim();
        var ok = valor.length > 0 && validarRut(valor);
        errores.rut.textContent = ok ? '' : 'RUT inválido. Verifica el dígito verificador.';
        campos.rut.classList.toggle('invalid', !ok);
        return ok;
    }

    function validarTelefono() {
        var valor = campos.telefono.value.trim();
        var digitos = valor.replace(/\D/g, '');
        var ok = digitos.length >= 9;
        errores.telefono.textContent = ok ? '' : 'Ingresa un teléfono válido.';
        campos.telefono.classList.toggle('invalid', !ok);
        return ok;
    }

    function validarEmail() {
        var valor = campos.email.value.trim();
        var ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
        errores.email.textContent = ok ? '' : 'Ingresa un email válido.';
        campos.email.classList.toggle('invalid', !ok);
        return ok;
    }

    campos.nombre.addEventListener('blur', validarNombre);
    campos.rut.addEventListener('blur', function () {
        campos.rut.value = formatearRut(campos.rut.value);
        validarRutCampo();
    });
    campos.telefono.addEventListener('blur', validarTelefono);
    campos.email.addEventListener('blur', validarEmail);

    function validarFormularioCompleto() {
        var nombreOk = validarNombre();
        var rutOk = validarRutCampo();
        var telefonoOk = validarTelefono();
        var emailOk = validarEmail();
        return nombreOk && rutOk && telefonoOk && emailOk;
    }

    el.reservaForm.addEventListener('submit', function (evt) {
        evt.preventDefault();
        if (!validarFormularioCompleto()) return;

        completePanel('datos');
        el.resumenDatos.textContent = campos.nombre.value.trim();

        resetDownstreamFrom('datos');
        el.montoOpcionCompleto.textContent = formatCLP(state.precio);
        el.montoOpcionAbono.textContent = formatCLP(state.abono);

        unlockPanel('pago');
        openPanel('pago');
    });

    /* ======================================================================
       PANEL 6: TIPO DE PAGO + MÉTODO DE PAGO
       ====================================================================== */
    document.querySelectorAll('.tipo-pago-card').forEach(function (card) {
        card.addEventListener('click', function () {
            var tipo = card.getAttribute('data-tipo');

            document.querySelectorAll('.tipo-pago-card').forEach(function (c) { c.classList.remove('selected'); });
            card.classList.add('selected');

            state.tipoPago = tipo;
            state.montoAPagar = tipo === 'abono' ? state.abono : state.precio;

            el.resumenPago.textContent = tipo === 'abono' ? 'Abono ' + formatCLP(state.abono) : 'Pago total';

            el.paymentStatus.hidden = true;
            el.paymentConfirmation.hidden = true;
            el.paymentMethodsWrap.hidden = false;
            document.querySelectorAll('.payment-card').forEach(function (c) { c.classList.remove('selected'); c.disabled = false; });
        });
    });

    var paymentCards = document.querySelectorAll('.payment-card');
    paymentCards.forEach(function (card) {
        card.addEventListener('click', function () {
            var metodo = card.getAttribute('data-method');

            paymentCards.forEach(function (c) { c.classList.remove('selected'); });
            card.classList.add('selected');
            paymentCards.forEach(function (c) { c.disabled = true; });

            el.paymentStatus.hidden = false;
            el.paymentStatus.className = 'payment-status';
            el.paymentStatus.textContent = 'Redirigiendo al medio de pago... (' + metodo + ')';

            setTimeout(function () {
                crearReserva(metodo);
            }, 1600);
        });
    });

    function mostrarCanchaOcupada() {
        el.paymentStatus.hidden = false;
        el.paymentStatus.className = 'payment-status error';
        el.paymentStatus.textContent = 'Justo se ocupó esa cancha. Elige otra disponible.';
        paymentCards.forEach(function (c) { c.disabled = false; c.classList.remove('selected'); });

        resetDownstreamFrom('horario');
        unlockPanel('cancha');
        openPanel('cancha');
        updateSummary();
        cargarCanchasDisponiblesYRenderizar();
    }

    function crearReserva(metodo) {
        var reserva = {
            user_id: state.userId,
            cancha_id: state.canchaId,
            fecha: state.selectedDate,
            hora: state.selectedHour,
            precio: state.precio,
            monto_pagado: state.montoAPagar,
            tipo_pago: state.tipoPago,
            nombre_contacto: campos.nombre.value.trim(),
            documento_contacto: campos.rut.value.trim(),
            telefono_contacto: campos.telefono.value.trim(),
            email_contacto: campos.email.value.trim(),
            metodo_pago: metodo
        };

        sb.from('reservas').insert([reserva]).then(function (result) {
            if (result.error) {
                if (result.error.code === '23505') {
                    mostrarCanchaOcupada();
                    return;
                }

                el.paymentStatus.hidden = false;
                el.paymentStatus.className = 'payment-status error';
                el.paymentStatus.textContent = 'No pudimos confirmar tu reserva. Intenta de nuevo.';
                paymentCards.forEach(function (c) { c.disabled = false; });
                return;
            }

            completePanel('pago');

            var saldoPendiente = state.precio - state.montoAPagar;

            el.paymentStatus.hidden = true;
            el.paymentConfirmation.hidden = false;
            el.paymentConfirmation.innerHTML =
                '<h3>¡Reserva confirmada!</h3>' +
                '<p>' + SPORT_LABELS[state.sport] + ' — ' + state.canchaNombre + '</p>' +
                '<p>' + formatFechaLarga(state.selectedDate) + ', ' + String(state.selectedHour).padStart(2, '0') + ':00 hrs</p>' +
                '<p>' + (state.tipoPago === 'abono'
                    ? 'Abono pagado: ' + formatCLP(state.montoAPagar) + ' vía ' + metodo + '. Saldo a pagar en el recinto: ' + formatCLP(saldoPendiente) + '.'
                    : 'Total pagado: ' + formatCLP(state.montoAPagar) + ' vía ' + metodo + '.') + '</p>' +
                '<p>Te enviamos la confirmación a ' + campos.email.value.trim() + '.</p>';
        });
    }

    /* ======================================================================
       ENCABEZADOS DEL ACORDEÓN (permiten reabrir un panel ya completado)
       ====================================================================== */
    document.querySelectorAll('.accordion-header').forEach(function (header) {
        header.addEventListener('click', function () {
            var name = header.getAttribute('data-toggle');
            var panel = panelEl(name);
            if (panel.classList.contains('locked')) return;
            openPanel(panel.classList.contains('open') ? null : name);
        });
    });

    /* ======================================================================
       RESUMEN: en escritorio va en la barra lateral; en móvil se traslada
       dentro del panel de Pago, antes de elegir "Pagar Total" o "Abonar".
       ====================================================================== */
    (function () {
        var resumen = document.querySelector('.wizard-summary');
        var slotEscritorio = resumen.parentNode;
        var slotMovil = document.getElementById('resumenMobileSlot');
        var mq = window.matchMedia('(max-width: 900px)');

        function posicionarResumen(e) {
            if (e.matches) {
                slotMovil.appendChild(resumen);
            } else {
                slotEscritorio.appendChild(resumen);
            }
        }

        posicionarResumen(mq);
        mq.addEventListener('change', posicionarResumen);
    })();

    /* ======================================================================
       INICIALIZACIÓN
       ====================================================================== */
    renderCalendario();
    updateSummary();
    cargarCatalogo();
    obtenerSesionActual();
})();
