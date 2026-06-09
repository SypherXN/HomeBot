import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'github-pages-spa-fallback',
      closeBundle() {
        const index = resolve(__dirname, 'dist/index.html')
        copyFileSync(index, resolve(__dirname, 'dist/404.html'))
      },
    },
  ],
  base: process.env.VITE_BASE_PATH ?? '/',
})
