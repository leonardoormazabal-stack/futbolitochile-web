const nodemailer = require('nodemailer');

/* ============================================================================
   Envío de correo por SMTP de Google Workspace, usando la misma cuenta que
   ya tiene el negocio (contacto@futbolitochile.cl) en vez de un servicio de
   terceros. Requiere estas variables de entorno en Vercel:

   - GMAIL_USER           La cuenta de Workspace que envía, ej:
                           contacto@futbolitochile.cl
   - GMAIL_APP_PASSWORD   Contraseña de aplicación de 16 caracteres generada
                           en myaccount.google.com → Seguridad → Verificación
                           en dos pasos → Contraseñas de aplicaciones (esa
                           cuenta necesita 2FA activado para poder generarla).

   Gmail/Workspace exige que el remitente sea la cuenta autenticada, así que
   a diferencia de un servicio como Resend, aquí no hace falta verificar el
   dominio aparte ni configurar un remitente distinto — los correos salen
   literalmente desde GMAIL_USER.
   ============================================================================ */

let transporter = null;

function getTransporter() {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;

    if (!user || !pass) {
        return null;
    }

    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: { user, pass }
        });
    }

    return transporter;
}

async function enviarCorreo({ to, cc, replyTo, subject, html }) {
    const t = getTransporter();
    if (!t) {
        throw new Error('El envío de correos no está configurado (faltan GMAIL_USER / GMAIL_APP_PASSWORD).');
    }

    await t.sendMail({
        from: process.env.GMAIL_USER,
        to,
        cc,
        replyTo,
        subject,
        html,
        // Forzamos base64 en vez del quoted-printable por defecto: con QP,
        // nodemailer puede insertar un salto de línea "blando" justo en medio
        // de una URL larga sin espacios (como un link con un UUID), lo que
        // corrompe el href al reconstruirse en el cliente de correo.
        textEncoding: 'base64'
    });
}

module.exports = { getTransporter, enviarCorreo };
