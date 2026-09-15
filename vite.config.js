import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Firebase y React cambian poco: en archivos aparte, el navegador los conserva en
        // caché (un año, ver firebase.json) aunque se publique una versión nueva del sistema.
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          react: ['react', 'react-dom', 'react-dom/client']
        }
      }
    }
  },
  test: {
    // Solo pruebas de lógica pura. Las de reglas (tests/*.rules.test.mjs) necesitan el
    // emulador y se corren con `npm run test:rules`.
    include: ['tests/unit/**/*.test.js'],
    // Hora de Nicaragua: varias funciones dependen de la fecha local.
    env: { TZ: 'America/Managua' }
  },
})
