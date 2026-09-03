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

   El armado del HTML y las consultas a Supabase viven en lib/cuadratura.js,
   compartido con api/cuadratura-corregida.js (el reenvío manual que dispara
   el panel admin al editar la cuadratura de un día ya cerrado).
   ============================================================================ */

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const { enviarCorreo, getTransporter } = require('../lib/mailer');
const {
    fechaChile,
    sumarDias,
    sumaMontoPagado,
    cargarDatosCuadratura,
    construirHtmlCuadratura
} = require('../lib/cuadratura');

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

    const datos = await cargarDatosCuadratura(supabaseAdmin, diaReporte);
    if (datos.error) {
        res.status(200).json({ ok: false, motivo: datos.error });
        return;
    }

    if (!datos.adminEmails.length) {
        res.status(200).json({ ok: false, motivo: 'No hay administradores con correo registrado.' });
        return;
    }

    const html = construirHtmlCuadratura(diaReporte, datos, { titulo: 'Cuadratura' });

    try {
        await enviarCorreo({
            to: datos.adminEmails,
            subject: 'Cuadratura diaria — ' + diaReporte + ' — Futbolito Chile',
            html
        });
    } catch (err) {
        res.status(200).json({ ok: false, motivo: err.message });
        return;
    }

    res.status(200).json({
        ok: true,
        fecha: diaReporte,
        reservas: datos.filasDia.length,
        totalDia: sumaMontoPagado(datos.filasDia),
        totalMes: sumaMontoPagado(datos.reservasMes),
        cancelaciones: datos.cancelacionesDia.length
    });
};
