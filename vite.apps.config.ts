import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  root: 'src/apps',
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    rolldownOptions: { input: 'src/apps/portfolio.html' },
    outDir: '../../cards',
    emptyOutDir: true,
    cssTarget: 'es2025',
  },
})
