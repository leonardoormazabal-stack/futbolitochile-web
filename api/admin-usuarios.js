/* ============================================================================
   Gestión de cuentas desde la sección Usuarios del panel admin: crear,
   eliminar y cambiar contraseña. Van juntas en un solo endpoint (en vez de
   uno por acción) para no pasarse del límite de 12 funciones serverless del
   plan Hobby de Vercel.
   ============================================================================ */

const { getSupabaseAdmin, requireAdmin, requireSuperadmin } = require('../lib/supabaseAdmin');

const ROLES_VALIDOS = ['jugador', 'administrador', 'superadministrador'];

async function crear(req, res, supabaseAdmin) {
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
}

async function eliminar(req, res, supabaseAdmin) {
    const auth = await requireSuperadmin(req, supabaseAdmin);
    if (auth.error) {
        res.status(auth.status).json({ error: auth.error });
        return;
    }

    const userId = (req.body || {}).userId;
    if (!userId) {
        res.status(400).json({ error: 'Falta userId.' });
        return;
    }
    if (userId === auth.user.id) {
        res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
        return;
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
        res.status(400).json({ error: error.message });
        return;
    }

    res.status(200).json({ ok: true });
}

async function setPassword(req, res, supabaseAdmin) {
    const auth = await requireSuperadmin(req, supabaseAdmin);
    if (auth.error) {
        res.status(auth.status).json({ error: auth.error });
        return;
    }

    const body = req.body || {};
    const userId = body.userId;
    const newPassword = body.newPassword || '';

    if (!userId || !newPassword) {
        res.status(400).json({ error: 'Faltan userId o la nueva contraseña.' });
        return;
    }
    if (newPassword.length < 6) {
        res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
        return;
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) {
        res.status(400).json({ error: error.message });
        return;
    }

    res.status(200).json({ ok: true });
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

    const accion = (req.body || {}).accion;

    if (accion === 'crear') return crear(req, res, supabaseAdmin);
    if (accion === 'eliminar') return eliminar(req, res, supabaseAdmin);
    if (accion === 'set-password') return setPassword(req, res, supabaseAdmin);

    res.status(400).json({ error: 'Falta indicar la acción (crear, eliminar o set-password).' });
};
