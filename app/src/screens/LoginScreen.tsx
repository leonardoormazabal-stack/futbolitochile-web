import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '../lib/supabase';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState('');

    async function iniciarSesion() {
        if (!email.trim() || !password) {
            setError('Completa tu correo y contraseña.');
            return;
        }
        setError('');
        setCargando(true);
        const { error: err } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password
        });
        setCargando(false);
        if (err) {
            setError('No pudimos iniciar sesión: correo o contraseña incorrectos.');
        }
    }

    return (
        <View style={styles.container}>
            <Text style={styles.titulo}>Futbolito Chile</Text>
            <Text style={styles.subtitulo}>Inicia sesión para reservar tu cancha</Text>

            <TextInput
                style={styles.input}
                placeholder="Correo electrónico"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
            />
            <TextInput
                style={styles.input}
                placeholder="Contraseña"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
            />

            {!!error && <Text style={styles.error}>{error}</Text>}

            <TouchableOpacity style={styles.boton} onPress={iniciarSesion} disabled={cargando}>
                {cargando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>Iniciar Sesión</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate('Registro')}>
                <Text style={styles.link}>¿No tienes cuenta? Regístrate</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
    titulo: { fontSize: 28, fontWeight: '700', color: '#0d3b66', textAlign: 'center' },
    subtitulo: { fontSize: 14, color: '#4a4a4a', textAlign: 'center', marginTop: 6, marginBottom: 28 },
    input: {
        borderWidth: 2,
        borderColor: '#f4f6f5',
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 14,
        fontSize: 15
    },
    boton: { backgroundColor: '#c0392b', borderRadius: 24, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
    botonTexto: { color: '#fff', fontWeight: '700', fontSize: 15 },
    link: { color: '#1a6bb5', textAlign: 'center', marginTop: 20 },
    error: { color: '#922b21', marginBottom: 10, textAlign: 'center' }
});
