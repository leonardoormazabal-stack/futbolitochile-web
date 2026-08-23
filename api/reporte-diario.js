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

function formatFechaCorta(isoTimestamp) {
    return new Date(isoTimestamp).toLocaleDateString('es-CL', { timeZone: ZONA_HORARIA, day: 'numeric', month: 'short' });
}

function sumaMontoPagado(filas) {
    return filas.reduce((acc, r) => acc + Number(r.monto_pagado || 0) + Number(r.monto_pagado_2 || 0), 0);
}

// Detecta que falta una columna nueva (falta correr un parche SQL en
// Supabase). PostgREST no siempre devuelve el código Postgres crudo
// "42703": cuando la columna ni siquiera está en su caché de esquema,
// responde con su propio código "PGRST204" y el mensaje
// "Could not find the '...' column ... in the schema cache".
function esErrorColumnaFaltante(error) {
    return !!error && (
        error.code === '42703' ||
        error.code === 'PGRST204' ||
        (error.message && error.message.indexOf('schema cache') !== -1)
    );
}

// Si la columna "monto_pagado_2" todavía no existe (falta correr el parche
// SQL add_cuadratura_reservas.sql), reintenta sin ella en vez de dejar todo
// el reporte diario sin enviarse.
async function cargarReservasDelDia(supabaseAdmin, hoy) {
    const res = await supabaseAdmin
        .from('reservas')
        .select('hora,precio,monto_pagado,monto_pagado_2,tipo_pago,metodo_pago,nombre_contacto,created_at,canchas(nombre,deporte)')
        .eq('fecha', hoy)
        .eq('estado', 'confirmada')
        .order('hora', { ascending: true });

    if (esErrorColumnaFaltante(res.error)) {
        return supabaseAdmin
            .from('reservas')
            .select('hora,precio,monto_pagado,tipo_pago,metodo_pago,nombre_contacto,created_at,canchas(nombre,deporte)')
            .eq('fecha', hoy)
            .eq('estado', 'confirmada')
            .order('hora', { ascending: true });
    }

    return res;
}

async function cargarReservasDelMes(supabaseAdmin, inicioMes, hoy) {
    const res = await supabaseAdmin
        .from('reservas')
        .select('monto_pagado,monto_pagado_2')
        .gte('fecha', inicioMes)
        .lte('fecha', hoy)
        .eq('estado', 'confirmada');

    if (esErrorColumnaFaltante(res.error)) {
        return supabaseAdmin
            .from('reservas')
            .select('monto_pagado')
            .gte('fecha', inicioMes)
            .lte('fecha', hoy)
            .eq('estado', 'confirmada');
    }

    return res;
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
        cargarReservasDelDia(supabaseAdmin, hoy),
        cargarReservasDelMes(supabaseAdmin, inicioMes, hoy),
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
            const montoPagado = (r.monto_pagado != null ? r.monto_pagado : 0) + (r.monto_pagado_2 != null ? r.monto_pagado_2 : 0);
            const tipoPagoTexto = r.tipo_pago === 'abono' ? 'Abono' : 'Pago total';
            const saldo = (r.precio || 0) - montoPagado;
            const saldoHtml = saldo > 0
                ? '<strong style="color:#c0392b;">' + formatCLP(saldo) + '</strong>'
                : '<span style="color:#1f7a3d;">Al día</span>';
            return (
                '<tr>' +
                '<td>' + formatFechaCorta(r.created_at) + '</td>' +
                '<td>' + horaTexto + ' hrs</td>' +
                '<td>' + escapeHtml(r.nombre_contacto || '—') + '</td>' +
                '<td>' + escapeHtml(deporte) + '</td>' +
                '<td>' + escapeHtml(cancha) + '</td>' +
                '<td>' + tipoPagoTexto + '</td>' +
                '<td>' + escapeHtml(r.metodo_pago || '—') + '</td>' +
                '<td>' + formatCLP(montoPagado) + '</td>' +
                '<td>' + saldoHtml + '</td>' +
                '</tr>'
            );
        }).join('')
        : '<tr><td colspan="9">Sin arriendos registrados hoy.</td></tr>';

    const html =
        '<p>Resumen de arriendos — ' + escapeHtml(formatFechaLarga(hoy)) + '</p>' +
        '<table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:13px;">' +
        '<thead><tr>' +
        '<th align="left">Fecha de pago</th>' +
        '<th align="left">Hora reserva</th>' +
        '<th align="left">Nombre</th>' +
        '<th align="left">Deporte</th>' +
        '<th align="left">Cancha</th>' +
        '<th align="left">Tipo de pago</th>' +
        '<th align="left">Método de pago</th>' +
        '<th align="left">Monto pagado</th>' +
        '<th align="left">Saldo</th>' +
        '</tr></thead>' +
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
