(function () {
    'use strict';

    /* ======================================================================
       ADVERTENCIA
       Este módulo NO es seguro: las contraseñas se guardan en texto plano
       en localStorage porque todavía no existe backend. Es solo para
       maquetar el flujo de login/registro. Debe reemplazarse por
       Supabase Auth (con hashing y sesiones reales) antes de producción.
       ====================================================================== */

    var USERS_KEY = 'futbolitochile_usuarios';
    var SESSION_KEY = 'futbolitochile_sesion';

    /* ======================================================================
       ALMACENAMIENTO
       ====================================================================== */
    function getUsuarios() {
        try {
            var raw = localStorage.getItem(USERS_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function guardarUsuarios(usuarios) {
        localStorage.setItem(USERS_KEY, JSON.stringify(usuarios));
    }

    function getSesion() {
        try {
            var raw = localStorage.getItem(SESSION_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function setSesion(usuario) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
            nombre: usuario.nombre,
            email: usuario.email,
            rol: usuario.rol
        }));
    }

    function cerrarSesion() {
        localStorage.removeItem(SESSION_KEY);
    }

    function seedUsuarios() {
        var usuarios = getUsuarios();
        var cambiado = false;

        if (!usuarios.some(function (u) { return u.rol === 'administrador'; })) {
            usuarios.push({
                nombre: 'Administrador',
                documento: '',
                tipoDocumento: '',
                telefono: '',
                email: 'admin@futbolitochile.cl',
                password: 'admin123',
                rol: 'administrador'
            });
            cambiado = true;
        }

        if (!usuarios.some(function (u) { return u.rol === 'superadministrador'; })) {
            usuarios.push({
                nombre: 'Super Administrador',
                documento: '',
                tipoDocumento: '',
                telefono: '',
                email: 'superadmin@futbolitochile.cl',
                password: 'super123',
                rol: 'superadministrador'
            });
            cambiado = true;
        }

        if (cambiado) guardarUsuarios(usuarios);
    }

    /* ======================================================================
       VALIDACIÓN DE RUT CHILENO (mismo algoritmo que reservas.js)
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

    function validarPasaporte(valor) {
        return /^[A-Za-z0-9]{5,15}$/.test(valor.trim());
    }

    /* ======================================================================
       NAV: LOGIN / SESIÓN
       ====================================================================== */
    function renderNavAuth() {
        var slot = document.getElementById('navAuthItem');
        if (!slot) return;

        var sesion = getSesion();

        if (sesion) {
            slot.innerHTML =
                '<a href="#" id="logoutLink" class="nav-login-btn nav-logged-in" title="Cerrar sesión">Logueado</a>';

            var logoutLink = document.getElementById('logoutLink');
            if (logoutLink) {
                logoutLink.addEventListener('click', function (e) {
                    e.preventDefault();
                    cerrarSesion();
                    window.location.href = 'index.html';
                });
            }
        } else {
            slot.innerHTML = '<a href="login.html" class="nav-login-btn">Iniciar Sesión</a>';
        }
    }

    /* ======================================================================
       FORMULARIO DE LOGIN (si existe en la página)
       ====================================================================== */
    function initLoginForm() {
        var form = document.getElementById('loginForm');
        if (!form) return;

        var emailInput = document.getElementById('email');
        var passwordInput = document.getElementById('password');
        var errorBox = document.getElementById('loginError');

        form.addEventListener('submit', function (e) {
            e.preventDefault();

            var email = emailInput.value.trim().toLowerCase();
            var password = passwordInput.value;

            var usuarios = getUsuarios();
            var usuario = usuarios.find(function (u) {
                return u.email.toLowerCase() === email && u.password === password;
            });

            if (!usuario) {
                errorBox.textContent = 'Correo o contraseña incorrectos.';
                errorBox.hidden = false;
                errorBox.className = 'auth-alert';
                return;
            }

            setSesion(usuario);
            window.location.href = 'index.html';
        });
    }

    /* ======================================================================
       FORMULARIO DE REGISTRO (si existe en la página)
       ====================================================================== */
    function initRegistroForm() {
        var form = document.getElementById('registroForm');
        if (!form) return;

        var campos = {
            nombre: document.getElementById('nombre'),
            documento: document.getElementById('documento'),
            telefono: document.getElementById('telefono'),
            email: document.getElementById('email'),
            password: document.getElementById('password'),
            password2: document.getElementById('password2')
        };
        var errores = {
            nombre: document.getElementById('error-nombre'),
            documento: document.getElementById('error-documento'),
            telefono: document.getElementById('error-telefono'),
            email: document.getElementById('error-email'),
            password: document.getElementById('error-password'),
            password2: document.getElementById('error-password2')
        };
        var errorBox = document.getElementById('registroError');
        var labelDocumento = document.getElementById('labelDocumento');
        var radiosTipoDocumento = document.querySelectorAll('input[name="tipoDocumento"]');

        function tipoDocumentoActual() {
            var seleccionado = document.querySelector('input[name="tipoDocumento"]:checked');
            return seleccionado ? seleccionado.value : 'rut';
        }

        function actualizarPlaceholderDocumento() {
            if (tipoDocumentoActual() === 'rut') {
                labelDocumento.textContent = 'RUT';
                campos.documento.placeholder = '12.345.678-9';
            } else {
                labelDocumento.textContent = 'Pasaporte';
                campos.documento.placeholder = 'AB123456';
            }
            errores.documento.textContent = '';
            campos.documento.classList.remove('invalid');
        }

        radiosTipoDocumento.forEach(function (radio) {
            radio.addEventListener('change', actualizarPlaceholderDocumento);
        });

        function validarNombre() {
            var valor = campos.nombre.value.trim();
            var ok = valor.length >= 3 && /\s/.test(valor);
            errores.nombre.textContent = ok ? '' : 'Ingresa tu nombre y apellido.';
            campos.nombre.classList.toggle('invalid', !ok);
            return ok;
        }

        function validarDocumento() {
            var valor = campos.documento.value.trim();
            var ok;
            if (tipoDocumentoActual() === 'rut') {
                ok = valor.length > 0 && validarRut(valor);
                errores.documento.textContent = ok ? '' : 'RUT inválido. Verifica el dígito verificador.';
            } else {
                ok = validarPasaporte(valor);
                errores.documento.textContent = ok ? '' : 'Pasaporte inválido (5 a 15 caracteres alfanuméricos).';
            }
            campos.documento.classList.toggle('invalid', !ok);
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
            var formatoOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
            if (!formatoOk) {
                errores.email.textContent = 'Ingresa un email válido.';
                campos.email.classList.add('invalid');
                return false;
            }
            var yaExiste = getUsuarios().some(function (u) {
                return u.email.toLowerCase() === valor.toLowerCase();
            });
            if (yaExiste) {
                errores.email.textContent = 'Ya existe una cuenta con este correo.';
                campos.email.classList.add('invalid');
                return false;
            }
            errores.email.textContent = '';
            campos.email.classList.remove('invalid');
            return true;
        }

        function validarPassword() {
            var valor = campos.password.value;
            var ok = valor.length >= 6;
            errores.password.textContent = ok ? '' : 'Mínimo 6 caracteres.';
            campos.password.classList.toggle('invalid', !ok);
            return ok;
        }

        function validarPassword2() {
            var ok = campos.password2.value.length > 0 && campos.password2.value === campos.password.value;
            errores.password2.textContent = ok ? '' : 'Las contraseñas no coinciden.';
            campos.password2.classList.toggle('invalid', !ok);
            return ok;
        }

        campos.nombre.addEventListener('blur', validarNombre);
        campos.documento.addEventListener('blur', function () {
            if (tipoDocumentoActual() === 'rut') {
                campos.documento.value = formatearRut(campos.documento.value);
            }
            validarDocumento();
        });
        campos.telefono.addEventListener('blur', validarTelefono);
        campos.email.addEventListener('blur', validarEmail);
        campos.password.addEventListener('blur', validarPassword);
        campos.password2.addEventListener('blur', validarPassword2);

        form.addEventListener('submit', function (e) {
            e.preventDefault();

            var nombreOk = validarNombre();
            var documentoOk = validarDocumento();
            var telefonoOk = validarTelefono();
            var emailOk = validarEmail();
            var passwordOk = validarPassword();
            var password2Ok = validarPassword2();

            if (!(nombreOk && documentoOk && telefonoOk && emailOk && passwordOk && password2Ok)) {
                errorBox.textContent = 'Revisa los campos marcados en rojo.';
                errorBox.hidden = false;
                errorBox.className = 'auth-alert';
                return;
            }

            var nuevoUsuario = {
                nombre: campos.nombre.value.trim(),
                documento: campos.documento.value.trim(),
                tipoDocumento: tipoDocumentoActual(),
                telefono: campos.telefono.value.trim(),
                email: campos.email.value.trim(),
                password: campos.password.value,
                rol: 'jugador',
                creadoEn: new Date().toISOString()
            };

            var usuarios = getUsuarios();
            usuarios.push(nuevoUsuario);
            guardarUsuarios(usuarios);
            setSesion(nuevoUsuario);

            window.location.href = 'index.html';
        });
    }

    /* ======================================================================
       INICIALIZACIÓN
       ====================================================================== */
    seedUsuarios();
    renderNavAuth();
    initLoginForm();
    initRegistroForm();

    window.FutbolitoAuth = {
        getUsuarios: getUsuarios,
        getSesion: getSesion,
        cerrarSesion: cerrarSesion,
        validarRut: validarRut,
        validarPasaporte: validarPasaporte
    };
})();
