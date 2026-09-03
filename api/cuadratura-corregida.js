/* ============================================================================
   Reenvía por correo la cuadratura de un día ya cerrado, corregida, a
   administradores y superadministradores. Lo dispara el panel admin
   (pestaña Cuadratura Diaria) cuando un administrador edita un pago de un
   día anterior a hoy: ese envío es obligatorio, no una opción del admin, así
   que este endpoint se llama automáticamente como parte de "Guardar" en vez
   de exponer un botón aparte para omitirlo.

   Reusa las mismas consultas y el mismo HTML que el reporte nocturno
   (api/reporte-diario.js) a través de lib/cuadratura.js, así que la
   cuadratura corregida que llega por correo es exactamente la misma tabla
   que ve el administrador en el panel, ya con los cambios guardados.
   ============================================================================ */

const { getSupabaseAdmin, requireAdmin } = require('../lib/supabaseAdmin');
const { enviarCorreo, getTransporter } = require('../lib/mailer');
const { fechaChile, cargarDatosCuadratura, construirHtmlCuadratura } = require('../lib/cuadratura');

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Método no permitido.' });
        return;
    }

    let supabaseAdmin;
    try {
        supabaseAdmin = getSupabaseAdmin();
    } catch (e) {
        res.status(500).json({ error: e.message });
        return;
    }

    const auth = await requireAdmin(req, supabaseAdmin);
    if (auth.error) {
        res.status(auth.status).json({ error: auth.error });
        return;
    }

    const fecha = (req.body && req.body.fecha) || '';
    if (!FECHA_REGEX.test(fecha)) {
        res.status(400).json({ error: 'Falta una fecha válida (YYYY-MM-DD).' });
        return;
    }

    const hoy = fechaChile(new Date());
    if (fecha > hoy) {
        res.status(400).json({ error: 'No se puede enviar una cuadratura corregida de una fecha futura.' });
        return;
    }

    if (!getTransporter()) {
        res.status(200).json({ ok: false, motivo: 'El envío de correos no está configurado todavía.' });
        return;
    }

    const datos = await cargarDatosCuadratura(supabaseAdmin, fecha);
    if (datos.error) {
        res.status(200).json({ ok: false, motivo: datos.error });
        return;
    }

    if (!datos.adminEmails.length) {
        res.status(200).json({ ok: false, motivo: 'No hay administradores con correo registrado.' });
        return;
    }

    const html = construirHtmlCuadratura(fecha, datos, {
        titulo: 'Cuadratura corregida',
        nota: 'Esta cuadratura fue corregida después de su cierre original. Editada por ' + (auth.user.email || 'un administrador') + '.'
    });

    try {
        await enviarCorreo({
            to: datos.adminEmails,
            subject: 'Cuadratura corregida — ' + fecha + ' — Futbolito Chile',
            html
        });
    } catch (err) {
        res.status(200).json({ ok: false, motivo: err.message });
        return;
    }

    res.status(200).json({ ok: true, fecha, enviadoA: datos.adminEmails.length });
};
