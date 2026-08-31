import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico', 
        'favicon-16x16.png', 
        'favicon-32x32.png', 
        'apple-icon-180x180.png', 
        'ms-icon-310x310.png'
      ],
      manifest: {
        name: 'NetGuard',
        short_name: 'NetGuard',
        description: 'ESP32 Parental Control Gateway',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'android-icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'ms-icon-310x310.png',
            sizes: '310x310',
            type: 'image/png'
          },
          {
            src: 'ms-icon-310x310.png',
            sizes: '310x310',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})
