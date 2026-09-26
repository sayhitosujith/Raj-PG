import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { darkThemePlugin } from './theme/darkThemePlugin.ts'

// https://vite.dev/config/
export default defineConfig({
  // Dark mode is generated from these light stylesheets; see theme/darkThemePlugin.ts.
  plugins: [react(), darkThemePlugin(['src/index.css', 'src/App.css'])],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
