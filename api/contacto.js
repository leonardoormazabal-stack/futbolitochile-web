/* ============================================================================
   Envía el formulario de contacto por correo usando la API de Resend
   (https://resend.com). Requiere estas variables de entorno en Vercel:

   - RESEND_API_KEY            API key de Resend.
   - CONTACTO_EMAIL_REMITENTE  Remitente verificado en Resend,
                                ej: "Futbolito Chile <contacto@futbolitochile.cl>"
                                (el dominio debe estar verificado en Resend).
   - CONTACTO_EMAIL_DESTINO    (opcional) a quién llega el mensaje.
                                Por defecto: contacto@futbolitochile.cl

   Mientras estas variables no estén configuradas, el endpoint responde con
   un error claro en vez de fallar de forma silenciosa.
   ============================================================================ */

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

    const apiKey = process.env.RESEND_API_KEY;
    const remitente = process.env.CONTACTO_EMAIL_REMITENTE;
    const destino = process.env.CONTACTO_EMAIL_DESTINO || 'contacto@futbolitochile.cl';

    if (!apiKey || !remitente) {
        res.status(500).json({
            error: 'El envío de correos no está configurado todavía. Escríbenos directamente a contacto@futbolitochile.cl.'
        });
        return;
    }

    const cuerpoHtml =
        '<p><strong>Nombre:</strong> ' + escapeHtml(nombre) + '</p>' +
        '<p><strong>Correo:</strong> ' + escapeHtml(email) + '</p>' +
        '<p><strong>Teléfono:</strong> ' + escapeHtml(telefono) + '</p>' +
        '<p><strong>Mensaje:</strong></p>' +
        '<p>' + escapeHtml(mensaje).replace(/\n/g, '<br>') + '</p>';

    try {
        const respuesta = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: remitente,
                to: [destino],
                cc: [email],
                reply_to: email,
                subject: 'Nuevo mensaje de contacto — ' + nombre,
                html: cuerpoHtml
            })
        });

        if (!respuesta.ok) {
            const detalle = await respuesta.text();
            res.status(502).json({ error: 'No pudimos enviar tu mensaje: ' + detalle });
            return;
        }

        res.status(200).json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'No pudimos enviar tu mensaje: ' + err.message });
    }
};
