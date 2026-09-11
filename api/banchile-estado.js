/* ============================================================================
   Consulta el estado de una reserva pagada con Banchile Pagos, apenas el
   cliente vuelve a reservas.html tras pagar (returnUrl). Reconsulta a
   Banchile igual que el webhook: no espera pasivamente a que llegue la
   notificación, así el cliente ve el resultado real de inmediato aunque el
   webhook todavía no haya llegado.
   ============================================================================ */

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const { confirmarTransaccion } = require('../lib/banchile');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Método no permitido.' });
        return;
    }

    const reservaId = (req.query || {}).reserva;
    if (!reservaId) {
        res.status(400).json({ error: 'Falta el identificador de la reserva.' });
        return;
    }

    let supabaseAdmin;
    try {
        supabaseAdmin = getSupabaseAdmin();
    } catch (e) {
        res.status(500).json({ error: e.message });
        return;
    }

    const { data: reserva, error } = await supabaseAdmin
        .from('reservas')
        .select('id,fecha,hora,precio,monto_pagado,tipo_pago,estado,nombre_contacto,pago_online_request_id,cancha_id,canchas(nombre,deporte)')
        .eq('id', reservaId)
        .single();

    if (error || !reserva) {
        res.status(404).json({ error: 'No encontramos esa reserva.' });
        return;
    }

    let resultado;
    try {
        resultado = await confirmarTransaccion(supabaseAdmin, reserva);
    } catch (err) {
        // Si Banchile no responde, devolvemos el estado que ya teníamos en
        // vez de dejar al cliente sin ninguna respuesta.
        resultado = { estado: reserva.estado };
    }

    if (resultado.transicionAhora) {
        // Correo de confirmación real, recién ahora que se sabe que el pago
        // fue aprobado (antes, mientras estaba "pendiente", no correspondía
        // avisarle a nadie).
        fetch('https://futbolitochile.cl/api/reserva-confirmacion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reservaId: reserva.id })
        }).catch(() => {});
    }

    const estadoFinal = resultado.estado || reserva.estado;
    const canchaNombre = reserva.canchas ? reserva.canchas.nombre : reserva.cancha_id;
    const montoPagado = estadoFinal === 'confirmada'
        ? (resultado.montoPagado != null ? resultado.montoPagado : reserva.monto_pagado)
        : null;

    res.status(200).json({
        estado: estadoFinal,
        fecha: reserva.fecha,
        hora: reserva.hora,
        cancha: canchaNombre,
        montoPagado,
        precio: reserva.precio,
        tipoPago: reserva.tipo_pago,
        nombreContacto: reserva.nombre_contacto
    });
};
