(function () {
    'use strict';

    /* ======================================================================
       DATOS: CANCHAS Y PRECIOS
       ====================================================================== */
    var CANCHAS = {
        futbolito: [
            { id: 'F1', nombre: 'Cancha F1', desc: 'Techada, pasto sintético de última generación.' },
            { id: 'F2', nombre: 'Cancha F2', desc: 'Al aire libre, con iluminación LED nocturna.' },
            { id: 'F3', nombre: 'Cancha F3', desc: 'Techada, ideal para partidos nocturnos.' },
            { id: 'F4', nombre: 'Cancha F4', desc: 'Al aire libre, la más amplia del recinto.' },
            { id: 'F5', nombre: 'Cancha F5', desc: 'Techada, con graderías para público.' },
            { id: 'F6', nombre: 'Cancha F6', desc: 'Al aire libre, cercana al kiosco y camarines.' }
        ],
        padel: [
            { id: 'P1', nombre: 'Cancha P1', desc: 'Panorámica, con paredes de vidrio templado.' },
            { id: 'P2', nombre: 'Cancha P2', desc: 'Techada, disponible de día y de noche.' }
        ]
    };

    var SPORT_LABELS = { futbolito: 'Futbolito', padel: 'Pádel' };

    // Precio por hora según deporte y bloque horario (pádel más caro que futbolito)
    function getPrecioPorHora(sport, horaInicio) {
        var tablas = {
            futbolito: [
                { desde: 12, hasta: 18, precio: 27000 },
                { desde: 18, hasta: 20, precio: 32000 },
                { desde: 20, hasta: 23, precio: 37000 }
            ],
            padel: [
                { desde: 12, hasta: 18, precio: 35000 },
                { desde: 18, hasta: 20, precio: 40000 },
                { desde: 20, hasta: 23, precio: 45000 }
            ]
        };
        var tabla = tablas[sport] || tablas.futbolito;
        for (var i = 0; i < tabla.length; i++) {
            if (horaInicio >= tabla[i].desde && horaInicio < tabla[i].hasta) {
                return tabla[i].precio;
            }
        }
        return tabla[0].precio;
    }

    function precioMinimo(sport) {
        return sport === 'padel' ? 35000 : 27000;
    }

    function formatCLP(n) {
        return '$' + n.toLocaleString('es-CL');
    }

    /* ======================================================================
       ESTADO
       ====================================================================== */
    var state = {
        step: 1,
        sport: null,
        canchaId: null,
        canchaNombre: null,
        viewMonth: startOfMonth(new Date()),
        selectedDate: null, // 'YYYY-MM-DD'
        selectedHour: null, // number 8-22
        precio: 0
    };

    var STORAGE_KEY = 'futbolitochile_reservas';

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
       LOCALSTORAGE
       ====================================================================== */
    function getReservas() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function guardarReserva(reserva) {
        var reservas = getReservas();
        reservas.push(reserva);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(reservas));
    }

    /* ======================================================================
       DISPONIBILIDAD (determinística + reservas guardadas)
       ====================================================================== */
    function simpleHash(str) {
        var hash = 5381;
        for (var i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    function slotOcupado(canchaId, fechaISO, hora) {
        var reservas = getReservas();
        var yaReservado = reservas.some(function (r) {
            return r.canchaId === canchaId && r.fecha === fechaISO && r.hora === hora;
        });
        if (yaReservado) return true;

        var hash = simpleHash(canchaId + '-' + fechaISO + '-' + hora);
        return (hash % 100) < 25;
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
        stepsIndicator: document.getElementById('stepsIndicator'),
        canchaSelector: document.getElementById('canchaSelector'),
        canchaGrid: document.getElementById('canchaGrid'),
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
        summaryCancha: document.getElementById('summaryCancha'),
        summaryFecha: document.getElementById('summaryFecha'),
        summaryHora: document.getElementById('summaryHora'),
        summaryTotal: document.getElementById('summaryTotal')
    };

    /* ======================================================================
       PASO 1: DEPORTE Y CANCHA
       ====================================================================== */
    var sportCards = document.querySelectorAll('.sport-card');
    sportCards.forEach(function (card) {
        card.addEventListener('click', function () {
            sportCards.forEach(function (c) { c.classList.remove('selected'); });
            card.classList.add('selected');

            state.sport = card.getAttribute('data-sport');
            state.canchaId = null;
            state.canchaNombre = null;

            renderCanchas();
            el.canchaSelector.hidden = false;
            updateSummary();
            evaluateNextButton();
        });
    });

    function renderCanchas() {
        el.canchaGrid.innerHTML = '';
        var lista = CANCHAS[state.sport] || [];
        lista.forEach(function (cancha) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cancha-card';
            btn.setAttribute('data-cancha', cancha.id);
            btn.innerHTML =
                '<span class="cancha-nombre">' + cancha.nombre + '</span>' +
                '<span class="cancha-desc">' + cancha.desc + '</span>' +
                '<span class="cancha-precio">Desde ' + formatCLP(precioMinimo(state.sport)) + '/hora</span>';

            btn.addEventListener('click', function () {
                document.querySelectorAll('.cancha-card').forEach(function (c) { c.classList.remove('selected'); });
                btn.classList.add('selected');
                state.canchaId = cancha.id;
                state.canchaNombre = cancha.nombre;
                updateSummary();
                evaluateNextButton();
            });

            el.canchaGrid.appendChild(btn);
        });
    }

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
                btn.addEventListener('click', function (evtDate, evtIso) {
                    return function () {
                        state.selectedDate = evtIso;
                        state.selectedHour = null;
                        renderCalendario();
                        renderHorarios();
                        el.horarioSelector.hidden = false;
                        updateSummary();
                        evaluateNextButton();
                    };
                }(date, iso));
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
       PASO 2: HORARIOS
       ====================================================================== */
    function renderHorarios() {
        el.horarioGrid.innerHTML = '';
        if (!state.selectedDate || !state.canchaId) return;

        for (var hora = 12; hora < 23; hora++) {
            var ocupado = slotOcupado(state.canchaId, state.selectedDate, hora);
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
        el.summaryCancha.textContent = state.canchaNombre || '—';
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
       PASO 4: PAGO
       ====================================================================== */
    var paymentCards = document.querySelectorAll('.payment-card');
    paymentCards.forEach(function (card) {
        card.addEventListener('click', function () {
            if (card.classList.contains('procesado')) return;

            paymentCards.forEach(function (c) { c.classList.remove('selected'); });
            card.classList.add('selected');

            var metodo = card.getAttribute('data-method');

            el.paymentStatus.hidden = false;
            el.paymentStatus.textContent = 'Redirigiendo al medio de pago... (' + metodo + ')';

            paymentCards.forEach(function (c) { c.disabled = true; });

            setTimeout(function () {
                var reserva = {
                    id: 'R-' + Date.now(),
                    sport: state.sport,
                    canchaId: state.canchaId,
                    canchaNombre: state.canchaNombre,
                    fecha: state.selectedDate,
                    hora: state.selectedHour,
                    precio: state.precio,
                    nombre: campos.nombre.value.trim(),
                    rut: campos.rut.value.trim(),
                    telefono: campos.telefono.value.trim(),
                    email: campos.email.value.trim(),
                    metodoPago: metodo,
                    creadaEn: new Date().toISOString()
                };
                guardarReserva(reserva);

                el.paymentStatus.hidden = true;
                el.paymentConfirmation.hidden = false;
                el.paymentConfirmation.innerHTML =
                    '<h3>¡Reserva confirmada!</h3>' +
                    '<p>' + SPORT_LABELS[state.sport] + ' — ' + state.canchaNombre + '</p>' +
                    '<p>' + formatFechaLarga(state.selectedDate) + ', ' + String(state.selectedHour).padStart(2, '0') + ':00 hrs</p>' +
                    '<p>Total pagado: ' + formatCLP(state.precio) + ' vía ' + metodo + '</p>' +
                    '<p>Te enviamos la confirmación a ' + campos.email.value.trim() + '.</p>';

                el.btnBack.hidden = true;
                el.btnNext.hidden = true;
            }, 1600);
        }, { once: false });
    });

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
            ok = !!(state.sport && state.canchaId);
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
})();
