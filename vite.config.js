import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    proxy: {
      '/beantrack-api': {
        target: 'http://127.0.0.1',
        changeOrigin: true,
      },
    },
  },
})