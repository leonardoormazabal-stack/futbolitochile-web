const { getSupabaseAdmin, requireSuperadmin } = require('../lib/supabaseAdmin');

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
};
