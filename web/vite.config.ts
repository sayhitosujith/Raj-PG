import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { brandThemePlugin } from './theme/brandThemePlugin.ts'
import { darkThemePlugin } from './theme/darkThemePlugin.ts'

// https://vite.dev/config/
export default defineConfig({
  // Dark mode is generated from these light stylesheets; see theme/darkThemePlugin.ts. portalNeutral.css
  // is included so the resident portal's greys turn into dark greys rather than falling back to the
  // owner pages' dark greens.
  // The owner's theme colour for the admin pages is generated from App.css; see theme/brandThemePlugin.ts.
  plugins: [react(), darkThemePlugin(['src/index.css', 'src/App.css', 'src/portalNeutral.css']), brandThemePlugin('src/App.css')],
  build: {
    // Flags stay separate files so the nationality picker's ~250 flag URLs don't inline as data
    // URIs into the main bundle; each flag downloads only when its option is shown.
    assetsInlineLimit: (file) => (file.includes('flag-icons') ? false : undefined),
  },
  server: {
    // Fail instead of drifting to 5174+: a silent port change left a stale dev server on 5173 serving old code.
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
