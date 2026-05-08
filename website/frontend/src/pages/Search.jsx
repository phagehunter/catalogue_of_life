import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { search } from '../api.js'
import TaxonCard from '../components/TaxonCard.jsx'
import { getTaxa } from '../api.js'
import Loader from '../components/Loader.jsx'

// Full-page search. Loads richer cards (with rank/lineage hints) than the
// suggest dropdown.
export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const initial = params.get('q') || ''
  const [q, setQ] = useState(initial)
  const [hits, setHits] = useState([])
  const [taxa, setTaxa] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => { setQ(initial) }, [initial])

  useEffect(() => {
    if (q.length < 2) { setHits([]); setTaxa([]); return }
    let cancelled = false
    setBusy(true)
    const handle = setTimeout(async () => {
      try {
        const results = await search(q, { limit: 60 })
        if (cancelled) return
        setHits(results)
        // Hydrate full taxon records so cards show ranks/lineage/extinct flags.
        const records = await getTaxa([...new Set(results.map(r => r.i))])
        if (!cancelled) setTaxa(records)
      } finally {
        if (!cancelled) setBusy(false)
      }
    }, 150)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [q])

  function onSubmit(e) {
    e.preventDefault()
    setParams(q ? { q } : {})
  }

  return (
    <div className="page">
      <h1 style={{ marginTop: 0 }}>Search</h1>
      <p style={{ color: 'var(--ink-dim)' }}>
        Try a Latin name (<i>Panthera tigris</i>), a genus (<i>Quercus</i>),
        or a common name (<i>tiger shark</i>, <i>english oak</i>).
      </p>
      <form className="search-form" onSubmit={onSubmit}>
        <input
          type="search"
          autoFocus
          value={q}
          placeholder="Search names…"
          onChange={e => setQ(e.target.value)}
        />
      </form>

      {busy ? <Loader label={`Searching "${q}"`} /> : null}

      {!busy && q.length >= 2 && hits.length === 0
        ? <div className="empty">No matches for <strong>{q}</strong>.</div>
        : null}

      {hits.length > 0 ? (
        <>
          <div style={{ color: 'var(--ink-faint)', marginBottom: '.75rem' }}>
            {hits.length} match{hits.length === 1 ? '' : 'es'}
          </div>
          <div className="results">
            {taxa.map(t => <TaxonCard key={t.i} taxon={t} />)}
          </div>
        </>
      ) : null}
    </div>
  )
}
