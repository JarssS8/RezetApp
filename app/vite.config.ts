import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Rezet',
        short_name: 'Rezet',
        description: 'Planifica, cocina y controla tu despensa sin esfuerzo.',
        lang: 'es',
        // --accent y --bg (tema claro) de tokens.css, convertidos a sRGB:
        // un manifest no puede referenciar variables CSS.
        theme_color: '#308054',
        background_color: '#f8faf6',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Shell de la app en caché; los datos de Supabase nunca (se sirven
        // por red siempre — cachearlos aquí desincroniza pantry/plan entre
        // pestañas y contradice el punto de tener tiempo real).
        globPatterns: ['**/*.{js,css,html,svg}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin.includes('supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  build: {
    // Capacitor sirve estos archivos desde el propio bundle nativo.
    assetsDir: 'assets',
    sourcemap: false,
  },
});
