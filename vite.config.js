import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/serao/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['serao-logo.png', 'fonts/**'],
      manifest: {
        name: 'SERAO — Marketplace Malgache',
        short_name: 'SERAO',
        description: 'La marketplace des produits malgaches authentiques',
        theme_color: '#1F8A5B',
        background_color: '#EEF4F1',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/serao/',
        start_url: '/serao/',
        lang: 'fr',
        categories: ['shopping', 'lifestyle'],
        icons: [
          { src: 'icons/icon-72.png',   sizes: '72x72',   type: 'image/png' },
          { src: 'icons/icon-96.png',   sizes: '96x96',   type: 'image/png' },
          { src: 'icons/icon-128.png',  sizes: '128x128', type: 'image/png' },
          { src: 'icons/icon-144.png',  sizes: '144x144', type: 'image/png' },
          { src: 'icons/icon-152.png',  sizes: '152x152', type: 'image/png' },
          { src: 'icons/icon-192.png',  sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icons/icon-384.png',  sizes: '384x384', type: 'image/png' },
          { src: 'icons/icon-512.png',  sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        screenshots: [
          { src: 'screenshot-mobile.png', sizes: '390x844', type: 'image/png', form_factor: 'narrow', label: 'SERAO Accueil' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Images & vidéos du bucket public : cache long (les fichiers sont
            // immuables, chaque upload a un nom horodaté unique)
            urlPattern: /^https:\/\/.*supabase\.co\/storage\/v1\/object\/public\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'supabase-media', expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            urlPattern: /^https:\/\/.*supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'supabase-cache', expiration: { maxEntries: 50, maxAgeSeconds: 300 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            // Tuiles de carte (page Livraison)
            urlPattern: /^https:\/\/.*basemaps\.cartocdn\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'map-tiles', expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 } },
          },
        ],
      },
    }),
  ],
  build: {
    // Découpage du bundle : React et Supabase en chunks séparés (cache navigateur
    // stable entre les déploiements), Leaflet est déjà en import dynamique.
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  server: { port: 5173, open: true },
});
