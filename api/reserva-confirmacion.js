/* ============================================================================
   Envía los correos de una reserva nueva: confirmación al cliente y aviso a
   los administradores/superadministradores, usando el SMTP de Google
   Workspace (ver lib/mailer.js).

   Se llama desde el navegador justo después de crear la reserva en
   Supabase, pasando solo el id — los datos reales se leen de la base con la
   clave service_role, no se confía en lo que mande el cliente. Si el envío
   de correos no está configurado, o falla, igual responde 200: el correo es
   un extra, nunca debe hacer fallar una reserva que ya quedó guardada.
   ============================================================================ */

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const { enviarCorreo, getTransporter } = require('../lib/mailer');

const SPORT_LABELS = { futbolito: 'Futbolito', padel: 'Pádel' };

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatCLP(monto) {
    return '$' + Number(monto || 0).toLocaleString('es-CL');
}

function formatFecha(fechaISO) {
    const partes = fechaISO.split('-');
    const d = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
    return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Método no permitido.' });
        return;
    }

    const reservaId = (req.body || {}).reservaId;
    if (!reservaId) {
        res.status(400).json({ error: 'Falta reservaId.' });
        return;
    }

    if (!getTransporter()) {
        res.status(200).json({ ok: false, motivo: 'El envío de correos no está configurado todavía.' });
        return;
    }

    let supabaseAdmin;
    try {
        supabaseAdmin = getSupabaseAdmin();
    } catch (err) {
        res.status(200).json({ ok: false, motivo: err.message });
        return;
    }

    const { data: reserva, error: reservaError } = await supabaseAdmin
        .from('reservas')
        .select('id,fecha,hora,precio,monto_pagado,tipo_pago,nombre_contacto,telefono_contacto,email_contacto,metodo_pago,canchas(nombre,deporte)')
        .eq('id', reservaId)
        .single();

    if (reservaError || !reserva) {
        res.status(200).json({ ok: false, motivo: 'Reserva no encontrada.' });
        return;
    }

    const { data: admins } = await supabaseAdmin
        .from('profiles')
        .select('email')
        .in('rol', ['administrador', 'superadministrador']);

    const adminEmails = (admins || []).map((a) => a.email).filter(Boolean);

    const deporte = reserva.canchas ? (SPORT_LABELS[reserva.canchas.deporte] || reserva.canchas.deporte) : '';
    const canchaNombre = reserva.canchas ? reserva.canchas.nombre : reserva.cancha_id;
    const horaTexto = String(reserva.hora).padStart(2, '0') + ':00';
    const fechaTexto = formatFecha(reserva.fecha);
    const montoPagado = reserva.monto_pagado != null ? reserva.monto_pagado : reserva.precio;
    const saldoPendiente = reserva.precio - montoPagado;

    const detalleHtml =
        '<p><strong>' + escapeHtml(deporte) + '</strong> — ' + escapeHtml(canchaNombre) + '</p>' +
        '<p>' + escapeHtml(fechaTexto) + ', ' + horaTexto + ' hrs</p>' +
        '<p>' + (reserva.tipo_pago === 'abono'
            ? 'Abono pagado: ' + formatCLP(montoPagado) + ' vía ' + escapeHtml(reserva.metodo_pago || '—') + '. Saldo a pagar en el recinto: ' + formatCLP(saldoPendiente) + '.'
            : 'Total pagado: ' + formatCLP(montoPagado) + ' vía ' + escapeHtml(reserva.metodo_pago || '—') + '.') +
        '</p>';

    const envios = [];

    if (reserva.email_contacto) {
        var linkCancelacion = 'https://futbolitochile.cl/cancelar-reserva.html?id=' + encodeURIComponent(reserva.id);

        envios.push(enviarCorreo({
            to: [reserva.email_contacto],
            subject: 'Confirmación de tu reserva — Futbolito Chile',
            html:
                '<p>Hola ' + escapeHtml(reserva.nombre_contacto) + ',</p>' +
                '<p>Tu reserva quedó confirmada:</p>' +
                detalleHtml +
                '<p>¿Necesitas anular tu reserva? <a href="' + linkCancelacion + '">Haz clic aquí</a>.</p>' +
                '<p>¿Dudas o consultas? Escríbenos por WhatsApp al <a href="https://wa.me/56944087803">+56 9 4408 7803</a>.</p>'
        }));
    }

    if (adminEmails.length) {
        envios.push(enviarCorreo({
            to: adminEmails,
            subject: 'Nueva reserva — ' + reserva.nombre_contacto,
            html:
                '<p>Se creó una nueva reserva:</p>' +
                detalleHtml +
                '<p><strong>Contacto:</strong> ' + escapeHtml(reserva.nombre_contacto) +
                (reserva.telefono_contacto ? ' — ' + escapeHtml(reserva.telefono_contacto) : '') +
                (reserva.email_contacto ? ' — ' + escapeHtml(reserva.email_contacto) : '') +
                '</p>'
        }));
    }

    const resultados = await Promise.allSettled(envios);
    const fallidos = resultados.filter((r) => r.status === 'rejected').length;

    res.status(200).json({ ok: fallidos === 0, enviados: envios.length, fallidos: fallidos });
};
