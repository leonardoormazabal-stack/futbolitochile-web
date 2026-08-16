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
};
