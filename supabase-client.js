(function () {
    'use strict';

    // Clave "anon/public": está diseñada para exponerse en el frontend.
    // El acceso real está controlado por las políticas RLS en Supabase,
    // no por mantener esta clave en secreto.
    var SUPABASE_URL = 'https://bpzcnmnlooslsnlihvzx.supabase.co';
    var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwemNubW5sb29zbHNubGlodnp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4Mjk4NDEsImV4cCI6MjEwMjQwNTg0MX0.hGfOTH0f0dHruyr3VGLNMvF6T1XatrzeP2tANtaxtTY';

    window.sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
