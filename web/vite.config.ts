import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { darkThemePlugin } from './theme/darkThemePlugin.ts'

// https://vite.dev/config/
export default defineConfig({
  // Dark mode is generated from these light stylesheets; see theme/darkThemePlugin.ts.
  plugins: [react(), darkThemePlugin(['src/index.css', 'src/App.css'])],
  build: {
    // Flags stay separate files so the nationality picker's ~250 flag URLs don't inline as data
    // URIs into the main bundle; each flag downloads only when its option is shown.
    assetsInlineLimit: (file) => (file.includes('flag-icons') ? false : undefined),
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
