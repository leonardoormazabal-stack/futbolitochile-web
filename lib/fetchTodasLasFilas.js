/* ============================================================================
   Supabase/PostgREST corta en silencio cualquier .select() sin paginar en
   1000 filas (el límite por defecto), sin ningún error: una tabla que crece
   con el tiempo (reservas, profiles, etc.) un día simplemente empieza a
   devolver menos filas de las que realmente tiene, y nadie se entera hasta
   que falta algo. Pasó de verdad con "reservas" en el panel admin (ver
   fetch-todas-las-filas.js, la versión para el navegador; esta es la misma
   idea para los endpoints serverless que usan supabaseAdmin).

   Estándar del proyecto: cualquier consulta desde api/ o lib/ sobre una
   tabla que pueda superar las 1000 filas algún día debería usar esto en vez
   de un .select() directo sin .eq()/rango de fecha que la acote.

   Uso:
       const { fetchTodasLasFilas } = require('./fetchTodasLasFilas');
       const { data, error } = await fetchTodasLasFilas((desde, hasta) =>
           supabaseAdmin.from('reservas').select('*').order('fecha').range(desde, hasta)
       );

   Tiene que ser una función (no el query ya armado) porque un query builder
   de Supabase se "gasta" al usarlo una vez: cada página necesita su propia
   instancia nueva con el .range() que le corresponde.
   ============================================================================ */

async function fetchTodasLasFilas(construirConsulta, pageSize) {
    pageSize = pageSize || 1000;

    let desde = 0;
    let todas = [];

    for (;;) {
        const result = await construirConsulta(desde, desde + pageSize - 1);
        if (result.error) return result;

        const filas = result.data || [];
        todas = todas.concat(filas);

        // Si la página volvió llena, puede que haya más: pide la
        // siguiente. Si volvió incompleta, ya se llegó al final.
        if (filas.length < pageSize) return { data: todas, error: null };
        desde += pageSize;
    }
}

module.exports = { fetchTodasLasFilas };
