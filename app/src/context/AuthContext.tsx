import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface Perfil {
    id: string;
    nombre: string | null;
    documento: string | null;
    telefono: string | null;
    email: string | null;
}

interface AuthContextValue {
    session: Session | null;
    perfil: Perfil | null;
    cargando: boolean;
    recargarPerfil: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
    session: null,
    perfil: null,
    cargando: true,
    recargarPerfil: async () => {}
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [perfil, setPerfil] = useState<Perfil | null>(null);
    const [cargando, setCargando] = useState(true);

    async function cargarPerfil(userId: string) {
        const { data } = await supabase
            .from('profiles')
            .select('id,nombre,documento,telefono,email')
            .eq('id', userId)
            .single();
        setPerfil(data as Perfil | null);
    }

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session);
            if (data.session) cargarPerfil(data.session.user.id);
            setCargando(false);
        });

        const { data: listener } = supabase.auth.onAuthStateChange((_event, nuevaSession) => {
            setSession(nuevaSession);
            if (nuevaSession) {
                cargarPerfil(nuevaSession.user.id);
            } else {
                setPerfil(null);
            }
        });

        return () => listener.subscription.unsubscribe();
    }, []);

    async function recargarPerfil() {
        if (session) await cargarPerfil(session.user.id);
    }

    return (
        <AuthContext.Provider value={{ session, perfil, cargando, recargarPerfil }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
