import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { host } from './host/vite.ts'

export default defineConfig({
  clearScreen: false,
  build: { cssTarget: 'es2025' },
  envPrefix: 'TAURI_ENV_',
  server: {
    cors: false,
    fs: { allow: ['index.html', 'src', 'cards', 'node_modules'] },
    watch: { ignored: ['**/src-tauri/**'] },
  },
  plugins: [
    tanstackRouter({ addExtensions: true }),
    react(),
    tailwindcss(),
    ...(process.env.TAURI_ENV_PLATFORM ? [] : [host()]),
  ],
})
