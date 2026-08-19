/* ============================================================================
   Permite a un jugador anular su propia reserva desde el link que recibe en
   el correo de confirmación (ver api/reserva-confirmacion.js), sin necesidad
   de iniciar sesión. El "id" de la reserva (un UUID prácticamente
   imposible de adivinar) funciona como el secreto del link.

   GET  ?id=<uuid>   Devuelve los datos públicos de la reserva para mostrarlos
                      antes de confirmar (no expone documento_contacto).
   POST { id }       Marca la reserva como 'cancelada', solo si todavía está
                      'confirmada' y su fecha/hora no pasó.
   ============================================================================ */

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');

const SPORT_LABELS = { futbolito: 'Futbolito', padel: 'Pádel' };
const ZONA_HORARIA = 'America/Santiago';

function formatFecha(fechaISO) {
    const [y, m, d] = fechaISO.split('-').map(Number);
    const fecha = new Date(y, m - 1, d);
    return fecha.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Compara la reserva contra "ahora mismo" en horario de Chile, sin depender
// de la zona horaria del servidor donde corre la función serverless.
function reservaYaPaso(fecha, hora) {
    const ahoraChile = new Date(new Date().toLocaleString('en-US', { timeZone: ZONA_HORARIA }));
    const [y, m, d] = fecha.split('-').map(Number);
    const inicioReserva = new Date(y, m - 1, d, hora);
    return inicioReserva.getTime() <= ahoraChile.getTime();
}

function datosPublicos(reserva) {
    return {
        id: reserva.id,
        estado: reserva.estado,
        nombreContacto: reserva.nombre_contacto,
        deporte: reserva.canchas ? (SPORT_LABELS[reserva.canchas.deporte] || reserva.canchas.deporte) : '',
        cancha: reserva.canchas ? reserva.canchas.nombre : reserva.cancha_id,
        fecha: reserva.fecha,
        fechaTexto: formatFecha(reserva.fecha),
        hora: reserva.hora,
        montoPagado: reserva.monto_pagado != null ? reserva.monto_pagado : reserva.precio,
        metodoPago: reserva.metodo_pago,
        yaPaso: reservaYaPaso(reserva.fecha, reserva.hora)
    };
}

module.exports = async function handler(req, res) {
    let supabaseAdmin;
    try {
        supabaseAdmin = getSupabaseAdmin();
    } catch (err) {
        res.status(500).json({ error: err.message });
        return;
    }

    if (req.method === 'GET') {
        const id = (req.query || {}).id;
        if (!id) {
            res.status(400).json({ error: 'Falta el identificador de la reserva.' });
            return;
        }

        const { data: reserva, error } = await supabaseAdmin
            .from('reservas')
            .select('id,fecha,hora,precio,monto_pagado,metodo_pago,nombre_contacto,estado,cancha_id,canchas(nombre,deporte)')
            .eq('id', id)
            .single();

        if (error || !reserva) {
            res.status(404).json({ error: 'No encontramos esa reserva. Puede que el link esté vencido o incorrecto.' });
            return;
        }

        res.status(200).json({ reserva: datosPublicos(reserva) });
        return;
    }

    if (req.method === 'POST') {
        const id = (req.body || {}).id;
        if (!id) {
            res.status(400).json({ error: 'Falta el identificador de la reserva.' });
            return;
        }

        const { data: reserva, error: buscarError } = await supabaseAdmin
            .from('reservas')
            .select('id,fecha,hora,precio,monto_pagado,metodo_pago,nombre_contacto,estado,cancha_id,canchas(nombre,deporte)')
            .eq('id', id)
            .single();

        if (buscarError || !reserva) {
            res.status(404).json({ error: 'No encontramos esa reserva. Puede que el link esté vencido o incorrecto.' });
            return;
        }

        if (reserva.estado === 'cancelada') {
            res.status(200).json({ reserva: datosPublicos(reserva), yaEstabaCancelada: true });
            return;
        }

        if (reservaYaPaso(reserva.fecha, reserva.hora)) {
            res.status(409).json({ error: 'Esta reserva ya pasó, no se puede anular desde aquí. Escríbenos por WhatsApp si necesitas ayuda.' });
            return;
        }

        const { error: updateError } = await supabaseAdmin
            .from('reservas')
            .update({ estado: 'cancelada' })
            .eq('id', id);

        if (updateError) {
            res.status(500).json({ error: 'No pudimos anular tu reserva: ' + updateError.message });
            return;
        }

        reserva.estado = 'cancelada';
        res.status(200).json({ reserva: datosPublicos(reserva), yaEstabaCancelada: false });
        return;
    }

    res.status(405).json({ error: 'Método no permitido.' });
};
