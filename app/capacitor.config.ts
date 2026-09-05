import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor envuelve el build web en apps nativas de iOS y Android.
 * `webDir` apunta al resultado de `vite build`.
 */
const config: CapacitorConfig = {
  appId: 'com.jars.rezet',
  appName: 'Rezet',
  webDir: 'dist',
  ios: {
    // La app usa `env(safe-area-inset-*)`, así que el contenido debe llegar
    // hasta el borde y ser la propia app la que respete las áreas seguras.
    contentInset: 'never',
  },
  android: {
    // Sin esto, el teclado empuja el layout y rompe el modo cocinar.
    adjustMarginsForEdgeToEdge: 'force',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#FAFBF9',
      androidScaleType: 'CENTER_CROP',
    },
    Keyboard: {
      resize: 'body',
    },
  },
};

export default config;
