/* ============================================================================
   Busca si ya existe una cuenta (o al menos una reserva de invitado previa)
   con el RUT que el cliente está escribiendo en el formulario de reserva
   (reservas.js), para autocompletar sus datos sin que tenga que volver a
   escribirlos. Solo devuelve los campos necesarios para el autocompletado
   (nombre, teléfono, email) — nunca documento_contacto de terceros, monto
   pagado, ni ningún otro dato de la reserva.
   ============================================================================ */

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');

function limpiarRut(rut) {
    return String(rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
}

function validarRut(rutCompleto) {
    const limpio = limpiarRut(rutCompleto);
    if (limpio.length < 2) return false;

    const cuerpo = limpio.slice(0, -1);
    const dv = limpio.slice(-1);
    if (!/^\d+$/.test(cuerpo)) return false;

    let suma = 0;
    let multiplo = 2;
    for (let i = cuerpo.length - 1; i >= 0; i--) {
        suma += parseInt(cuerpo.charAt(i), 10) * multiplo;
        multiplo = multiplo < 7 ? multiplo + 1 : 2;
    }
    const resto = 11 - (suma % 11);
    let dvEsperado;
    if (resto === 11) dvEsperado = '0';
    else if (resto === 10) dvEsperado = 'K';
    else dvEsperado = String(resto);

    return dv === dvEsperado;
}

function formatearRut(rut) {
    const limpio = limpiarRut(rut);
    if (limpio.length < 2) return limpio;
    const cuerpo = limpio.slice(0, -1);
    const dv = limpio.slice(-1);
    let cuerpoFormateado = '';
    for (let i = 0; i < cuerpo.length; i++) {
        const posDesdeFinal = cuerpo.length - i;
        cuerpoFormateado += cuerpo.charAt(i);
        if (posDesdeFinal > 1 && (posDesdeFinal - 1) % 3 === 0) {
            cuerpoFormateado += '.';
        }
    }
    return cuerpoFormateado + '-' + dv;
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Método no permitido.' });
        return;
    }

    const rutInput = (req.body || {}).rut;
    if (!rutInput || !validarRut(rutInput)) {
        res.status(200).json({ encontrado: false });
        return;
    }

    const documento = formatearRut(rutInput);

    let supabaseAdmin;
    try {
        supabaseAdmin = getSupabaseAdmin();
    } catch (err) {
        res.status(200).json({ encontrado: false });
        return;
    }

    const { data: perfil } = await supabaseAdmin
        .from('profiles')
        .select('id,nombre,telefono,email')
        .eq('documento', documento)
        .maybeSingle();

    if (perfil) {
        res.status(200).json({
            encontrado: true,
            userId: perfil.id,
            nombre: perfil.nombre,
            telefono: perfil.telefono,
            email: perfil.email
        });
        return;
    }

    // Sin cuenta todavía: busca la reserva de invitado más reciente con este
    // RUT (de antes de que existieran las cuentas de cliente) para al menos
    // autocompletar el nombre/teléfono/email que dejó la última vez.
    const { data: reservaPrevia } = await supabaseAdmin
        .from('reservas')
        .select('nombre_contacto,telefono_contacto,email_contacto')
        .eq('documento_contacto', documento)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (reservaPrevia) {
        res.status(200).json({
            encontrado: true,
            userId: null,
            nombre: reservaPrevia.nombre_contacto,
            telefono: reservaPrevia.telefono_contacto,
            email: reservaPrevia.email_contacto
        });
        return;
    }

    res.status(200).json({ encontrado: false });
};
