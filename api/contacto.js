/* ============================================================================
   Envía el formulario de contacto por correo usando el SMTP de Google
   Workspace (ver lib/mailer.js). Requiere GMAIL_USER y GMAIL_APP_PASSWORD
   en Vercel; mientras no estén configuradas, responde con un error claro en
   vez de fallar de forma silenciosa.

   - CONTACTO_EMAIL_DESTINO  (opcional) a quién llega el mensaje.
                              Por defecto: contacto@futbolitochile.cl
   ============================================================================ */

const { enviarCorreo, getTransporter } = require('../lib/mailer');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
    const mensaje = (body.mensaje || '').trim();

    if (!nombre || !email || !telefono || !mensaje) {
        res.status(400).json({ error: 'Completa todos los campos.' });
        return;
    }
    if (!EMAIL_REGEX.test(email)) {
        res.status(400).json({ error: 'Ingresa un correo válido.' });
        return;
    }

    if (!getTransporter()) {
        res.status(500).json({
            error: 'El envío de correos no está configurado todavía. Escríbenos directamente a contacto@futbolitochile.cl.'
        });
        return;
    }

    const destino = process.env.CONTACTO_EMAIL_DESTINO || 'contacto@futbolitochile.cl';

    const cuerpoHtml =
        '<p><strong>Nombre:</strong> ' + escapeHtml(nombre) + '</p>' +
        '<p><strong>Correo:</strong> ' + escapeHtml(email) + '</p>' +
        '<p><strong>Teléfono:</strong> ' + escapeHtml(telefono) + '</p>' +
        '<p><strong>Mensaje:</strong></p>' +
        '<p>' + escapeHtml(mensaje).replace(/\n/g, '<br>') + '</p>';

    try {
        await enviarCorreo({
            to: [destino],
            cc: [email],
            replyTo: email,
            subject: 'Nuevo mensaje de contacto — ' + nombre,
            html: cuerpoHtml
        });

        res.status(200).json({ ok: true });
    } catch (err) {
        res.status(502).json({ error: 'No pudimos enviar tu mensaje: ' + err.message });
    }
};
