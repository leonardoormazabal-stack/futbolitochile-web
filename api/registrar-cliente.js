/* ============================================================================
   Se llama desde reservas.js justo antes de guardar una reserva, solo cuando
   el RUT que escribió el cliente no coincide con ninguna cuenta existente
   (ver api/cliente-por-rut.js). Crea la cuenta automáticamente:

     usuario: su correo
     clave:   los primeros 6 dígitos de su RUT

   y le envía un correo de bienvenida con esas credenciales. También reasigna
   a esta cuenta nueva cualquier reserva que haya hecho antes como invitado
   con el mismo RUT, para que su historial completo aparezca en
   "Mis Reservas" desde el primer login.

   Si algo falla acá (RUT inválido, email ya usado por otra cuenta, correo no
   configurado, etc.) responde 200 con ok:false: reservas.js debe seguir
   adelante guardando la reserva como invitado, nunca bloquearla por esto.
   ============================================================================ */

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const { enviarCorreo, getTransporter } = require('../lib/mailer');

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function limpiarRut(rut) {
    return String(rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
}

function validarRut(rutCompleto) {
    const limpio = limpiarRut(rutCompleto);
    if (limpio.length < 2) return false;

    const cuerpo = limpio.slice(0, -1);
    const dv = limpio.slice(-1);
    if (!/^\d+$/.test(cuerpo)) return false;

    let suma = 0;
    let multiplo = 2;
    for (let i = cuerpo.length - 1; i >= 0; i--) {
        suma += parseInt(cuerpo.charAt(i), 10) * multiplo;
        multiplo = multiplo < 7 ? multiplo + 1 : 2;
    }
    const resto = 11 - (suma % 11);
    let dvEsperado;
    if (resto === 11) dvEsperado = '0';
    else if (resto === 10) dvEsperado = 'K';
    else dvEsperado = String(resto);

    return dv === dvEsperado;
}

function formatearRut(rut) {
    const limpio = limpiarRut(rut);
    if (limpio.length < 2) return limpio;
    const cuerpo = limpio.slice(0, -1);
    const dv = limpio.slice(-1);
    let cuerpoFormateado = '';
    for (let i = 0; i < cuerpo.length; i++) {
        const posDesdeFinal = cuerpo.length - i;
        cuerpoFormateado += cuerpo.charAt(i);
        if (posDesdeFinal > 1 && (posDesdeFinal - 1) % 3 === 0) {
            cuerpoFormateado += '.';
        }
    }
    return cuerpoFormateado + '-' + dv;
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Método no permitido.' });
        return;
    }

    const body = req.body || {};
    const nombre = (body.nombre || '').trim();
    const email = (body.email || '').trim();
    const telefono = (body.telefono || '').trim();
    const rutInput = (body.rut || '').trim();

    if (!nombre || !email || !validarRut(rutInput)) {
        res.status(200).json({ ok: false, error: 'Faltan datos válidos (nombre, RUT, email).' });
        return;
    }

    const documento = formatearRut(rutInput);
    const clave = limpiarRut(rutInput).slice(0, 6);

    let supabaseAdmin;
    try {
        supabaseAdmin = getSupabaseAdmin();
    } catch (err) {
        res.status(200).json({ ok: false, error: err.message });
        return;
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: clave,
        email_confirm: true,
        user_metadata: {
            nombre: nombre,
            tipo_documento: 'rut',
            documento: documento,
            telefono: telefono
        }
    });

    if (createError) {
        res.status(200).json({ ok: false, error: createError.message });
        return;
    }

    const userId = created.user.id;

    // Reservas hechas como invitado antes de tener cuenta, con el mismo
    // RUT: quedan enlazadas a la cuenta nueva para que aparezcan en su
    // historial. No es crítico para la reserva actual, así que un error acá
    // no debe hacer fallar la respuesta.
    try {
        await supabaseAdmin
            .from('reservas')
            .update({ user_id: userId })
            .eq('documento_contacto', documento)
            .is('user_id', null);
    } catch (err) {
        // No bloquea: la cuenta ya quedó creada.
    }

    if (getTransporter()) {
        try {
            await enviarCorreo({
                to: [email],
                subject: 'Bienvenido a Futbolito Chile — tu acceso',
                html:
                    '<p>Hola ' + escapeHtml(nombre) + ',</p>' +
                    '<p>Creamos tu cuenta en Futbolito Chile. Iniciando sesión puedes:</p>' +
                    '<ul>' +
                    '<li>Ver tus reservas, pasadas y futuras</li>' +
                    '<li>Cancelarlas o editar tus datos de contacto cuando quieras</li>' +
                    '<li>Acceder a descuentos y promociones exclusivas</li>' +
                    '</ul>' +
                    '<p><strong>Usuario:</strong> ' + escapeHtml(email) + '<br>' +
                    '<strong>Clave:</strong> ' + escapeHtml(clave) + '</p>' +
                    '<p><a href="https://futbolitochile.cl/login.html">Inicia sesión aquí</a>. Te recomendamos cambiar tu clave por una propia una vez que ingreses.</p>'
            });
        } catch (err) {
            // El correo es un extra: la cuenta ya quedó creada igual.
        }
    }

    res.status(200).json({ ok: true, userId: userId });
};
