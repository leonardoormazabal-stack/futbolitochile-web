/* ============================================================================
   Webhook de notificaciones de Banchile Pagos (Web Checkout). Banchile llama
   acá cada vez que una transacción cambia de estado; nunca se confía en el
   contenido de la notificación en sí (formato no confirmado con certeza) —
   solo se usa para saber a qué "requestId" hay que reconsultarle el estado
   real a Banchile, con la misma lógica que usa reservas.html al volver del
   pago (ver lib/banchile.js y api/banchile.js).

   Siempre responde 200 para que Banchile no reintente indefinidamente, aun
   si no se pudo procesar (el error queda en los logs de Vercel).
   ============================================================================ */

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const { confirmarTransaccion } = require('../lib/banchile');

module.exports = async function handler(req, res) {
    const body = req.body || {};
    const query = req.query || {};
    const requestId = body.requestId || query.requestId || body.reference || query.reference;

    console.log('[banchile-notificacion] ' + req.method + ' requestId=' + requestId + ' body=' + JSON.stringify(body));

    if (!requestId) {
        res.status(200).json({ ok: true, motivo: 'Notificación sin requestId, se ignora.' });
        return;
    }

    let supabaseAdmin;
    try {
        supabaseAdmin = getSupabaseAdmin();
    } catch (err) {
        console.log('[banchile-notificacion] error de configuración: ' + err.message);
        res.status(200).json({ ok: false, motivo: err.message });
        return;
    }

    const { data: reserva, error } = await supabaseAdmin
        .from('reservas')
        .select('id,fecha,hora,precio,tipo_pago,estado,pago_online_request_id')
        .eq('pago_online_request_id', String(requestId))
        .single();

    if (error || !reserva) {
        console.log('[banchile-notificacion] no se encontró ninguna reserva con pago_online_request_id=' + requestId);
        res.status(200).json({ ok: true, motivo: 'No se encontró la reserva asociada.' });
        return;
    }

    try {
        const resultado = await confirmarTransaccion(supabaseAdmin, reserva);

        if (resultado.transicionAhora) {
            fetch('https://futbolitochile.cl/api/reserva-confirmacion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reservaId: reserva.id })
            }).catch(() => {});
        }

        console.log('[banchile-notificacion] reserva ' + reserva.id + ' -> ' + resultado.estado);
        res.status(200).json({ ok: true, estado: resultado.estado });
    } catch (err) {
        console.log('[banchile-notificacion] error al confirmar: ' + err.message);
        res.status(200).json({ ok: false, motivo: err.message });
    }
};
