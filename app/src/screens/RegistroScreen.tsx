import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '../lib/supabase';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Registro'>;

export default function RegistroScreen({ navigation }: Props) {
    const [nombre, setNombre] = useState('');
    const [documento, setDocumento] = useState('');
    const [telefono, setTelefono] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState('');

    async function registrarse() {
        if (!nombre.trim() || !documento.trim() || !telefono.trim() || !email.trim() || !password) {
            setError('Completa todos los campos.');
            return;
        }
        if (password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres.');
            return;
        }

        setError('');
        setCargando(true);
        const { error: err } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
                data: {
                    nombre: nombre.trim(),
                    tipo_documento: 'rut',
                    documento: documento.trim(),
                    telefono: telefono.trim()
                }
            }
        });
        setCargando(false);

        if (err) {
            setError('No pudimos crear tu cuenta: ' + err.message);
            return;
        }
        // Con signUp ya queda logueado (a menos que el proyecto exija
        // confirmar el correo); el AuthContext detecta la sesión solo.
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.titulo}>Crear cuenta</Text>

            <TextInput style={styles.input} placeholder="Nombre completo" value={nombre} onChangeText={setNombre} />
            <TextInput style={styles.input} placeholder="RUT" value={documento} onChangeText={setDocumento} />
            <TextInput
                style={styles.input}
                placeholder="Teléfono"
                keyboardType="phone-pad"
                value={telefono}
                onChangeText={setTelefono}
            />
            <TextInput
                style={styles.input}
                placeholder="Correo electrónico"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
            />
            <TextInput style={styles.input} placeholder="Contraseña" secureTextEntry value={password} onChangeText={setPassword} />

            {!!error && <Text style={styles.error}>{error}</Text>}

            <TouchableOpacity style={styles.boton} onPress={registrarse} disabled={cargando}>
                {cargando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>Crear Cuenta</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.link}>¿Ya tienes cuenta? Inicia sesión</Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
    titulo: { fontSize: 24, fontWeight: '700', color: '#0d3b66', textAlign: 'center', marginBottom: 24 },
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
