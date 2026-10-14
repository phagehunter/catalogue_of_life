import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { search } from '../data/api.js'
import SearchBox from '../components/SearchBox.jsx'
import Skeleton from '../components/Skeleton.jsx'
import useTitle from '../components/useTitle.js'
import { useMeta } from '../components/MetaContext.jsx'
import { RankPill, StatusPill } from '../components/Pills.jsx'
import { isItalicRank, languageName, formatCount } from '../data/labels.js'

export default function SearchResults() {
  const meta = useMeta()
  const [params] = useSearchParams()
  const q = (params.get('q') || '').trim()
  const [includeBins, setIncludeBins] = useState(false)
  const [state, setState] = useState({ busy: false, res: null, error: null })
  useTitle(q ? `Search: ${q}` : 'Search', `Search results for ${q}`)

  useEffect(() => {
    if (q.length < 2) { setState({ busy: false, res: null, error: null }); return }
    let cancelled = false
    setState(s => ({ ...s, busy: true, error: null }))
    search(q, { limit: 100, includeBins })
      .then(res => { if (!cancelled) setState({ busy: false, res, error: null }) })
      .catch(e => { if (!cancelled) setState({ busy: false, res: null, error: e.message }) })
    return () => { cancelled = true }
  }, [q, includeBins])

  const { busy, res, error } = state
  return (
    <div className="page narrow">
      <h1>Search</h1>
      <SearchBox size="lg" initial={q} autoFocus={!q} placeholder="Scientific name, epithet or common name…" />
      <p className="small muted" style={{ marginTop: '.75rem' }}>
        Matches names that start with what you type: full scientific names (<span className="sci">Panthera tigris</span>), species epithets (<span className="sci">tigris</span>), and common names in any language (tiger, Tigre, 虎).
      </p>
      <div className="toolbar">
        <label><input type="checkbox" checked={includeBins} onChange={e => setIncludeBins(e.target.checked)} /> Include DNA barcode clusters</label>
      </div>

      {error ? <div className="notice error" role="alert">Search failed: {error}</div> : null}
      {busy ? <Skeleton lines={5} label="Searching" /> : null}
      {!busy && res && res.results.length === 0 ? <div className="empty">No names start with <strong>{q}</strong>. Try fewer letters, a genus name, or a common name.</div> : null}
      {!busy && res && res.results.length > 0 ? (
        <>
          <p className="small muted" aria-live="polite">
            {res.partial ? `Showing the most common matches for “${q}”; keep typing to narrow down.` : `${formatCount(res.total)} matching ${res.total === 1 ? 'name' : 'names'}${res.total > res.results.length ? `, showing the first ${res.results.length} taxa` : ''}.`}
          </p>
          <div className="results">
            {res.results.map(r => <Result key={r.i} r={r} ranks={meta.ranks} />)}
          </div>
        </>
      ) : null}
    </div>
  )
}

function Result({ r, ranks }) {
  const sci = r.scientificName || r.name
  const italic = isItalicRank(r.rank, ranks)
  return (
    <Link className="card result" to={`/taxon/${encodeURIComponent(r.i)}`}>
      <span className={'primary' + (italic || r.isVernacular ? ' sci' : '')}>{sci}</span>
      {r.isVernacular ? <span className="secondary">{r.name} <span className="muted">({languageName(r.language)})</span></span>
        : r.commonName ? <span className="secondary">{r.commonName}</span>
        : r.matchedWord ? <span className="secondary">matches “{r.matchedWord}”</span> : null}
      <span className="pills">
        {!r.isVernacular ? <RankPill rank={r.rank} /> : null}
        {r.kind === 'synonym' ? <StatusPill status="synonym" /> : r.kind === 'provisional' ? <StatusPill status="provisionally accepted" /> : null}
      </span>
    </Link>
  )
}
