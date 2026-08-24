const { getSupabaseAdmin, requireAdmin } = require('../lib/supabaseAdmin');

const ROLES_VALIDOS = ['jugador', 'administrador', 'superadministrador'];

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

    const body = req.body || {};
    const email = (body.email || '').trim();
    const password = body.password || '';
    const nombre = (body.nombre || '').trim();
    const tipoDocumento = body.tipoDocumento || null;
    const documento = body.documento || null;
    const telefono = body.telefono || null;
    const rolSolicitado = ROLES_VALIDOS.includes(body.rol) ? body.rol : 'jugador';

    // Un administrador solo puede crear cuentas de jugador: si pide un rol
    // de administrador o superadministrador, se ignora y queda en jugador.
    // Esto no depende de lo que mande el formulario, se decide acá.
    const rol = auth.rol === 'superadministrador' ? rolSolicitado : 'jugador';

    if (!email || !password || !nombre) {
        res.status(400).json({ error: 'Faltan campos obligatorios (email, contraseña, nombre).' });
        return;
    }
    if (password.length < 6) {
        res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
        return;
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: {
            nombre: nombre,
            tipo_documento: tipoDocumento,
            documento: documento,
            telefono: telefono
        }
    });

    if (createError) {
        res.status(400).json({ error: createError.message });
        return;
    }

    if (rol !== 'jugador') {
        const { error: updateError } = await supabaseAdmin
            .from('profiles')
            .update({ rol: rol })
            .eq('id', created.user.id);

        if (updateError) {
            res.status(200).json({
                ok: true,
                userId: created.user.id,
                warning: 'El usuario se creó, pero no se pudo asignar el rol: ' + updateError.message
            });
            return;
        }
    }

    res.status(200).json({ ok: true, userId: created.user.id });
};
