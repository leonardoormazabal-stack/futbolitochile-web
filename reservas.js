(function () {
    'use strict';

    var sb = window.sbClient;

    var SPORT_LABELS = { futbolito: 'Futbolito', padel: 'Pádel' };

    function formatCLP(n) {
        return '$' + n.toLocaleString('es-CL');
    }

    /* ======================================================================
       ESTADO
       ====================================================================== */
    var state = {
        step: 1,
        sport: null,
        canchaId: null,      // se define recién al pagar (asignación automática)
        canchaNombre: null,
        viewMonth: startOfMonth(new Date()),
        selectedDate: null, // 'YYYY-MM-DD'
        selectedHour: null, // number 12-22
        precio: 0,
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
        horarioSelector: document.getElementById('horarioSelector'),
        horarioGrid: document.getElementById('horarioGrid'),
        reservaForm: document.getElementById('reservaForm'),
        btnBack: document.getElementById('btnBack'),
        btnNext: document.getElementById('btnNext'),
        paymentStatus: document.getElementById('paymentStatus'),
        paymentConfirmation: document.getElementById('paymentConfirmation'),
        summarySport: document.getElementById('summarySport'),
        summaryFecha: document.getElementById('summaryFecha'),
        summaryHora: document.getElementById('summaryHora'),
        summaryTotal: document.getElementById('summaryTotal')
    };

    /* ======================================================================
       CARGA DE CATÁLOGO (canchas + tarifas) DESDE SUPABASE
       ====================================================================== */
    function cargarCatalogo() {
        return Promise.all([
            sb.from('canchas').select('id,nombre,deporte,descripcion'),
            sb.from('tarifas').select('deporte,hora_desde,hora_hasta,precio')
        ]).then(function (resultados) {
            var canchasRes = resultados[0];
            var tarifasRes = resultados[1];

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
        });
    }

    function obtenerSesionActual() {
        return sb.auth.getSession().then(function (result) {
            var session = result.data.session;
            state.userId = session ? session.user.id : null;
        });
    }

    function canchasDelDeporte(sport) {
        return state.canchas.filter(function (c) { return c.deporte === sport; }).map(function (c) { return c.id; });
    }

    /* ======================================================================
       PASO 1: DEPORTE
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

            // Si ya había una fecha elegida, la disponibilidad depende del
            // deporte, así que hay que recalcularla.
            if (state.selectedDate) {
                state.selectedHour = null;
                state.precio = 0;
                cargarDisponibilidadYRenderizar();
            }

            updateSummary();
            evaluateNextButton();
        });
    });

    /* ======================================================================
       PASO 2: CALENDARIO
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
                        state.selectedHour = null;
                        renderCalendario();
                        el.horarioSelector.hidden = false;
                        cargarDisponibilidadYRenderizar();
                        updateSummary();
                        evaluateNextButton();
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
       PASO 2: HORARIOS (disponibilidad real desde Supabase)
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
                        renderHorarios();
                        updateSummary();
                        evaluateNextButton();
                    };
                }(hora));
            }

            el.horarioGrid.appendChild(btn);
        }
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
        el.summaryTotal.textContent = formatCLP(state.precio || 0);
    }

    /* ======================================================================
       PASO 3: FORMULARIO
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

    /* ======================================================================
       PASO 4: PAGO Y GUARDADO DE LA RESERVA EN SUPABASE
       ====================================================================== */
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

    // Busca, entre las canchas del deporte elegido, una que esté libre en la
    // fecha/hora seleccionadas. Devuelve el objeto {id, nombre} o null si
    // ya no queda ninguna disponible.
    function obtenerCanchaLibre() {
        var idsCanchas = canchasDelDeporte(state.sport);

        return sb.from('disponibilidad')
            .select('cancha_id')
            .eq('fecha', state.selectedDate)
            .eq('hora', state.selectedHour)
            .in('cancha_id', idsCanchas)
            .then(function (result) {
                if (result.error) return null;

                var ocupadas = (result.data || []).map(function (r) { return r.cancha_id; });
                var libres = idsCanchas.filter(function (id) { return ocupadas.indexOf(id) === -1; });
                if (!libres.length) return null;

                var canchaId = libres[0];
                var cancha = state.canchas.find(function (c) { return c.id === canchaId; });
                return cancha || { id: canchaId, nombre: canchaId };
            });
    }

    function mostrarHorarioOcupado() {
        el.paymentStatus.hidden = false;
        el.paymentStatus.className = 'payment-status error';
        el.paymentStatus.textContent = 'Justo se ocuparon todas las canchas de ese horario. Vuelve a elegir uno disponible.';
        paymentCards.forEach(function (c) { c.disabled = false; c.classList.remove('selected'); });

        state.selectedHour = null;
        state.precio = 0;
        updateSummary();
        goToStep(2);
        cargarDisponibilidadYRenderizar();
    }

    function crearReserva(metodo, intentosRestantes) {
        if (intentosRestantes === undefined) intentosRestantes = state.totalCanchasDeporte;

        obtenerCanchaLibre().then(function (cancha) {
            if (!cancha) {
                mostrarHorarioOcupado();
                return;
            }

            var reserva = {
                user_id: state.userId,
                cancha_id: cancha.id,
                fecha: state.selectedDate,
                hora: state.selectedHour,
                precio: state.precio,
                nombre_contacto: campos.nombre.value.trim(),
                documento_contacto: campos.rut.value.trim(),
                telefono_contacto: campos.telefono.value.trim(),
                email_contacto: campos.email.value.trim(),
                metodo_pago: metodo
            };

            sb.from('reservas').insert([reserva]).then(function (result) {
                if (result.error) {
                    if (result.error.code === '23505' && intentosRestantes > 1) {
                        // Alguien tomó esa cancha justo antes que nosotros: probamos con otra.
                        crearReserva(metodo, intentosRestantes - 1);
                        return;
                    }
                    if (result.error.code === '23505') {
                        mostrarHorarioOcupado();
                        return;
                    }

                    el.paymentStatus.hidden = false;
                    el.paymentStatus.className = 'payment-status error';
                    el.paymentStatus.textContent = 'No pudimos confirmar tu reserva. Intenta de nuevo.';
                    paymentCards.forEach(function (c) { c.disabled = false; });
                    return;
                }

                state.canchaId = cancha.id;
                state.canchaNombre = cancha.nombre;

                el.paymentStatus.hidden = true;
                el.paymentConfirmation.hidden = false;
                el.paymentConfirmation.innerHTML =
                    '<h3>¡Reserva confirmada!</h3>' +
                    '<p>' + SPORT_LABELS[state.sport] + ' — ' + cancha.nombre + '</p>' +
                    '<p>' + formatFechaLarga(state.selectedDate) + ', ' + String(state.selectedHour).padStart(2, '0') + ':00 hrs</p>' +
                    '<p>Total pagado: ' + formatCLP(state.precio) + ' vía ' + metodo + '</p>' +
                    '<p>Te enviamos la confirmación a ' + campos.email.value.trim() + '.</p>';

                el.btnBack.hidden = true;
                el.btnNext.hidden = true;
            });
        });
    }

    /* ======================================================================
       NAVEGACIÓN DEL WIZARD
       ====================================================================== */
    function goToStep(n) {
        state.step = n;

        document.querySelectorAll('.wizard-step').forEach(function (s) {
            s.classList.toggle('active', s.id === 'step-' + n);
        });

        document.querySelectorAll('.step-indicator').forEach(function (s) {
            var stepNum = parseInt(s.getAttribute('data-step'), 10);
            s.classList.toggle('active', stepNum === n);
            s.classList.toggle('completed', stepNum < n);
        });

        el.btnBack.hidden = n === 1;
        el.btnNext.hidden = n === 4;

        evaluateNextButton();

        window.scrollTo({ top: document.querySelector('.wizard-page').offsetTop - 20, behavior: 'smooth' });
    }

    function evaluateNextButton() {
        var ok = false;
        if (state.step === 1) {
            ok = !!state.sport;
        } else if (state.step === 2) {
            ok = !!(state.selectedDate && (state.selectedHour !== null && state.selectedHour !== undefined));
        } else if (state.step === 3) {
            ok = campos.nombre.value.trim() !== '' &&
                campos.rut.value.trim() !== '' &&
                campos.telefono.value.trim() !== '' &&
                campos.email.value.trim() !== '';
        }
        el.btnNext.disabled = !ok;
    }

    ['input', 'change'].forEach(function (evt) {
        Object.keys(campos).forEach(function (key) {
            campos[key].addEventListener(evt, evaluateNextButton);
        });
    });

    el.btnNext.addEventListener('click', function () {
        if (state.step === 3) {
            if (!validarFormularioCompleto()) {
                evaluateNextButton();
                return;
            }
        }
        if (state.step < 4) {
            goToStep(state.step + 1);
        }
    });

    el.btnBack.addEventListener('click', function () {
        if (state.step > 1) {
            goToStep(state.step - 1);
        }
    });

    /* ======================================================================
       INICIALIZACIÓN
       ====================================================================== */
    renderCalendario();
    updateSummary();
    evaluateNextButton();
    cargarCatalogo();
    obtenerSesionActual();
})();
