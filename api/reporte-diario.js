/* ============================================================================
   Envía el resumen diario de arriendos a administradores y
   superadministradores: detalle de las reservas del día (cancha, hora,
   monto, tipo de pago), el total recaudado hoy y el acumulado del mes hasta
   la fecha. Lo dispara el Cron Job de Vercel definido en vercel.json.

   Protegido con CRON_SECRET: Vercel agrega automáticamente el header
   "Authorization: Bearer <CRON_SECRET>" cuando llama a este endpoint, así
   que cualquier otra llamada sin ese secreto se rechaza. Hay que configurar
   la variable de entorno CRON_SECRET en Vercel (cualquier string largo y
   aleatorio) para que esto quede protegido.
   ============================================================================ */

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const { enviarCorreo, getTransporter } = require('../lib/mailer');

const SPORT_LABELS = { futbolito: 'Futbolito', padel: 'Pádel' };
const ZONA_HORARIA = 'America/Santiago';

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

// Devuelve la fecha de hoy en Chile como "YYYY-MM-DD", sin depender de la
// zona horaria del servidor donde corre la función serverless.
function fechaHoyChile() {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: ZONA_HORARIA,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());

    const map = {};
    partes.forEach((p) => { map[p.type] = p.value; });
    return map.year + '-' + map.month + '-' + map.day;
}

function primerDiaDelMes(fechaISO) {
    return fechaISO.slice(0, 7) + '-01';
}

function formatFechaLarga(fechaISO) {
    const [y, m, d] = fechaISO.split('-').map(Number);
    const fecha = new Date(y, m - 1, d);
    return fecha.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function sumaMontoPagado(filas) {
    return filas.reduce((acc, r) => acc + Number(r.monto_pagado || 0), 0);
}

module.exports = async function handler(req, res) {
    const cronSecret = (process.env.CRON_SECRET || '').trim();
    if (!cronSecret) {
        res.status(200).json({ ok: false, motivo: 'Falta configurar CRON_SECRET en las variables de entorno de Vercel.' });
        return;
    }

    const authHeader = req.headers.authorization || '';
    if (authHeader !== 'Bearer ' + cronSecret) {
        res.status(401).json({ error: 'No autorizado.' });
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

    const hoy = fechaHoyChile();
    const inicioMes = primerDiaDelMes(hoy);

    const [{ data: reservasHoy, error: errorHoy }, { data: reservasMes, error: errorMes }, { data: admins }] = await Promise.all([
        supabaseAdmin
            .from('reservas')
            .select('hora,precio,monto_pagado,tipo_pago,metodo_pago,canchas(nombre,deporte)')
            .eq('fecha', hoy)
            .eq('estado', 'confirmada')
            .order('hora', { ascending: true }),
        supabaseAdmin
            .from('reservas')
            .select('monto_pagado')
            .gte('fecha', inicioMes)
            .lte('fecha', hoy)
            .eq('estado', 'confirmada'),
        supabaseAdmin
            .from('profiles')
            .select('email')
            .in('rol', ['administrador', 'superadministrador'])
    ]);

    if (errorHoy || errorMes) {
        res.status(200).json({ ok: false, motivo: 'No se pudieron leer las reservas.' });
        return;
    }

    const adminEmails = (admins || []).map((a) => a.email).filter(Boolean);
    if (!adminEmails.length) {
        res.status(200).json({ ok: false, motivo: 'No hay administradores con correo registrado.' });
        return;
    }

    const filasHoy = reservasHoy || [];
    const totalHoy = sumaMontoPagado(filasHoy);
    const totalMes = sumaMontoPagado(reservasMes || []);

    const filasHtml = filasHoy.length
        ? filasHoy.map((r) => {
            const deporte = r.canchas ? (SPORT_LABELS[r.canchas.deporte] || r.canchas.deporte) : '';
            const cancha = r.canchas ? r.canchas.nombre : '—';
            const horaTexto = String(r.hora).padStart(2, '0') + ':00';
            const tipoPagoTexto = (r.tipo_pago === 'abono' ? 'Abono' : 'Completo') + ' — ' + escapeHtml(r.metodo_pago || '—');
            return (
                '<tr>' +
                '<td>' + escapeHtml(cancha) + (deporte ? ' (' + escapeHtml(deporte) + ')' : '') + '</td>' +
                '<td>' + horaTexto + ' hrs</td>' +
                '<td>' + formatCLP(r.monto_pagado != null ? r.monto_pagado : r.precio) + '</td>' +
                '<td>' + tipoPagoTexto + '</td>' +
                '</tr>'
            );
        }).join('')
        : '<tr><td colspan="4">Sin arriendos registrados hoy.</td></tr>';

    const html =
        '<p>Resumen de arriendos — ' + escapeHtml(formatFechaLarga(hoy)) + '</p>' +
        '<table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px;">' +
        '<thead><tr><th align="left">Cancha</th><th align="left">Hora</th><th align="left">Monto</th><th align="left">Tipo de pago</th></tr></thead>' +
        '<tbody>' + filasHtml + '</tbody>' +
        '</table>' +
        '<p style="margin-top:16px;"><strong>Total recaudado hoy:</strong> ' + formatCLP(totalHoy) + '</p>' +
        '<p><strong>Acumulado del mes hasta hoy:</strong> ' + formatCLP(totalMes) + '</p>';

    try {
        await enviarCorreo({
            to: adminEmails,
            subject: 'Resumen diario de arriendos — ' + hoy + ' — Futbolito Chile',
            html
        });
    } catch (err) {
        res.status(200).json({ ok: false, motivo: err.message });
        return;
    }

    res.status(200).json({ ok: true, fecha: hoy, reservas: filasHoy.length, totalHoy, totalMes });
};
