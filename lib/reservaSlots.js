/* ============================================================================
   Lógica compartida para reservar un horario con un pago que no se cobra al
   instante (tarjeta vía Banchile mientras el cliente paga en la pasarela, o
   transferencia mientras se espera el comprobante): ambas crean la reserva
   en estado "pendiente" con un vencimiento, y usan exactamente la misma
   regla para decidir si un horario está ocupado. Centralizarla acá evita que
   terminen revisando la disponibilidad de forma distinta y se desincronicen.
   ============================================================================ */

function getPrecioPorHora(tarifas, deporte, hora) {
    const tabla = tarifas.filter((t) => t.deporte === deporte);
    for (const t of tabla) {
        if (hora >= t.hora_desde && hora < t.hora_hasta) return t.precio;
    }
    let masTardio = null;
    tabla.forEach((t) => { if (!masTardio || t.hora_desde > masTardio.hora_desde) masTardio = t; });
    return masTardio ? masTardio.precio : 0;
}

function getAbonoPorHora(tarifas, deporte, hora) {
    const tabla = tarifas.filter((t) => t.deporte === deporte);
    for (const t of tabla) {
        if (hora >= t.hora_desde && hora < t.hora_hasta) return t.abono != null ? t.abono : 10000;
    }
    let masTardio = null;
    tabla.forEach((t) => { if (!masTardio || t.hora_desde > masTardio.hora_desde) masTardio = t; });
    return masTardio && masTardio.abono != null ? masTardio.abono : 10000;
}

// 0 = domingo ... 6 = sábado, igual que JS Date.getDay(). fechaISO es
// 'YYYY-MM-DD'; se arma la fecha con año/mes/día sueltos (no con el string
// completo) para que quede en hora local y no se corra un día por UTC.
function diaSemanaDeFecha(fechaISO) {
    const [anio, mes, dia] = fechaISO.split('-').map(Number);
    return new Date(anio, mes - 1, dia).getDay();
}

// Devuelve la promo de horario (ej. "Sábados y Domingos 19-22h $30.000") que
// aplica para ese deporte/fecha/hora, o null si ninguna activa matchea. Un
// precio promocional es pago completo únicamente (lo decide quien llama,
// forzando tipo_pago = 'completo' cuando esto devuelve una promo).
function getPromoAplicable(promos, deporte, hora, fechaISO) {
    if (!fechaISO) return null;
    const dia = diaSemanaDeFecha(fechaISO);
    return (promos || []).find((p) => {
        return p.activo && p.deporte === deporte &&
            (p.dias_semana || []).includes(dia) &&
            hora >= p.hora_desde && hora < p.hora_hasta;
    }) || null;
}

// Una reserva "pendiente" vencida (su plazo para pagar o transferir ya pasó
// sin confirmarse) no debe seguir bloqueando el horario. No hay un barrido
// periódico que las limpie solas, así que esto se llama justo antes de que
// alguien más intente reservar ese mismo horario: si no se borrara, la
// restricción UNIQUE (cancha_id, fecha, hora) de todas formas impediría
// crear la reserva nueva, aunque la vieja ya no debería contar como
// "ocupada". Esto es lo que pasó con una reserva real por Transferencia que
// nadie pagó: quedó bloqueando la cancha hasta que un administrador la
// anuló a mano.
async function liberarPendienteVencida(supabaseAdmin, canchaId, fecha, hora) {
    await supabaseAdmin
        .from('reservas')
        .delete()
        .eq('cancha_id', canchaId)
        .eq('fecha', fecha)
        .eq('hora', hora)
        .eq('estado', 'pendiente')
        .lte('pendiente_expira_en', new Date().toISOString());
}

// Verdadero si ese horario ya está tomado: una reserva confirmada, o una
// "pendiente" cuyo plazo para pagar todavía no venció.
async function horarioOcupado(supabaseAdmin, canchaId, fecha, hora) {
    const { data: ocupantes, error } = await supabaseAdmin
        .from('reservas')
        .select('id,estado,pendiente_expira_en')
        .eq('cancha_id', canchaId)
        .eq('fecha', fecha)
        .eq('hora', hora);

    if (error) throw new Error('No se pudo verificar la disponibilidad.');

    const ahoraIso = new Date().toISOString();
    return (ocupantes || []).some((r) => {
        return r.estado === 'confirmada' || (r.estado === 'pendiente' && r.pendiente_expira_en && r.pendiente_expira_en > ahoraIso);
    });
}

module.exports = { getPrecioPorHora, getAbonoPorHora, getPromoAplicable, liberarPendienteVencida, horarioOcupado };
