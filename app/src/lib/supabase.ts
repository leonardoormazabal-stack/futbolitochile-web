import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Mismo proyecto de Supabase que usa el sitio web (ver supabase-client.js en
// la raíz del repo). La clave "anon" está pensada para exponerse en el
// cliente: el acceso real lo controlan las políticas RLS en Supabase.
const SUPABASE_URL = 'https://bpzcnmnlooslsnlihvzx.supabase.co';
const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwemNubW5sb29zbHNubGlodnp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4Mjk4NDEsImV4cCI6MjEwMjQwNTg0MX0.hGfOTH0f0dHruyr3VGLNMvF6T1XatrzeP2tANtaxtTY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
    }
});
