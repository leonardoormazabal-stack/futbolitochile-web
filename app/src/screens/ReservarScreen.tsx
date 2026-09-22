import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Alert
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
    Cancha,
    Deporte,
    DEPORTE_LABELS,
    Tarifa,
    abonoPorHora,
    formatCLP,
    precioPorHora,
    toISODate
} from '../lib/tipos';

const HORAS = Array.from({ length: 12 }, (_, i) => i + 12); // 12..23

function proximosDias(cantidad: number): Date[] {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return Array.from({ length: cantidad }, (_, i) => {
        const d = new Date(hoy);
        d.setDate(d.getDate() + i);
        return d;
    });
}

export default function ReservarScreen() {
    const { session, perfil } = useAuth();

    const [canchas, setCanchas] = useState<Cancha[]>([]);
    const [tarifas, setTarifas] = useState<Tarifa[]>([]);
    const [cargandoCatalogo, setCargandoCatalogo] = useState(true);

    const [deporte, setDeporte] = useState<Deporte | null>(null);
    const [fecha, setFecha] = useState<string | null>(null);
    const [hora, setHora] = useState<number | null>(null);
    const [canchaId, setCanchaId] = useState<string | null>(null);

    const [ocupadosPorHora, setOcupadosPorHora] = useState<Record<number, number>>({});
    const [canchasOcupadas, setCanchasOcupadas] = useState<string[]>([]);
    const [cargandoDisponibilidad, setCargandoDisponibilidad] = useState(false);

    const [enviando, setEnviando] = useState(false);
    const [confirmada, setConfirmada] = useState<{ cancha: string; fecha: string; hora: number; precio: number } | null>(null);

    const dias = useMemo(() => proximosDias(21), []);

    useEffect(() => {
        Promise.all([
            supabase.from('canchas').select('id,nombre,deporte'),
            supabase.from('tarifas').select('deporte,hora_desde,hora_hasta,precio,abono')
        ]).then(([canchasRes, tarifasRes]) => {
            setCanchas((canchasRes.data as Cancha[]) || []);
            setTarifas((tarifasRes.data as Tarifa[]) || []);
            setCargandoCatalogo(false);
        });
    }, []);

    const idsCanchasDeporte = useMemo(
        () => canchas.filter((c) => c.deporte === deporte).map((c) => c.id),
        [canchas, deporte]
    );

    // Al elegir deporte o fecha, recarga qué horas están libres.
    useEffect(() => {
        setHora(null);
        setCanchaId(null);
        if (!deporte || !fecha || idsCanchasDeporte.length === 0) {
            setOcupadosPorHora({});
            return;
        }
        setCargandoDisponibilidad(true);
        supabase
            .from('disponibilidad')
            .select('cancha_id,hora')
            .eq('fecha', fecha)
            .in('cancha_id', idsCanchasDeporte)
            .then(({ data }) => {
                const conteo: Record<number, number> = {};
                (data || []).forEach((r: any) => {
                    conteo[r.hora] = (conteo[r.hora] || 0) + 1;
                });
                setOcupadosPorHora(conteo);
                setCargandoDisponibilidad(false);
            });
    }, [deporte, fecha, idsCanchasDeporte.join(',')]);

    // Al elegir hora, recarga qué canchas de ese horario están libres.
    useEffect(() => {
        setCanchaId(null);
        if (!deporte || !fecha || hora == null) {
            setCanchasOcupadas([]);
            return;
        }
        supabase
            .from('disponibilidad')
            .select('cancha_id')
            .eq('fecha', fecha)
            .eq('hora', hora)
            .in('cancha_id', idsCanchasDeporte)
            .then(({ data }) => {
                setCanchasOcupadas((data || []).map((r: any) => r.cancha_id));
            });
    }, [hora]);

    const canchasDelDeporte = canchas.filter((c) => c.deporte === deporte);
    const precio = deporte && hora != null ? precioPorHora(tarifas, deporte, hora) : 0;
    const abono = deporte && hora != null ? abonoPorHora(tarifas, deporte, hora) : 0;
    const canchaElegida = canchasDelDeporte.find((c) => c.id === canchaId);

    async function confirmarReserva() {
        if (!session || !deporte || !fecha || hora == null || !canchaId || !canchaElegida) return;

        setEnviando(true);
        const { error } = await supabase.from('reservas').insert([
            {
                user_id: session.user.id,
                cancha_id: canchaId,
                fecha,
                hora,
                precio,
                monto_pagado: 0,
                tipo_pago: 'abono',
                metodo_pago: 'Pago Presencial',
                nombre_contacto: perfil?.nombre || '',
                documento_contacto: perfil?.documento || '',
                telefono_contacto: perfil?.telefono || '',
                email_contacto: perfil?.email || session.user.email || ''
            }
        ]);
        setEnviando(false);

        if (error) {
            if ((error as any).code === '23505') {
                Alert.alert('Cancha ocupada', 'Justo se ocupó ese horario. Elige otro.');
                setCanchaId(null);
                return;
            }
            Alert.alert('No pudimos confirmar tu reserva', error.message);
            return;
        }

        setConfirmada({ cancha: canchaElegida.nombre, fecha, hora, precio });
        setDeporte(null);
        setFecha(null);
        setHora(null);
        setCanchaId(null);
    }

    if (cargandoCatalogo) {
        return (
            <View style={styles.centro}>
                <ActivityIndicator size="large" color="#c0392b" />
            </View>
        );
    }

    if (confirmada) {
        return (
            <View style={styles.centro}>
                <Text style={styles.confirmadaTitulo}>¡Reserva agendada!</Text>
                <Text style={styles.confirmadaTexto}>
                    {confirmada.cancha} — {confirmada.fecha}, {String(confirmada.hora).padStart(2, '0')}:00 hrs
                </Text>
                <Text style={styles.confirmadaTexto}>Total a pagar en el recinto: {formatCLP(confirmada.precio)}</Text>
                <TouchableOpacity style={styles.boton} onPress={() => setConfirmada(null)}>
                    <Text style={styles.botonTexto}>Hacer otra reserva</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
            <Text style={styles.seccionTitulo}>1. Elige tu deporte</Text>
            <View style={styles.filaOpciones}>
                {(['futbolito', 'padel'] as Deporte[]).map((d) => (
                    <TouchableOpacity
                        key={d}
                        style={[styles.chip, deporte === d && styles.chipSeleccionado]}
                        onPress={() => setDeporte(d)}
                    >
                        <Text style={[styles.chipTexto, deporte === d && styles.chipTextoSeleccionado]}>
                            {DEPORTE_LABELS[d]}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {deporte && (
                <>
                    <Text style={styles.seccionTitulo}>2. Elige la fecha</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                        {dias.map((d) => {
                            const iso = toISODate(d);
                            const seleccionado = fecha === iso;
                            return (
                                <TouchableOpacity
                                    key={iso}
                                    style={[styles.diaChip, seleccionado && styles.chipSeleccionado]}
                                    onPress={() => setFecha(iso)}
                                >
                                    <Text style={[styles.diaChipDia, seleccionado && styles.chipTextoSeleccionado]}>
                                        {d.toLocaleDateString('es-CL', { weekday: 'short' })}
                                    </Text>
                                    <Text style={[styles.diaChipNumero, seleccionado && styles.chipTextoSeleccionado]}>
                                        {d.getDate()}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </>
            )}

            {deporte && fecha && (
                <>
                    <Text style={styles.seccionTitulo}>3. Elige el horario</Text>
                    {cargandoDisponibilidad ? (
                        <ActivityIndicator color="#c0392b" style={{ marginVertical: 12 }} />
                    ) : (
                        <View style={styles.grillaHoras}>
                            {HORAS.map((h) => {
                                const ocupado = (ocupadosPorHora[h] || 0) >= idsCanchasDeporte.length;
                                const seleccionado = hora === h;
                                return (
                                    <TouchableOpacity
                                        key={h}
                                        disabled={ocupado}
                                        style={[
                                            styles.horaChip,
                                            seleccionado && styles.chipSeleccionado,
                                            ocupado && styles.chipDeshabilitado
                                        ]}
                                        onPress={() => setHora(h)}
                                    >
                                        <Text style={[styles.chipTexto, seleccionado && styles.chipTextoSeleccionado]}>
                                            {String(h).padStart(2, '0')}:00
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}
                </>
            )}

            {deporte && fecha && hora != null && (
                <>
                    <Text style={styles.seccionTitulo}>4. Elige la cancha</Text>
                    <View style={styles.filaOpciones}>
                        {canchasDelDeporte.map((c) => {
                            const ocupada = canchasOcupadas.includes(c.id);
                            const seleccionada = canchaId === c.id;
                            return (
                                <TouchableOpacity
                                    key={c.id}
                                    disabled={ocupada}
                                    style={[
                                        styles.chip,
                                        seleccionada && styles.chipSeleccionado,
                                        ocupada && styles.chipDeshabilitado
                                    ]}
                                    onPress={() => setCanchaId(c.id)}
                                >
                                    <Text style={[styles.chipTexto, seleccionada && styles.chipTextoSeleccionado]}>
                                        {c.nombre}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </>
            )}

            {canchaId && (
                <View style={styles.resumen}>
                    <Text style={styles.resumenTitulo}>Resumen</Text>
                    <Text style={styles.resumenLinea}>Precio total: {formatCLP(precio)}</Text>
                    <Text style={styles.resumenLinea}>Abono sugerido: {formatCLP(abono)}</Text>
                    <Text style={styles.resumenNota}>
                        Tu reserva queda agendada de inmediato. El pago se coordina y realiza en el recinto.
                    </Text>
                    <TouchableOpacity style={styles.boton} onPress={confirmarReserva} disabled={enviando}>
                        {enviando ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.botonTexto}>Confirmar Reserva</Text>
                        )}
                    </TouchableOpacity>
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    centro: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    seccionTitulo: { fontSize: 16, fontWeight: '700', color: '#0d3b66', marginTop: 18, marginBottom: 10 },
    filaOpciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    chip: {
        borderWidth: 2,
        borderColor: '#f4f6f5',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        marginRight: 8,
        marginBottom: 8
    },
    chipSeleccionado: { backgroundColor: '#1a6bb5', borderColor: '#1a6bb5' },
    chipDeshabilitado: { opacity: 0.35 },
    chipTexto: { color: '#0d3b66', fontWeight: '600' },
    chipTextoSeleccionado: { color: '#fff' },
    diaChip: {
        borderWidth: 2,
        borderColor: '#f4f6f5',
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
        alignItems: 'center',
        marginRight: 8
    },
    diaChipDia: { fontSize: 12, color: '#4a4a4a', textTransform: 'capitalize' },
    diaChipNumero: { fontSize: 18, fontWeight: '700', color: '#0d3b66' },
    grillaHoras: { flexDirection: 'row', flexWrap: 'wrap' },
    horaChip: {
        borderWidth: 2,
        borderColor: '#f4f6f5',
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginRight: 8,
        marginBottom: 8
    },
    resumen: { marginTop: 24, backgroundColor: '#f4f6f5', borderRadius: 12, padding: 16, marginBottom: 30 },
    resumenTitulo: { fontWeight: '700', fontSize: 16, color: '#0d3b66', marginBottom: 8 },
    resumenLinea: { fontSize: 15, color: '#333', marginBottom: 4 },
    resumenNota: { fontSize: 12, color: '#4a4a4a', marginTop: 8, marginBottom: 12 },
    boton: { backgroundColor: '#c0392b', borderRadius: 24, paddingVertical: 14, alignItems: 'center' },
    botonTexto: { color: '#fff', fontWeight: '700', fontSize: 15 },
    confirmadaTitulo: { fontSize: 22, fontWeight: '700', color: '#1f7a3d', marginBottom: 12 },
    confirmadaTexto: { fontSize: 15, color: '#333', marginBottom: 6, textAlign: 'center' }
});
