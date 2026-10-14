import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { search } from '../data/api.js'
import { useMeta } from './MetaContext.jsx'
import { SearchIcon } from './Icons.jsx'
import { isItalicRank, languageName, rankLabel } from '../data/labels.js'

// Accessible combobox (WAI-ARIA 1.2 pattern). By default a pick navigates to
// the taxon page; pass onPick to handle it yourself (Compare uses that).
export default function SearchBox({ size = 'md', placeholder = 'Search species, genera, common names…', autoFocus = false, onPick, label = 'Search the Catalogue of Life', initial = '', includeBins = false }) {
  const meta = useMeta()
  const navigate = useNavigate()
  const id = useId()
  const [q, setQ] = useState(initial)
  const [res, setRes] = useState({ results: [], partial: false })
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [busy, setBusy] = useState(false)
  const root = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { setQ(initial) }, [initial])

  useEffect(() => {
    if (q.trim().length < 2) { setRes({ results: [], partial: false }); setBusy(false); return }
    let cancelled = false
    setBusy(true)
    const t = setTimeout(async () => {
      try {
        const r = await search(q, { limit: 10, includeBins })
        if (!cancelled) { setRes(r); setActive(-1) }
      } catch {
        if (!cancelled) setRes({ results: [], partial: false })
      } finally {
        if (!cancelled) setBusy(false)
      }
    }, 120)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q, includeBins])

  useEffect(() => {
    function onDoc(e) { if (!root.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [])

  function pick(item) {
    setOpen(false)
    setActive(-1)
    if (onPick) { onPick(item); setQ(''); return }
    setQ('')
    navigate(`/taxon/${encodeURIComponent(item.i)}`)
  }
  function submit() {
    const term = q.trim()
    if (!term) return
    setOpen(false)
    if (onPick) { if (res.results[0]) pick(res.results[0]); return }
    navigate(`/search?q=${encodeURIComponent(term)}`)
  }
  function onKey(e) {
    const n = res.results.length
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => (n ? (a + 1) % n : -1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (n ? (a <= 0 ? n - 1 : a - 1) : -1)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0 && res.results[active]) pick(res.results[active]); else submit() }
    else if (e.key === 'Escape') { if (open) { e.preventDefault(); setOpen(false) } else setQ('') }
    else if (e.key === 'Home' && open) { e.preventDefault(); setActive(0) }
    else if (e.key === 'End' && open) { e.preventDefault(); setActive(n - 1) }
  }

  const listId = `${id}-list`
  const showList = open && q.trim().length >= 2 && (res.results.length > 0 || !busy)
  return (
    <div ref={root} className={`searchbox ${size}`}>
      <label htmlFor={`${id}-input`} className="visually-hidden">{label}</label>
      <SearchIcon className="icon" />
      <input
        id={`${id}-input`} ref={inputRef} type="text" value={q} autoFocus={autoFocus}
        placeholder={placeholder} autoComplete="off" spellCheck="false"
        role="combobox" aria-autocomplete="list" aria-expanded={showList} aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)} onKeyDown={onKey}
      />
      {showList ? (
        <ul id={listId} role="listbox" className="listbox" aria-label="Suggestions">
          {res.results.map((r, i) => (
            <li key={r.i + ':' + i} id={`${id}-opt-${i}`} role="option" aria-selected={i === active}
              className="option" onMouseEnter={() => setActive(i)}
              onMouseDown={e => e.preventDefault()} onClick={() => pick(r)}>
              <Highlight className={'primary' + (!r.isVernacular && isItalicRank(r.rank, meta.ranks) ? ' sci' : '')} text={r.name} q={res.query} />
              {r.isVernacular && r.scientificName ? <span className="secondary sci">{r.scientificName}</span>
                : r.commonName ? <span className="secondary">{r.commonName}</span>
                : r.matchedWord ? <span className="secondary">matches “{r.matchedWord}”</span> : null}
              <span className="tag">{r.isVernacular ? `${languageName(r.language)} name` : r.kind === 'synonym' ? 'synonym' : rankLabel(r.rank)}</span>
            </li>
          ))}
          {res.results.length === 0 && !busy ? <li className="hint" role="presentation">No names start with “{q.trim()}”.</li> : null}
          {res.partial ? <li className="hint" role="presentation">Showing the most common matches. Keep typing to narrow down.</li> : null}
          {!onPick && res.results.length > 0 ? <li className="hint" role="presentation">Press Enter for all results.</li> : null}
        </ul>
      ) : null}
      <span className="visually-hidden" aria-live="polite">{showList && res.results.length ? `${res.results.length} suggestions available` : ''}</span>
    </div>
  )
}

function Highlight({ text, q, className }) {
  const lower = text.toLowerCase()
  const i = q ? lower.indexOf(q) : -1
  if (i < 0) return <span className={className}>{text}</span>
  return <span className={className}>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</span>
}
