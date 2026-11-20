/* ============================================================================
   Supabase/PostgREST corta en silencio cualquier .select() sin paginar en
   1000 filas (el límite por defecto), sin ningún error: una tabla que crece
   con el tiempo (reservas, clientes, etc.) un día simplemente empieza a
   devolver menos filas de las que realmente tiene, y nadie se entera hasta
   que falta algo. Pasó de verdad con "reservas" en el panel admin (ver
   admin.js, consultarReservasConColumnas).

   window.fetchTodasLasFilas() es el estándar del proyecto para evitar esto:
   cualquier consulta sobre una tabla que pueda superar las 1000 filas algún
   día debería usar esta función en vez de un .select() directo.

   Uso: en vez de
       sb.from('reservas').select('*').order('fecha')
   se arma una función que recibe el rango (desde/hasta) y arma esa misma
   consulta con .range() aplicado, y se le pasa a fetchTodasLasFilas:
       window.fetchTodasLasFilas(function (desde, hasta) {
           return sb.from('reservas').select('*').order('fecha').range(desde, hasta);
       }).then(function (result) { ... result.data, result.error ... });

   Tiene que ser una función (no el query ya armado) porque un query builder
   de Supabase se "gasta" al usarlo una vez: cada página necesita su propia
   instancia nueva con el .range() que le corresponde.
   ============================================================================ */
(function () {
    'use strict';

    function fetchTodasLasFilas(construirConsulta, pageSize) {
        pageSize = pageSize || 1000;

        function pagina(desde, acumulado) {
            return construirConsulta(desde, desde + pageSize - 1).then(function (result) {
                if (result.error) return result;

                var filas = result.data || [];
                var todas = acumulado.concat(filas);

                // Si la página volvió llena, puede que haya más: pide la
                // siguiente. Si volvió incompleta, ya se llegó al final.
                if (filas.length === pageSize) {
                    return pagina(desde + pageSize, todas);
                }
                return { data: todas, error: null };
            });
        }

        return pagina(0, []);
    }

    window.fetchTodasLasFilas = fetchTodasLasFilas;
})();
