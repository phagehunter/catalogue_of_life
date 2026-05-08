import { useEffect, useState } from 'react'
import { getRoots, getStats } from '../api.js'
import TaxonCard from '../components/TaxonCard.jsx'
import Loader from '../components/Loader.jsx'

// The "Explore" landing page is the same as the kingdom list — but the
// page also shows tips for navigating, a teaching aid for first-timers.
export default function Explore() {
  const [roots, setRoots] = useState(null)
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([getRoots(), getStats()])
      .then(([r, s]) => { setRoots(r); setStats(s) })
      .catch(e => setError(e.message || String(e)))
  }, [])

  return (
    <div className="page">
      <h1 style={{ marginTop: 0 }}>Start at a kingdom</h1>
      <p style={{ color: 'var(--ink-dim)', marginTop: 0 }}>
        Click any of the top-level groups below to drill into the tree.
        Each click loads only a small slice of data — the whole catalogue
        never sits in memory at once.
      </p>

      {error ? <div className="error">{error}</div> : null}

      {roots ? (
        <div className="cards">
          {roots.map(r => (
            <TaxonCard key={r.i} taxon={{ i: r.i, n: r.n, r: r.r }} />
          ))}
        </div>
      ) : !error ? <Loader /> : null}

      {stats ? (
        <section className="section" style={{ marginTop: '2rem' }}>
          <h2>What's in here</h2>
          <div className="kv">
            <div className="k">Total accepted + synonym records</div>
            <div className="v">{stats.totalTaxa.toLocaleString()}</div>
            <div className="k">Marked extinct</div>
            <div className="v">{stats.extinctCount.toLocaleString()}</div>
            <div className="k">Common-name records</div>
            <div className="v">{stats.totalVernaculars.toLocaleString()}</div>
            <div className="k">Distribution rows</div>
            <div className="v">{stats.totalDistributionEntries.toLocaleString()}</div>
            <div className="k">Generated</div>
            <div className="v">{stats.generatedAt}</div>
          </div>
        </section>
      ) : null}
    </div>
  )
}
