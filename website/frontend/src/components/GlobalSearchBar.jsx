import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { search } from '../api.js'

// Lives in the topbar. Debounced autocomplete, keyboard nav.
export default function GlobalSearchBar() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const ref = useRef(null)
  const navigate = useNavigate()

  // Debounce the actual fetch so typing feels responsive.
  useEffect(() => {
    if (q.length < 2) { setResults([]); return }
    let cancelled = false
    const handle = setTimeout(async () => {
      try {
        const r = await search(q, { limit: 12 })
        if (!cancelled) {
          setResults(r)
          setActive(0)
        }
      } catch { /* ignored — index may be missing in dev */ }
    }, 130)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [q])

  // Click outside closes the dropdown.
  useEffect(() => {
    function onDocClick(e) {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  function go(entry) {
    setOpen(false)
    setQ('')
    setResults([])
    navigate(`/taxon/${encodeURIComponent(entry.i)}`)
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[active]) go(results[active])
      else if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={ref} className="search-form" style={{ margin: 0 }}>
      <input
        type="search"
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder="Search species, genera, common names…"
        aria-label="Search the Catalogue of Life"
      />
      {open && results.length > 0 ? (
        <div className="suggest" role="listbox">
          {results.map((r, i) => (
            <a
              key={r.i + '|' + r.n + '|' + i}
              className={'suggest-item' + (i === active ? ' active' : '')}
              onMouseDown={e => { e.preventDefault(); go(r) }}
              onMouseEnter={() => setActive(i)}
              href={`#/taxon/${encodeURIComponent(r.i)}`}
            >
              <span className={'nm' + (r.v ? ' vern' : '')}>{r.n}</span>
              <span className="ranklbl">{r.v ? 'common' : (r.r || '')}</span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  )
}
