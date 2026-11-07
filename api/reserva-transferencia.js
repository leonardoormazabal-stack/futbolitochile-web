/* ============================================================================
   Crea la reserva cuando el cliente elige pagar por Transferencia desde
   reservas.html. A diferencia de la tarjeta (Banchile), acá no hay forma de
   confirmar el pago automáticamente: el cliente manda el comprobante por
   WhatsApp y un administrador lo valida a mano desde el panel (actualiza
   monto_pagado y pasa la reserva a "confirmada").

   Mientras tanto, la reserva queda "pendiente" con un vencimiento (igual que
   el pago con tarjeta, ver lib/reservaSlots.js): si el comprobante nunca
   llega, el horario queda libre de nuevo solo. Antes esta reserva se creaba
   directo como "confirmada" sin pago y sin vencimiento, así que si el
   cliente no llegaba a transferir, la cancha quedaba bloqueada para
   cualquiera —incluido él mismo intentando pagar con tarjeta— hasta que un
   administrador la encontraba y la anulaba a mano (pasó con una reserva
   real: ver caso de José Vidal, Cancha F1, 6-nov-2026).
   ============================================================================ */

const crypto = require('crypto');
const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const { getPrecioPorHora, liberarPendienteVencida, horarioOcupado } = require('../lib/reservaSlots');

const MINUTOS_EXPIRACION = 60;

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

    const body = req.body || {};
    const canchaId = body.cancha_id;
    const fecha = body.fecha;
    const hora = parseInt(body.hora, 10);
    const tipoPago = body.tipo_pago === 'abono' ? 'abono' : 'completo';
    const nombreContacto = (body.nombre_contacto || '').trim();
    const documentoContacto = (body.documento_contacto || '').trim();
    const telefonoContacto = (body.telefono_contacto || '').trim();
    const emailContacto = (body.email_contacto || '').trim();
    const userId = body.user_id || null;

    if (!canchaId || !fecha || isNaN(hora) || !nombreContacto || !documentoContacto || !telefonoContacto || !emailContacto) {
        res.status(400).json({ error: 'Faltan datos de la reserva.' });
        return;
    }

    const { data: cancha, error: errorCancha } = await supabaseAdmin
        .from('canchas')
        .select('id,deporte')
        .eq('id', canchaId)
        .single();

    if (errorCancha || !cancha) {
        res.status(400).json({ error: 'La cancha indicada no existe.' });
        return;
    }

    const { data: tarifas, error: errorTarifas } = await supabaseAdmin
        .from('tarifas')
        .select('deporte,hora_desde,hora_hasta,precio,abono');

    if (errorTarifas || !tarifas) {
        res.status(500).json({ error: 'No se pudieron leer las tarifas.' });
        return;
    }

    const precio = getPrecioPorHora(tarifas, cancha.deporte, hora);

    try {
        await liberarPendienteVencida(supabaseAdmin, canchaId, fecha, hora);

        if (await horarioOcupado(supabaseAdmin, canchaId, fecha, hora)) {
            res.status(409).json({ ocupada: true, error: 'Ese horario ya no está disponible.' });
            return;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
        return;
    }

    const reservaId = crypto.randomUUID();

    const nuevaReserva = {
        id: reservaId,
        user_id: userId,
        cancha_id: canchaId,
        fecha,
        hora,
        precio,
        // La transferencia no se cobra de forma instantánea: queda en 0
        // hasta que un administrador confirme el comprobante real.
        monto_pagado: 0,
        tipo_pago: tipoPago,
        nombre_contacto: nombreContacto,
        documento_contacto: documentoContacto,
        telefono_contacto: telefonoContacto,
        email_contacto: emailContacto,
        metodo_pago: 'Transferencia',
        estado: 'pendiente',
        pendiente_expira_en: new Date(Date.now() + MINUTOS_EXPIRACION * 60 * 1000).toISOString()
    };

    const { error: errorInsert } = await supabaseAdmin.from('reservas').insert([nuevaReserva]);

    if (errorInsert) {
        if (errorInsert.code === '23505') {
            res.status(409).json({ ocupada: true, error: 'Ese horario ya no está disponible.' });
            return;
        }
        res.status(500).json({ error: 'No pudimos crear la reserva: ' + errorInsert.message });
        return;
    }

    res.status(200).json({ ok: true, reservaId, precio });
};
