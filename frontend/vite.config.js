import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Uncomment to proxy API calls during dev (avoids CORS)
      // '/api': 'http://localhost:8000',
    },
  },
})
