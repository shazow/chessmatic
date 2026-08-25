import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png'],
      manifest: {
        id: '.',
        name: 'Chessmatic — Chess Puzzle Autobattler',
        short_name: 'Chessmatic',
        description: 'A mobile-friendly chess puzzle autobattler.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#1a2d24',
        theme_color: '#22392e',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Hashed assets and icons are precached; index.html is deliberately
        // NOT precached — navigations go network-first below so a fresh load
        // always gets the latest deploy, falling back to cache when offline.
        globPatterns: ['**/*.{js,css,json,svg,png}'],
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 4,
            },
          },
        ],
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
  },
});
