const { createClient } = require('@supabase/supabase-js');

/* ============================================================================
   ADVERTENCIA: este módulo usa la clave service_role, que tiene acceso
   total a la base de datos sin pasar por RLS. SOLO debe ejecutarse en
   funciones serverless (carpeta /api), NUNCA en código que se envíe al
   navegador. Las credenciales viven en variables de entorno de Vercel.
   ============================================================================ */

function getSupabaseAdmin() {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
        throw new Error('Faltan las variables de entorno SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en Vercel.');
    }

    return createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
}

// Verifica que quien llama a la función esté autenticado y sea superadmin.
async function requireSuperadmin(req, supabaseAdmin) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return { error: 'No autenticado.', status: 401 };
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData || !userData.user) {
        return { error: 'Sesión inválida o expirada.', status: 401 };
    }

    const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('rol')
        .eq('id', userData.user.id)
        .single();

    if (profileError || !profile || profile.rol !== 'superadministrador') {
        return { error: 'Solo el superadministrador puede realizar esta acción.', status: 403 };
    }

    return { user: userData.user };
}

// Verifica que quien llama esté autenticado y sea administrador o
// superadministrador (rechaza a jugadores). Devuelve también el rol para
// que cada endpoint decida qué le permite hacer a cada uno (ej. solo el
// superadministrador puede asignar roles de administrador/superadministrador).
async function requireAdmin(req, supabaseAdmin) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return { error: 'No autenticado.', status: 401 };
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData || !userData.user) {
        return { error: 'Sesión inválida o expirada.', status: 401 };
    }

    const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('rol')
        .eq('id', userData.user.id)
        .single();

    if (profileError || !profile || (profile.rol !== 'administrador' && profile.rol !== 'superadministrador')) {
        return { error: 'Solo un administrador o superadministrador puede realizar esta acción.', status: 403 };
    }

    return { user: userData.user, rol: profile.rol };
}

module.exports = { getSupabaseAdmin, requireSuperadmin, requireAdmin };
