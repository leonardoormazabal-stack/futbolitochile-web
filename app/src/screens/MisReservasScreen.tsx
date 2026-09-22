import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { DEPORTE_LABELS, formatCLP, Reserva } from '../lib/tipos';

const ESTADO_LABELS: Record<string, string> = {
    confirmada: 'Confirmada',
    pendiente: 'Pago pendiente',
    cancelada: 'Cancelada'
};

export default function MisReservasScreen() {
    const { session } = useAuth();
    const [reservas, setReservas] = useState<Reserva[]>([]);
    const [cargando, setCargando] = useState(true);
    const [cancelando, setCancelando] = useState<string | null>(null);

    const cargar = useCallback(() => {
        if (!session) return;
        setCargando(true);
        supabase
            .from('reservas')
            .select('id,fecha,hora,cancha_id,precio,monto_pagado,monto_pagado_2,tipo_pago,metodo_pago,estado,nombre_contacto,canchas(nombre,deporte)')
            .eq('user_id', session.user.id)
            .order('fecha', { ascending: false })
            .order('hora', { ascending: false })
            .then(({ data, error }) => {
                if (!error) setReservas((data as unknown as Reserva[]) || []);
                setCargando(false);
            });
    }, [session]);

    useFocusEffect(
        useCallback(() => {
            cargar();
        }, [cargar])
    );

    function confirmarCancelacion(reserva: Reserva) {
        Alert.alert('Anular reserva', '¿Seguro que quieres anular esta reserva? El horario quedará disponible para otros.', [
            { text: 'No', style: 'cancel' },
            { text: 'Sí, anular', style: 'destructive', onPress: () => cancelar(reserva.id) }
        ]);
    }

    async function cancelar(id: string) {
        setCancelando(id);
        try {
            const res = await fetch('https://futbolitochile.cl/api/cancelar-reserva', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            const data = await res.json();
            if (!res.ok) {
                Alert.alert('No pudimos anular tu reserva', data.error || 'Intenta de nuevo.');
                return;
            }
            cargar();
        } catch {
            Alert.alert('No pudimos anular tu reserva', 'Revisa tu conexión e intenta de nuevo.');
        } finally {
            setCancelando(null);
        }
    }

    if (cargando && reservas.length === 0) {
        return (
            <View style={styles.centro}>
                <ActivityIndicator size="large" color="#c0392b" />
            </View>
        );
    }

    return (
        <FlatList
            style={styles.container}
            contentContainerStyle={{ padding: 16 }}
            data={reservas}
            keyExtractor={(r) => r.id}
            refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} />}
            ListEmptyComponent={<Text style={styles.vacio}>Todavía no tienes reservas.</Text>}
            renderItem={({ item }) => {
                const deporte = item.canchas ? DEPORTE_LABELS[item.canchas.deporte] : '';
                const cancha = item.canchas ? item.canchas.nombre : item.cancha_id;
                const pagado = (item.monto_pagado || 0) + (item.monto_pagado_2 || 0);
                const puedeAnular = item.estado === 'confirmada';

                return (
                    <View style={styles.card}>
                        <View style={styles.cardHeader}>
                            <Text style={styles.cardFecha}>
                                {item.fecha} · {String(item.hora).padStart(2, '0')}:00 hrs
                            </Text>
                            <Text style={[styles.estado, (styles as Record<string, object>)['estado_' + item.estado]]}>
                                {ESTADO_LABELS[item.estado] || item.estado}
                            </Text>
                        </View>
                        <Text style={styles.cardCancha}>
                            {cancha} {deporte ? `(${deporte})` : ''}
                        </Text>
                        <Text style={styles.cardPago}>
                            Pagado {formatCLP(pagado)} de {formatCLP(item.precio)}
                        </Text>

                        {puedeAnular && (
                            <TouchableOpacity
                                style={styles.botonAnular}
                                onPress={() => confirmarCancelacion(item)}
                                disabled={cancelando === item.id}
                            >
                                {cancelando === item.id ? (
                                    <ActivityIndicator color="#922b21" />
                                ) : (
                                    <Text style={styles.botonAnularTexto}>Anular reserva</Text>
                                )}
                            </TouchableOpacity>
                        )}
                    </View>
                );
            }}
        />
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    centro: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    vacio: { textAlign: 'center', color: '#4a4a4a', marginTop: 40 },
    card: {
        borderWidth: 1,
        borderColor: '#f4f6f5',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    cardFecha: { fontWeight: '700', color: '#0d3b66' },
    cardCancha: { color: '#333', marginBottom: 4 },
    cardPago: { color: '#4a4a4a', fontSize: 13, marginBottom: 10 },
    estado: { fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
    estado_confirmada: { backgroundColor: '#e3f3e8', color: '#1f7a3d' },
    estado_pendiente: { backgroundColor: '#fdf3e0', color: '#a1690a' },
    estado_cancelada: { backgroundColor: '#fdecea', color: '#922b21' },
    botonAnular: { borderWidth: 2, borderColor: '#922b21', borderRadius: 20, paddingVertical: 8, alignItems: 'center' },
    botonAnularTexto: { color: '#922b21', fontWeight: '700' }
});
