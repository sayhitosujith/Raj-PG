import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'virtual:dark-theme.css'
import 'virtual:admin-brand.css'
import { applyTheme, currentTheme } from './theme'
import { AppRoutes } from './AppRoutes.tsx'

// Before the first render, so a dark-mode viewer never sees a flash of the light theme.
applyTheme(currentTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoutes />
  </StrictMode>,
)
