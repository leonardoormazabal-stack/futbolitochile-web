export type Deporte = 'futbolito' | 'padel';

export const DEPORTE_LABELS: Record<Deporte, string> = {
    futbolito: 'Futbolito',
    padel: 'Pádel'
};

export interface Cancha {
    id: string;
    nombre: string;
    deporte: Deporte;
}

export interface Tarifa {
    deporte: Deporte;
    hora_desde: number;
    hora_hasta: number;
    precio: number;
    abono: number | null;
}

export interface Reserva {
    id: string;
    fecha: string;
    hora: number;
    cancha_id: string;
    precio: number;
    monto_pagado: number;
    monto_pagado_2: number | null;
    tipo_pago: 'completo' | 'abono';
    metodo_pago: string | null;
    estado: 'confirmada' | 'pendiente' | 'cancelada';
    nombre_contacto: string;
    canchas?: { nombre: string; deporte: Deporte } | null;
}

function bloqueMasTardio(tabla: Tarifa[]): Tarifa | null {
    let masTardio: Tarifa | null = null;
    for (const t of tabla) {
        if (!masTardio || t.hora_desde > masTardio.hora_desde) masTardio = t;
    }
    return masTardio;
}

// Misma lógica que getPrecioPorHora/getAbonoPorHora en reservas.js: si
// ninguna tarifa cubre exactamente la hora pedida, usa el bloque más
// tardío en vez de cobrar $0 por error.
export function precioPorHora(tarifas: Tarifa[], deporte: Deporte, hora: number): number {
    const tabla = tarifas.filter((t) => t.deporte === deporte);
    for (const t of tabla) {
        if (hora >= t.hora_desde && hora < t.hora_hasta) return t.precio;
    }
    const masTardio = bloqueMasTardio(tabla);
    return masTardio ? masTardio.precio : 0;
}

export function abonoPorHora(tarifas: Tarifa[], deporte: Deporte, hora: number): number {
    const tabla = tarifas.filter((t) => t.deporte === deporte);
    for (const t of tabla) {
        if (hora >= t.hora_desde && hora < t.hora_hasta) return t.abono != null ? t.abono : 10000;
    }
    const masTardio = bloqueMasTardio(tabla);
    return masTardio && masTardio.abono != null ? masTardio.abono : 10000;
}

export function formatCLP(n: number): string {
    return '$' + Math.round(n || 0).toLocaleString('es-CL');
}

export function toISODate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
