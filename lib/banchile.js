/* ============================================================================
   Integración con Banchile Pagos (Web Checkout). El checkout de Banchile
   habla el protocolo de "PlacetoPay Web Checkout" (confirmado a mano contra
   su ambiente de pruebas): login + firma SHA-1 (tranKey) armada con un
   nonce + seed + la secret key del comercio.

   Variables de entorno necesarias en Vercel:
   - BANCHILE_LOGIN           Login entregado por Banchile Pagos.
   - BANCHILE_SECRET_KEY      Secret Key entregada por Banchile Pagos.
   - BANCHILE_CHECKOUT_URL    https://checkout.test.banchilepagos.cl (pruebas)
                              o https://checkout.banchilepagos.cl (producción).
   ============================================================================ */

const crypto = require('crypto');

function getConfig() {
    const login = process.env.BANCHILE_LOGIN;
    const secretKey = process.env.BANCHILE_SECRET_KEY;
    const baseUrl = process.env.BANCHILE_CHECKOUT_URL;

    if (!login || !secretKey || !baseUrl) {
        throw new Error('Faltan las variables de entorno BANCHILE_LOGIN / BANCHILE_SECRET_KEY / BANCHILE_CHECKOUT_URL en Vercel.');
    }

    return { login, secretKey, baseUrl };
}

// Arma el bloque "auth" que exige el protocolo: un nonce aleatorio, un seed
// (fecha/hora actual) y un tranKey = SHA-1(nonce + seed + secretKey) en
// base64. Se genera de nuevo en cada llamada (no se puede reutilizar).
function firmarAuth(login, secretKey) {
    const seed = new Date().toISOString();
    const nonceRaw = crypto.randomBytes(16);
    const tranKeyRaw = crypto.createHash('sha1')
        .update(Buffer.concat([nonceRaw, Buffer.from(seed), Buffer.from(secretKey)]))
        .digest();

    return {
        login,
        tranKey: tranKeyRaw.toString('base64'),
        nonce: nonceRaw.toString('base64'),
        seed
    };
}

// Banchile rechaza reference/description con tildes, rayas u otros
// caracteres fuera de ASCII (probado a mano: "La información del pago es
// incorrecta (reference, description)"), así que se sanean antes de
// mandarlos.
function soloAscii(str, largoMax) {
    var sinTildes = String(str).normalize('NFD').replace(/[̀-ͯ]/g, ''); // "í" -> "i"
    var limpio = sinTildes.replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim(); // quita rayas, emojis y cualquier otro no ASCII
    return largoMax ? limpio.slice(0, largoMax) : limpio;
}

// Crea una sesión de pago (transacción) en Banchile y devuelve la URL a la
// que hay que redirigir al cliente para que pague.
async function crearSesion({ referencia, descripcion, montoClp, returnUrl, expiracionMinutos, ipAddress, userAgent }) {
    const { login, secretKey, baseUrl } = getConfig();

    const body = {
        auth: firmarAuth(login, secretKey),
        payment: {
            reference: soloAscii(referencia, 30),
            description: soloAscii(descripcion, 80),
            amount: { currency: 'CLP', total: montoClp }
        },
        expiration: new Date(Date.now() + expiracionMinutos * 60 * 1000).toISOString(),
        returnUrl,
        ipAddress: ipAddress || '0.0.0.0',
        userAgent: userAgent || 'FutbolitoChile/1.0'
    };

    const res = await fetch(baseUrl + '/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !data.status || data.status.status !== 'OK') {
        const motivo = data && data.status ? data.status.message : ('HTTP ' + res.status);
        throw new Error('Banchile rechazó la creación de la sesión de pago: ' + motivo);
    }

    return { requestId: data.requestId, processUrl: data.processUrl };
}

// Reconsulta el estado real de una sesión ya creada. Nunca hay que confiar
// ciegamente en lo que diga una notificación/webhook: siempre se vuelve a
// preguntar acá antes de dar un pago por aprobado.
async function consultarSesion(requestId) {
    const { login, secretKey, baseUrl } = getConfig();

    const body = { auth: firmarAuth(login, secretKey) };

    const res = await fetch(baseUrl + '/api/session/' + requestId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !data.status) {
        throw new Error('No se pudo consultar el estado de la transacción en Banchile (HTTP ' + res.status + ').');
    }

    return data;
}

// Dada una reserva en estado "pendiente" con una sesión de Banchile ya
// creada, reconsulta su estado real y la deja "confirmada" (pago aprobado)
// o "cancelada" (rechazado) según corresponda. Si ya no está "pendiente" no
// hace nada (evita procesar dos veces si el webhook y el retorno del
// cliente llegan casi al mismo tiempo).
async function confirmarTransaccion(supabaseAdmin, reserva) {
    if (!reserva || reserva.estado !== 'pendiente' || !reserva.pago_online_request_id) {
        return { estado: reserva ? reserva.estado : null };
    }

    const sesion = await consultarSesion(reserva.pago_online_request_id);
    const estadoBanchile = sesion.status && sesion.status.status;
    const detallePago = (sesion.payment && sesion.payment[0]) || {};

    if (estadoBanchile === 'APPROVED') {
        // El monto realmente cobrado lo confirma Banchile, no lo que
        // habíamos calculado nosotros al crear la sesión (puede ser el
        // abono o el precio completo, según lo que haya elegido el
        // cliente): reserva.tipo_pago ya refleja cuál de los dos fue.
        const montoCobrado = detallePago.amount && detallePago.amount.total != null
            ? detallePago.amount.total
            : (reserva.tipo_pago === 'abono' ? null : reserva.precio);

        const { data: actualizadas } = await supabaseAdmin.from('reservas').update({
            estado: 'confirmada',
            monto_pagado: montoCobrado != null ? montoCobrado : reserva.precio,
            pago_online_estado: estadoBanchile
        }).eq('id', reserva.id).eq('estado', 'pendiente').select('id');

        // "transicionAhora" indica si esta llamada fue la que efectivamente
        // confirmó el pago (para no disparar el correo de confirmación dos
        // veces si el webhook y el retorno del cliente llegan casi juntos).
        return {
            estado: 'confirmada',
            autorizacion: detallePago.authorization || null,
            montoPagado: montoCobrado != null ? montoCobrado : reserva.precio,
            transicionAhora: !!(actualizadas && actualizadas.length)
        };
    }

    if (estadoBanchile === 'REJECTED' || estadoBanchile === 'FAILED') {
        await supabaseAdmin.from('reservas').update({
            estado: 'cancelada',
            motivo_cancelacion: 'Pago rechazado en Banchile Pagos',
            cancelado_en: new Date().toISOString(),
            pago_online_estado: estadoBanchile
        }).eq('id', reserva.id).eq('estado', 'pendiente');

        return { estado: 'cancelada', autorizacion: detallePago.authorization || null };
    }

    // Sigue en curso (PENDING u otro estado intermedio): no se toca todavía.
    return { estado: 'pendiente' };
}

module.exports = { crearSesion, consultarSesion, confirmarTransaccion };
