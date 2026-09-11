/* ============================================================================
   Crea una transacción de pago con tarjeta vía Banchile Pagos (Web
   Checkout) para una reserva nueva. Se llama desde reservas.html cuando el
   cliente elige pagar con tarjeta (ya sea el abono o el total).

   Pasos:
   1. Recalcula el precio del bloque horario en el servidor (nunca confía en
      lo que mande el navegador) y valida que el monto a cobrar sea el abono
      configurado para ese bloque, o el precio completo.
   2. Verifica que el horario siga libre (ni confirmado ni con otro pago en
      curso).
   3. Crea la reserva en estado "pendiente" (bloquea el horario) con un
      vencimiento de 20 minutos.
   4. Crea la sesión de pago en Banchile y guarda su requestId en la reserva.
   5. Devuelve la URL a la que el navegador debe redirigir al cliente.

   Si algo fallara después de crear la reserva "pendiente" (Banchile no
   responde, etc.), se cancela esa reserva para no dejar el horario
   bloqueado por un intento que nunca llegó a la pasarela de pago.
   ============================================================================ */

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const { crearSesion } = require('../lib/banchile');

const SPORT_LABELS = { futbolito: 'Futbolito', padel: 'Pádel' };
const MINUTOS_EXPIRACION = 20;

function getPrecioPorHora(tarifas, deporte, hora) {
    const tabla = tarifas.filter((t) => t.deporte === deporte);
    for (const t of tabla) {
        if (hora >= t.hora_desde && hora < t.hora_hasta) return t.precio;
    }
    let masTardio = null;
    tabla.forEach((t) => { if (!masTardio || t.hora_desde > masTardio.hora_desde) masTardio = t; });
    return masTardio ? masTardio.precio : 0;
}

function getAbonoPorHora(tarifas, deporte, hora) {
    const tabla = tarifas.filter((t) => t.deporte === deporte);
    for (const t of tabla) {
        if (hora >= t.hora_desde && hora < t.hora_hasta) return t.abono != null ? t.abono : 10000;
    }
    let masTardio = null;
    tabla.forEach((t) => { if (!masTardio || t.hora_desde > masTardio.hora_desde) masTardio = t; });
    return masTardio && masTardio.abono != null ? masTardio.abono : 10000;
}

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
        .select('id,nombre,deporte')
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
    const montoACobrar = tipoPago === 'abono' ? getAbonoPorHora(tarifas, cancha.deporte, hora) : precio;

    if (!montoACobrar || montoACobrar <= 0) {
        res.status(400).json({ error: 'No se pudo calcular el monto a cobrar.' });
        return;
    }

    // El horario está ocupado si ya hay una reserva confirmada, o una
    // "pendiente" con un pago todavía en curso (no vencido).
    const { data: ocupantes, error: errorOcupantes } = await supabaseAdmin
        .from('reservas')
        .select('id,estado,pendiente_expira_en')
        .eq('cancha_id', canchaId)
        .eq('fecha', fecha)
        .eq('hora', hora);

    if (errorOcupantes) {
        res.status(500).json({ error: 'No se pudo verificar la disponibilidad.' });
        return;
    }

    const ahoraIso = new Date().toISOString();
    const ocupado = (ocupantes || []).some((r) => {
        return r.estado === 'confirmada' || (r.estado === 'pendiente' && r.pendiente_expira_en && r.pendiente_expira_en > ahoraIso);
    });

    if (ocupado) {
        res.status(409).json({ ocupada: true, error: 'Ese horario ya no está disponible.' });
        return;
    }

    const nuevaReserva = {
        user_id: userId,
        cancha_id: canchaId,
        fecha,
        hora,
        precio,
        monto_pagado: 0,
        tipo_pago: tipoPago,
        nombre_contacto: nombreContacto,
        documento_contacto: documentoContacto,
        telefono_contacto: telefonoContacto,
        email_contacto: emailContacto,
        metodo_pago: 'Tarjeta de Crédito/Débito',
        estado: 'pendiente',
        pendiente_expira_en: new Date(Date.now() + MINUTOS_EXPIRACION * 60 * 1000).toISOString()
    };

    const { data: reservaCreada, error: errorInsert } = await supabaseAdmin
        .from('reservas')
        .insert([nuevaReserva])
        .select()
        .single();

    if (errorInsert) {
        if (errorInsert.code === '23505') {
            res.status(409).json({ ocupada: true, error: 'Ese horario ya no está disponible.' });
            return;
        }
        res.status(500).json({ error: 'No pudimos crear la reserva: ' + errorInsert.message });
        return;
    }

    const deporteLabel = SPORT_LABELS[cancha.deporte] || cancha.deporte;
    const returnUrl = 'https://futbolitochile.cl/reservas.html?banchile_reserva=' + reservaCreada.id;

    let sesion;
    try {
        sesion = await crearSesion({
            referencia: reservaCreada.id,
            descripcion: (tipoPago === 'abono' ? 'Abono' : 'Pago') + ' reserva ' + deporteLabel + ' — ' + cancha.nombre + ' ' + fecha + ' ' + String(hora).padStart(2, '0') + ':00',
            montoClp: montoACobrar,
            returnUrl,
            expiracionMinutos: MINUTOS_EXPIRACION,
            ipAddress: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress,
            userAgent: req.headers['user-agent']
        });
    } catch (err) {
        await supabaseAdmin.from('reservas').update({
            estado: 'cancelada',
            motivo_cancelacion: 'No se pudo crear la sesión de pago en Banchile: ' + err.message,
            cancelado_en: new Date().toISOString()
        }).eq('id', reservaCreada.id);

        res.status(502).json({ error: 'No pudimos conectar con la pasarela de pago. Intenta de nuevo.' });
        return;
    }

    await supabaseAdmin.from('reservas').update({
        pago_online_request_id: String(sesion.requestId)
    }).eq('id', reservaCreada.id);

    res.status(200).json({ ok: true, reservaId: reservaCreada.id, processUrl: sesion.processUrl });
};
