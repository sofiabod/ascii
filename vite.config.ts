import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: ['es2020', 'safari14', 'firefox128', 'chrome90'],
  },
  server: {
    port: 5555,
  },
})
