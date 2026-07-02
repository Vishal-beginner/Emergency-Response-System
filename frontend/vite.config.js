import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendTarget = process.env.BACKEND_URL || 'http://localhost:4000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy API/WebSocket calls through the Vite dev server itself, so the
    // browser only ever talks to one origin. This matters whenever the app
    // is accessed through a forwarded/proxied URL (remote dev containers,
    // Claude Code on the web, etc.) -- a hardcoded "http://localhost:4000"
    // in client-side code would resolve against the *browser's* machine,
    // not this container, and silently fail to connect.
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/socket.io': {
        target: backendTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
