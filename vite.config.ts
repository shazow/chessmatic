import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/chessmatic/' : '/',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png'],
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
        globPatterns: ['**/*.{html,js,css,json,svg,png}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
  },
});
