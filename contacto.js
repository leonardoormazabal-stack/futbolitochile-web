(function () {
    'use strict';

    var form = document.getElementById('contactoForm');
    if (!form) return;

    var campos = {
        nombre: document.getElementById('nombre'),
        email: document.getElementById('email'),
        telefono: document.getElementById('telefono'),
        mensaje: document.getElementById('mensaje')
    };
    var errores = {
        nombre: document.getElementById('error-nombre'),
        email: document.getElementById('error-email'),
        telefono: document.getElementById('error-telefono'),
        mensaje: document.getElementById('error-mensaje')
    };
    var errorBox = document.getElementById('contactoError');
    var submitBtn = document.getElementById('btnEnviarContacto');

    function validarNombre() {
        var ok = campos.nombre.value.trim().length >= 3;
        errores.nombre.textContent = ok ? '' : 'Ingresa tu nombre.';
        campos.nombre.classList.toggle('invalid', !ok);
        return ok;
    }

    function validarEmail() {
        var ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(campos.email.value.trim());
        errores.email.textContent = ok ? '' : 'Ingresa un correo válido.';
        campos.email.classList.toggle('invalid', !ok);
        return ok;
    }

    function validarTelefono() {
        var digitos = campos.telefono.value.replace(/\D/g, '');
        var ok = digitos.length >= 9;
        errores.telefono.textContent = ok ? '' : 'Ingresa un teléfono válido.';
        campos.telefono.classList.toggle('invalid', !ok);
        return ok;
    }

    function validarMensaje() {
        var ok = campos.mensaje.value.trim().length >= 10;
        errores.mensaje.textContent = ok ? '' : 'Cuéntanos un poco más (mínimo 10 caracteres).';
        campos.mensaje.classList.toggle('invalid', !ok);
        return ok;
    }

    campos.nombre.addEventListener('blur', validarNombre);
    campos.email.addEventListener('blur', validarEmail);
    campos.telefono.addEventListener('blur', validarTelefono);
    campos.mensaje.addEventListener('blur', validarMensaje);

    form.addEventListener('submit', function (e) {
        e.preventDefault();

        var nombreOk = validarNombre();
        var emailOk = validarEmail();
        var telefonoOk = validarTelefono();
        var mensajeOk = validarMensaje();

        errorBox.hidden = true;

        if (!(nombreOk && emailOk && telefonoOk && mensajeOk)) {
            errorBox.textContent = 'Revisa los campos marcados en rojo.';
            errorBox.className = 'auth-alert';
            errorBox.hidden = false;
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando...';

        fetch('/api/contacto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nombre: campos.nombre.value.trim(),
                email: campos.email.value.trim(),
                telefono: campos.telefono.value.trim(),
                mensaje: campos.mensaje.value.trim()
            })
        }).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                return { ok: res.ok, data: data };
            });
        }).then(function (result) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Enviar Mensaje';

            if (!result.ok) {
                errorBox.textContent = (result.data && result.data.error) || 'No pudimos enviar tu mensaje. Intenta más tarde.';
                errorBox.className = 'auth-alert';
                errorBox.hidden = false;
                return;
            }

            errorBox.textContent = '¡Gracias! Recibimos tu mensaje y te responderemos a la brevedad.';
            errorBox.className = 'auth-alert success';
            errorBox.hidden = false;
            form.reset();
        }).catch(function () {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Enviar Mensaje';
            errorBox.textContent = 'No pudimos enviar tu mensaje. Revisa tu conexión e intenta de nuevo.';
            errorBox.className = 'auth-alert';
            errorBox.hidden = false;
        });
    });
})();
