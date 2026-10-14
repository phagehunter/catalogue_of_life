import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { applyStoredTheme } from './components/ThemeToggle.jsx'
import './styles/app.css'

const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')

// Links from the old HashRouter site (…/#/taxon/ID) keep working.
if (window.location.hash.startsWith('#/')) {
  const target = base + window.location.hash.slice(1)
  window.history.replaceState(null, '', target)
}

applyStoredTheme()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={base || '/'}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
