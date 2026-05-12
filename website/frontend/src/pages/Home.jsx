import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRoots, getStats } from '../api.js'
import TaxonCard from '../components/TaxonCard.jsx'
import Loader from '../components/Loader.jsx'
import './LCA.css'

export default function Home() {
  const [stats, setStats] = useState(null)
  const [roots, setRoots] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([getStats(), getRoots()])
      .then(([s, r]) => { setStats(s); setRoots(r) })
      .catch(e => setError(e.message || String(e)))
  }, [])

  return (
    <div className="page">
      <section className="hero">
        <h1>Tools for the Tree of Life</h1>
        <p className="lede">
          Five million species. Two million common names. One free, static
          site that lets you do things no other taxonomy explorer can.
        </p>
        <div className="cta-row">
          <Link to="/lca" className="cta primary">★ Compare species →</Link>
          <Link to="/explore" className="cta">Browse the tree</Link>
          <Link to="/search" className="cta">Search a name</Link>
        </div>
      </section>

      {error ? (
        <div className="error">
          <strong>Could not load dataset.</strong> Has the GitHub Action run yet? See the README.
          <div style={{ marginTop: '.5rem', opacity: .8 }}>{error}</div>
        </div>
      ) : null}

      <section className="lca-feature">
        <div className="lca-feature-card">
          <div className="lca-feature-icon" aria-hidden>★</div>
          <div className="lca-feature-body">
            <h3>How related are these species?</h3>
            <p>
              Drop in two to six organisms — by Latin or common name. We build
              a real phylogenetic tree and tell you exactly how closely every
              pair is related: "siblings" (same genus), "cousins" (same family),
              or "kingdom-mates" (totally different body plans).
            </p>
            <p className="lca-feature-examples">
              Curated examples: <em>vertebrate body plans</em> · <em>three
              solutions to flight</em> · <em>same-genus siblings</em>
            </p>
            <Link to="/lca" className="cta primary">Open the comparator →</Link>
          </div>
        </div>
      </section>

      {stats ? <StatStrip stats={stats} /> : !error ? <Loader label="Loading dataset stats" /> : null}

      <section className="section" style={{ marginTop: '1.5rem' }}>
        <h2>Or just browse the kingdoms</h2>
        {roots ? (
          roots.length === 0
            ? <div className="empty">No roots found in the dataset.</div>
            : (
              <div className="cards">
                {roots.map(r => (
                  <TaxonCard
                    key={r.i}
                    taxon={{ i: r.i, n: r.n, r: r.r }}
                  />
                ))}
              </div>
            )
        ) : !error ? <Loader /> : null}
      </section>

      {stats ? <KingdomBreakdown stats={stats} /> : null}
    </div>
  )
}

function StatStrip({ stats }) {
  return (
    <div className="stats">
      <Stat label="Total taxa" value={stats.totalTaxa.toLocaleString()} />
      <Stat label="Common names" value={stats.totalVernaculars.toLocaleString()} />
      <Stat label="Distribution records" value={stats.totalDistributionEntries.toLocaleString()} />
      <Stat
        label="Marked extinct"
        value={stats.extinctCount.toLocaleString()}
        sub={pct(stats.extinctCount, stats.totalTaxa)}
      />
      <Stat label="Top-level groups" value={stats.rootCount.toLocaleString()} />
    </div>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  )
}

function pct(part, whole) {
  if (!whole) return ''
  const p = (part / whole) * 100
  return `${p.toFixed(p < 1 ? 2 : 1)}% of all taxa`
}

// Biodiversity by kingdom — replaces the previous global rank table.
// Drives off stats.kingdomCounts emitted by the Python processor.
function KingdomBreakdown({ stats }) {
  const kc = stats.kingdomCounts || {}
  const kingdoms = Object.entries(kc)
    .map(([name, rankMap]) => {
      const ranks = rankMap || {}
      const total = Object.values(ranks).reduce((a, b) => a + b, 0)
      return {
        name,
        total,
        species: ranks.species || 0,
        genus: ranks.genus || 0,
        family: ranks.family || 0,
      }
    })
    .filter(k => k.total > 0)
    .sort((a, b) => b.total - a.total)

  if (kingdoms.length === 0) return null
  const max = Math.max(...kingdoms.map(k => k.total))

  return (
    <section className="section" style={{ marginTop: '1rem' }}>
      <h2>Biodiversity by kingdom</h2>
      <p style={{ color: 'var(--ink-dim)', marginTop: 0 }}>
        How named taxa are distributed across the major branches of life — the
        full count for each kingdom and how many of those are species.
      </p>
      <div className="rank-chart">
        {kingdoms.map(k => (
          <div
            className="row"
            key={k.name}
            title={`${k.total.toLocaleString()} total · ${k.species.toLocaleString()} species · ${k.genus.toLocaleString()} genera · ${k.family.toLocaleString()} families`}
          >
            <span className="label">
              <em style={{ fontStyle: k.name.startsWith('(') ? 'normal' : 'italic' }}>{k.name}</em>
            </span>
            <span className="bar"><span style={{ width: `${(k.total / max) * 100}%` }} /></span>
            <span className="num">{k.total.toLocaleString()}</span>
          </div>
        ))}
      </div>
      <p style={{ color: 'var(--ink-faint)', fontSize: '0.82rem', marginTop: '0.85rem', marginBottom: 0 }}>
        Total named taxa per kingdom. Hover any row to see the breakdown
        (species / genera / families).
      </p>
    </section>
  )
}
