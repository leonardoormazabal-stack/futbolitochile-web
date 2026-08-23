/* ============================================================================
   Envía la cuadratura del día anterior a administradores y
   superadministradores: detalle de los pagos que entraron ese día (sean de
   una cancha usada ese mismo día o de una reserva para otra fecha), el total
   recaudado y el acumulado del mes hasta esa fecha. Lo dispara el Cron Job
   de Vercel definido en vercel.json (corre a las 03:59 AM, así que reporta
   el día que recién terminó, no el que empieza).

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

// Devuelve una fecha "YYYY-MM-DD" en horario de Chile, sin depender de la
// zona horaria del servidor donde corre la función serverless.
function fechaChile(fecha) {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: ZONA_HORARIA,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(fecha);

    const map = {};
    partes.forEach((p) => { map[p.type] = p.value; });
    return map.year + '-' + map.month + '-' + map.day;
}

function sumarDias(fechaISO, delta) {
    const [y, m, d] = fechaISO.split('-').map(Number);
    // Ancla al mediodía UTC (no medianoche): así, al sumar/restar días en
    // UTC y volver a leer la fecha en horario de Chile (que va detrás de
    // UTC), el resultado sigue cayendo en el mismo día calendario, sin
    // importar si Chile está en UTC-3 o UTC-4 según la época del año.
    const fecha = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    fecha.setUTCDate(fecha.getUTCDate() + delta);
    return fechaChile(fecha);
}

function primerDiaDelMes(fechaISO) {
    return fechaISO.slice(0, 7) + '-01';
}

function formatFechaLarga(fechaISO) {
    const [y, m, d] = fechaISO.split('-').map(Number);
    const fecha = new Date(y, m - 1, d);
    return fecha.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatFechaCorta(fechaISO) {
    const [y, m, d] = fechaISO.split('-').map(Number);
    const fecha = new Date(y, m - 1, d);
    return fecha.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
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

// PostgREST nombra la columna exacta que falta en su mensaje de error
// ("column reservas.X does not exist" o "Could not find the 'X' column"),
// así que se puede quitar solo esa del select en vez de caer directo al
// set base: una columna pendiente no debería ocultar datos de otras que
// sí están al día.
function extraerColumnaFaltante(error) {
    if (!error || !error.message) return null;
    const match = error.message.match(/column\s+(?:\w+\.)?([a-z0-9_]+)\s+does not exist/i) ||
        error.message.match(/Could not find the '([a-z0-9_]+)' column/i);
    return match ? match[1] : null;
}

const COLUMNAS_RESERVAS_BASE = ['id', 'fecha', 'hora', 'precio', 'monto_pagado', 'tipo_pago', 'metodo_pago', 'nombre_contacto', 'created_at'];
const COLUMNAS_RESERVAS_OPCIONALES = ['monto_pagado_2', 'pago2_fecha', 'metodo_pago_2'];

// Trae las reservas que hay que cuadrar del día del reporte: tanto las
// canchas que se juegan ese día como cualquier reserva de otra fecha cuyo
// pago se registró ese día (misma lógica que la pestaña Cuadratura Diaria
// del panel). Usa un margen ancho en UTC al consultar por fecha de creación
// y aplica el filtro exacto de "ese día en Chile" en JavaScript, para no
// depender de la aritmética de horario de verano dentro de la consulta.
async function cargarReservasDelDia(supabaseAdmin, diaReporte) {
    const diaSiguiente = sumarDias(diaReporte, 2); // margen amplio para cubrir cualquier huso horario

    async function consultar(columnas) {
        const select = columnas.join(',') + ',canchas(nombre,deporte)';
        const [porFecha, porCreacion] = await Promise.all([
            supabaseAdmin.from('reservas').select(select).eq('fecha', diaReporte).eq('estado', 'confirmada'),
            supabaseAdmin.from('reservas').select(select)
                .gte('created_at', diaReporte + 'T00:00:00.000Z')
                .lt('created_at', diaSiguiente + 'T00:00:00.000Z')
                .eq('estado', 'confirmada')
        ]);

        const error = porFecha.error || porCreacion.error;
        if (!error) return { porFecha, porCreacion };

        const faltante = extraerColumnaFaltante(error);
        if (faltante && columnas.indexOf(faltante) !== -1) {
            return consultar(columnas.filter((c) => c !== faltante));
        }
        if (esErrorColumnaFaltante(error) && columnas.length > COLUMNAS_RESERVAS_BASE.length) {
            return consultar(COLUMNAS_RESERVAS_BASE);
        }
        return { porFecha, porCreacion };
    }

    const { porFecha, porCreacion } = await consultar(COLUMNAS_RESERVAS_BASE.concat(COLUMNAS_RESERVAS_OPCIONALES));

    if (porFecha.error || porCreacion.error) {
        return { data: null, error: porFecha.error || porCreacion.error };
    }

    const mapa = new Map();
    (porFecha.data || []).concat(porCreacion.data || []).forEach((r) => { mapa.set(r.id, r); });

    const combinadas = Array.from(mapa.values()).filter((r) => {
        return r.fecha === diaReporte || fechaChile(new Date(r.created_at)) === diaReporte;
    });

    combinadas.sort((a, b) => a.hora - b.hora);

    return { data: combinadas, error: null };
}

// Si la columna "monto_pagado_2" todavía no existe (falta correr el parche
// SQL), reintenta sin ella en vez de dejar todo el reporte sin enviarse.
async function cargarReservasDelMes(supabaseAdmin, inicioMes, hastaFecha) {
    const res = await supabaseAdmin
        .from('reservas')
        .select('monto_pagado,monto_pagado_2')
        .gte('fecha', inicioMes)
        .lte('fecha', hastaFecha)
        .eq('estado', 'confirmada');

    if (esErrorColumnaFaltante(res.error)) {
        return supabaseAdmin
            .from('reservas')
            .select('monto_pagado')
            .gte('fecha', inicioMes)
            .lte('fecha', hastaFecha)
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

    // El cron corre a las 03:59 AM: a esa hora "hoy" recién empieza, así que
    // el día a cuadrar es el que acaba de terminar (ayer).
    const hoy = fechaChile(new Date());
    const diaReporte = sumarDias(hoy, -1);
    const inicioMes = primerDiaDelMes(diaReporte);

    const [{ data: filas, error: errorDia }, { data: reservasMes, error: errorMes }, { data: admins }] = await Promise.all([
        cargarReservasDelDia(supabaseAdmin, diaReporte),
        cargarReservasDelMes(supabaseAdmin, inicioMes, diaReporte),
        supabaseAdmin
            .from('profiles')
            .select('email')
            .in('rol', ['administrador', 'superadministrador'])
    ]);

    if (errorDia || errorMes) {
        res.status(200).json({ ok: false, motivo: 'No se pudieron leer las reservas.' });
        return;
    }

    const adminEmails = (admins || []).map((a) => a.email).filter(Boolean);
    if (!adminEmails.length) {
        res.status(200).json({ ok: false, motivo: 'No hay administradores con correo registrado.' });
        return;
    }

    const filasDia = filas || [];
    const totalDia = sumaMontoPagado(filasDia);
    const totalMes = sumaMontoPagado(reservasMes || []);

    const filasHtml = filasDia.length
        ? filasDia.map((r) => {
            const deporte = r.canchas ? (SPORT_LABELS[r.canchas.deporte] || r.canchas.deporte) : '';
            const cancha = r.canchas ? r.canchas.nombre : '—';
            const horaTexto = String(r.hora).padStart(2, '0') + ':00';
            const montoPagado1 = r.monto_pagado != null ? r.monto_pagado : 0;
            const montoPagado2 = r.monto_pagado_2 != null ? r.monto_pagado_2 : 0;
            const montoTotalPagado = montoPagado1 + montoPagado2;
            const tipoPagoTexto = r.tipo_pago === 'abono' ? 'Abono' : 'Pago total';
            const saldo = (r.precio || 0) - montoTotalPagado;
            const estadoHtml = saldo > 0
                ? '<strong style="color:#c0392b;">Pendiente (-' + formatCLP(saldo) + ')</strong>'
                : '<span style="color:#1f7a3d;">Al día</span>';
            const fechaCanchaTexto = r.fecha === diaReporte ? 'Hoy' : formatFechaCorta(r.fecha);
            return (
                '<tr>' +
                '<td>' + escapeHtml(fechaCanchaTexto) + '</td>' +
                '<td>' + horaTexto + ' hrs</td>' +
                '<td>' + escapeHtml(r.nombre_contacto || '—') + '</td>' +
                '<td>' + escapeHtml(deporte) + '</td>' +
                '<td>' + escapeHtml(cancha) + '</td>' +
                '<td>' + tipoPagoTexto + '</td>' +
                '<td>' + formatCLP(montoPagado1) + ' vía ' + escapeHtml(r.metodo_pago || '—') + '</td>' +
                '<td>' + (montoPagado2 > 0 ? formatCLP(montoPagado2) + ' vía ' + escapeHtml(r.metodo_pago_2 || '—') : '—') + '</td>' +
                '<td>' + formatCLP(montoTotalPagado) + '</td>' +
                '<td>' + estadoHtml + '</td>' +
                '</tr>'
            );
        }).join('')
        : '<tr><td colspan="10">Sin pagos registrados este día.</td></tr>';

    const html =
        '<p>Cuadratura — ' + escapeHtml(formatFechaLarga(diaReporte)) + '</p>' +
        '<p style="font-size:12px;color:#666;">Incluye las canchas usadas este día y cualquier pago que haya entrado este día para una reserva de otra fecha (columna "Cancha para").</p>' +
        '<table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:13px;">' +
        '<thead><tr>' +
        '<th align="left">Cancha para</th>' +
        '<th align="left">Hora</th>' +
        '<th align="left">Nombre</th>' +
        '<th align="left">Deporte</th>' +
        '<th align="left">Cancha</th>' +
        '<th align="left">Tipo de pago</th>' +
        '<th align="left">Pago 1 (Abono)</th>' +
        '<th align="left">Pago 2 (Saldo)</th>' +
        '<th align="left">Monto Total Pagado</th>' +
        '<th align="left">Estado</th>' +
        '</tr></thead>' +
        '<tbody>' + filasHtml + '</tbody>' +
        '</table>' +
        '<p style="margin-top:16px;"><strong>Total recaudado este día:</strong> ' + formatCLP(totalDia) + '</p>' +
        '<p><strong>Acumulado del mes hasta esta fecha:</strong> ' + formatCLP(totalMes) + '</p>';

    try {
        await enviarCorreo({
            to: adminEmails,
            subject: 'Cuadratura diaria — ' + diaReporte + ' — Futbolito Chile',
            html
        });
    } catch (err) {
        res.status(200).json({ ok: false, motivo: err.message });
        return;
    }

    res.status(200).json({ ok: true, fecha: diaReporte, reservas: filasDia.length, totalDia, totalMes });
};
