# Futbolito Chile — App (Expo)

App móvil de reservas, hecha con Expo/React Native. Usa el mismo proyecto de
Supabase que el sitio web (`futbolitochile-web`), así que comparte usuarios,
canchas, tarifas y reservas.

## Qué incluye (v1)

- **Login / Registro** con Supabase Auth (mismas cuentas que el sitio).
- **Reservar**: deporte → fecha → horario → cancha → confirmar. La reserva
  queda agendada de inmediato con **pago presencial** (se paga en el
  recinto) — todavía no está integrado el pago con tarjeta (Banchile Pagos)
  como en la web, porque requiere un checkout que abre en el navegador y
  necesita más trabajo para integrarlo bien en la app.
- **Mis Reservas**: lista las reservas del usuario logueado, con opción de
  anular (usa el mismo endpoint público `api/cancelar-reserva` del sitio).
- **Perfil**: datos de la cuenta y cerrar sesión.

## Cómo correrla en desarrollo

```bash
cd app
npm install
npx expo start
```

Escanea el QR con la app **Expo Go** (Android/iOS) para probarla en tu
celular sin compilar nada.

## Cómo generar el APK

Requiere una cuenta gratuita de Expo (EAS) y la CLI `eas-cli`:

```bash
npm install -g eas-cli
eas login
cd app
eas build:configure
eas build --platform android --profile preview
```

El primer `eas build:configure` crea `eas.json`. Con el perfil `preview` se
genera un `.apk` instalable directo (sin pasar por Google Play), ideal para
probar antes de publicar. Cuando el build termine, `eas build` te da un link
para descargar el `.apk`.

## Pendiente / próximos pasos

- Integrar el pago con tarjeta (Banchile Pagos) — hoy en la app solo queda
  la opción de pago presencial.
- Ícono y splash screen propios (hoy usa los de Expo por defecto) — se
  reemplazan en `assets/icon.png`, `assets/android-icon-*.png` y
  `assets/splash-icon.png`.
- Notificaciones push para avisar confirmaciones/recordatorios.
