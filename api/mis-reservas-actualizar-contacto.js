/* ============================================================================
   Permite a un cliente logueado editar el teléfono/email de contacto de una
   de SUS reservas futuras, desde mis-reservas.html. No toca fecha, hora,
   precio ni estado — eso sigue haciéndose cancelando (api/cancelar-reserva.js)
   y reservando de nuevo.
   ============================================================================ */

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');

const ZONA_HORARIA = 'America/Santiago';

// Compara la reserva contra "ahora mismo" en horario de Chile, sin depender
// de la zona horaria del servidor donde corre la función serverless.
function reservaYaPaso(fecha, hora) {
    const ahoraChile = new Date(new Date().toLocaleString('en-US', { timeZone: ZONA_HORARIA }));
    const [y, m, d] = fecha.split('-').map(Number);
    const inicioReserva = new Date(y, m - 1, d, hora);
    return inicioReserva.getTime() <= ahoraChile.getTime();
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Método no permitido.' });
        return;
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
        res.status(401).json({ error: 'No autenticado.' });
        return;
    }

    let supabaseAdmin;
    try {
        supabaseAdmin = getSupabaseAdmin();
    } catch (err) {
        res.status(500).json({ error: err.message });
        return;
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData || !userData.user) {
        res.status(401).json({ error: 'Sesión inválida o expirada.' });
        return;
    }

    const body = req.body || {};
    const reservaId = body.reservaId;
    const telefono = (body.telefono || '').trim();
    const email = (body.email || '').trim();

    if (!reservaId || !telefono || !email) {
        res.status(400).json({ error: 'Faltan datos (teléfono y email son obligatorios).' });
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'Ingresa un email válido.' });
        return;
    }

    const { data: reserva, error: buscarError } = await supabaseAdmin
        .from('reservas')
        .select('id,user_id,fecha,hora,estado')
        .eq('id', reservaId)
        .single();

    if (buscarError || !reserva) {
        res.status(404).json({ error: 'Reserva no encontrada.' });
        return;
    }
    if (reserva.user_id !== userData.user.id) {
        res.status(403).json({ error: 'Esta reserva no pertenece a tu cuenta.' });
        return;
    }
    if (reserva.estado !== 'confirmada') {
        res.status(409).json({ error: 'Esta reserva ya está cancelada.' });
        return;
    }
    if (reservaYaPaso(reserva.fecha, reserva.hora)) {
        res.status(409).json({ error: 'Esta reserva ya pasó, no se puede editar.' });
        return;
    }

    const { error: updateError } = await supabaseAdmin
        .from('reservas')
        .update({ telefono_contacto: telefono, email_contacto: email })
        .eq('id', reservaId);

    if (updateError) {
        res.status(500).json({ error: 'No pudimos actualizar tus datos: ' + updateError.message });
        return;
    }

    res.status(200).json({ ok: true });
};
