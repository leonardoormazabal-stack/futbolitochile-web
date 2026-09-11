/* ============================================================================
   Webhook de notificaciones de Banchile Pagos (Web Checkout).

   Todavía no tenemos la documentación técnica real de Banchile (el portal
   developers.banchilepagos.cl es una app en JS que no pudimos leer de forma
   automática), así que por ahora este endpoint SOLO registra en los logs de
   Vercel todo lo que llega — método, headers y body — para poder ver el
   formato real de la notificación en cuanto Banchile haga sus pruebas de
   certificación, y siempre responde 200 OK para que la certificación no
   falle por un webhook caído.

   TODO: una vez que tengamos la doc real (o veamos en los logs el payload
   de verdad), reemplazar esto por la lógica que valida la notificación
   (firma/autenticación) y actualiza el estado de pago de la reserva
   correspondiente en Supabase.
   ============================================================================ */

module.exports = async function handler(req, res) {
    console.log('[banchile-notificacion] ' + req.method + ' ' + JSON.stringify({
        headers: req.headers,
        query: req.query,
        body: req.body
    }));

    res.status(200).json({ ok: true });
};
