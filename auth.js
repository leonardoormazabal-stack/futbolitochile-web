(function () {
    'use strict';

    var sb = window.sbClient;

    /* ======================================================================
       VALIDACIÓN DE RUT CHILENO (validación en el cliente antes de enviar)
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
        var adminSlot = document.getElementById('navAdminItem');

        sb.auth.getSession().then(function (result) {
            var session = result.data.session;

            if (session) {
                if (slot) {
                    slot.innerHTML =
                        '<a href="#" id="logoutLink" class="nav-login-btn nav-logged-in" title="Cerrar sesión">Logueado</a>';

                    var logoutLink = document.getElementById('logoutLink');
                    if (logoutLink) {
                        logoutLink.addEventListener('click', function (e) {
                            e.preventDefault();
                            sb.auth.signOut().then(function () {
                                window.location.href = 'index.html';
                            });
                        });
                    }
                }

                if (adminSlot) {
                    sb.from('profiles').select('rol').eq('id', session.user.id).single().then(function (res) {
                        var rol = res.data && res.data.rol;
                        adminSlot.hidden = !(rol === 'administrador' || rol === 'superadministrador');
                    });
                }
            } else {
                if (slot) {
                    slot.innerHTML = '<a href="login.html" class="nav-login-btn">Iniciar Sesión</a>';
                }
                if (adminSlot) {
                    adminSlot.hidden = true;
                }
            }
        });
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
        var submitBtn = form.querySelector('button[type="submit"]');

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            errorBox.hidden = true;
            submitBtn.disabled = true;

            sb.auth.signInWithPassword({
                email: emailInput.value.trim(),
                password: passwordInput.value
            }).then(function (result) {
                submitBtn.disabled = false;
                if (result.error) {
                    errorBox.textContent = 'Correo o contraseña incorrectos.';
                    errorBox.className = 'auth-alert';
                    errorBox.hidden = false;
                    return;
                }
                window.location.href = 'index.html';
            });
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
        var submitBtn = form.querySelector('button[type="submit"]');

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
            var ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
            errores.email.textContent = ok ? '' : 'Ingresa un email válido.';
            campos.email.classList.toggle('invalid', !ok);
            return ok;
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

            errorBox.hidden = true;

            if (!(nombreOk && documentoOk && telefonoOk && emailOk && passwordOk && password2Ok)) {
                errorBox.textContent = 'Revisa los campos marcados en rojo.';
                errorBox.className = 'auth-alert';
                errorBox.hidden = false;
                return;
            }

            submitBtn.disabled = true;

            sb.auth.signUp({
                email: campos.email.value.trim(),
                password: campos.password.value,
                options: {
                    data: {
                        nombre: campos.nombre.value.trim(),
                        tipo_documento: tipoDocumentoActual(),
                        documento: campos.documento.value.trim(),
                        telefono: campos.telefono.value.trim()
                    }
                }
            }).then(function (result) {
                submitBtn.disabled = false;

                if (result.error) {
                    var msg = result.error.message || '';
                    if (/already registered|already exists|already in use/i.test(msg)) {
                        errores.email.textContent = 'Ya existe una cuenta con este correo.';
                        campos.email.classList.add('invalid');
                    } else {
                        errorBox.textContent = 'No pudimos crear tu cuenta: ' + msg;
                        errorBox.className = 'auth-alert';
                        errorBox.hidden = false;
                    }
                    return;
                }

                if (result.data.session) {
                    // Confirmación de correo desactivada: queda con sesión iniciada.
                    window.location.href = 'index.html';
                } else {
                    // Confirmación de correo activada: falta que confirme el email.
                    errorBox.textContent = '¡Cuenta creada! Revisa tu correo (' + campos.email.value.trim() + ') para confirmar tu cuenta antes de iniciar sesión.';
                    errorBox.className = 'auth-alert success';
                    errorBox.hidden = false;
                    form.reset();
                }
            });
        });
    }

    /* ======================================================================
       CONTROL DE ACCESO PARA PÁGINAS SOLO-ADMIN (admin.html la usa)
       Devuelve una Promise que resuelve con {session, rol, nombre} si el
       usuario es administrador/superadministrador, o redirige y no resuelve.
       ====================================================================== */
    function requireAdmin() {
        return sb.auth.getSession().then(function (result) {
            var session = result.data.session;
            if (!session) {
                window.location.href = 'login.html';
                return null;
            }
            return sb.from('profiles').select('rol,nombre').eq('id', session.user.id).single().then(function (res) {
                var rol = res.data && res.data.rol;
                if (rol !== 'administrador' && rol !== 'superadministrador') {
                    window.location.href = 'index.html';
                    return null;
                }
                return { session: session, rol: rol, nombre: res.data.nombre };
            });
        });
    }

    /* ======================================================================
       MENÚ MÓVIL: cerrarlo al hacer clic en cualquier link (incluye los
       inyectados dinámicamente como "Logueado"/"Cerrar Sesión", gracias a
       la delegación de eventos sobre el contenedor).
       ====================================================================== */
    function initCierreMenuMovil() {
        var toggle = document.getElementById('menu-toggle');
        var navLinks = document.querySelector('.nav-menu');
        if (!toggle || !navLinks) return;

        navLinks.addEventListener('click', function (e) {
            if (e.target.tagName === 'A') {
                toggle.checked = false;
            }
        });
    }

    /* ======================================================================
       INICIALIZACIÓN
       ====================================================================== */
    renderNavAuth();
    initLoginForm();
    initRegistroForm();
    initCierreMenuMovil();

    window.FutbolitoAuth = {
        validarRut: validarRut,
        validarPasaporte: validarPasaporte,
        formatearRut: formatearRut,
        requireAdmin: requireAdmin
    };
})();
