import { useEffect, useState } from 'react'
import { SunIcon, MoonIcon } from './Icons.jsx'

const KEY = 'col-explorer-theme'

function stored() {
  try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : null } catch { return null }
}
function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// Called before first render so there is no flash when a theme was chosen.
export function applyStoredTheme() {
  const t = stored()
  if (t) document.documentElement.dataset.theme = t
}

export default function ThemeToggle() {
  const [choice, setChoice] = useState(stored)          // null = follow the OS
  const [system, setSystem] = useState(systemTheme)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const onChange = () => setSystem(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  useEffect(() => {
    if (choice) document.documentElement.dataset.theme = choice
    else delete document.documentElement.dataset.theme
    try { choice ? localStorage.setItem(KEY, choice) : localStorage.removeItem(KEY) } catch { /* private mode */ }
  }, [choice])
  const current = choice || system
  const next = current === 'dark' ? 'light' : 'dark'
  return (
    <button type="button" className="theme-toggle" onClick={() => setChoice(next)}
      aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      {current === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
