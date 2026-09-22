import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function PerfilScreen() {
    const { session, perfil } = useAuth();

    return (
        <View style={styles.container}>
            <View style={styles.avatar}>
                <Text style={styles.avatarTexto}>{(perfil?.nombre || '?').charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={styles.nombre}>{perfil?.nombre || 'Jugador'}</Text>
            <Text style={styles.dato}>{session?.user.email}</Text>
            {!!perfil?.telefono && <Text style={styles.dato}>{perfil.telefono}</Text>}
            {!!perfil?.documento && <Text style={styles.dato}>{perfil.documento}</Text>}

            <TouchableOpacity style={styles.boton} onPress={() => supabase.auth.signOut()}>
                <Text style={styles.botonTexto}>Cerrar sesión</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, alignItems: 'center', paddingTop: 60, padding: 24, backgroundColor: '#fff' },
    avatar: {
        width: 84,
        height: 84,
        borderRadius: 42,
        backgroundColor: '#1a6bb5',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16
    },
    avatarTexto: { color: '#fff', fontSize: 32, fontWeight: '700' },
    nombre: { fontSize: 20, fontWeight: '700', color: '#0d3b66' },
    dato: { color: '#4a4a4a', marginTop: 4 },
    boton: {
        marginTop: 40,
        borderWidth: 2,
        borderColor: '#922b21',
        borderRadius: 24,
        paddingVertical: 12,
        paddingHorizontal: 32
    },
    botonTexto: { color: '#922b21', fontWeight: '700' }
});
