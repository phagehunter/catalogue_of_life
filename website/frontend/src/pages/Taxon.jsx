import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getTaxon, getTaxa, getLineage } from '../api.js'
import Breadcrumbs from '../components/Breadcrumbs.jsx'
import TaxonCard from '../components/TaxonCard.jsx'
import Loader from '../components/Loader.jsx'

const RANK_LABEL = {
  kingdom: 'Kingdom', phylum: 'Phylum', class: 'Class',
  order: 'Order', family: 'Family', genus: 'Genus', species: 'Species',
}

export default function Taxon() {
  const { id } = useParams()
  const [taxon, setTaxon] = useState(null)
  const [chain, setChain] = useState([])
  const [children, setChildren] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setTaxon(null)
    setChildren(null)
    setChain([])
    setError(null)

    ;(async () => {
      try {
        const t = await getTaxon(id)
        if (cancelled) return
        if (!t) { setError(`Taxon ${id} not found in dataset.`); return }
        setTaxon(t)
        // Lineage and children fetched in parallel.
        const [lineage, kids] = await Promise.all([
          getLineage(id),
          t.c?.length ? getTaxa(t.c) : Promise.resolve([]),
        ])
        if (cancelled) return
        setChain(lineage)
        setChildren(kids)
      } catch (e) {
        if (!cancelled) setError(e.message || String(e))
      }
    })()

    return () => { cancelled = true }
  }, [id])

  if (error) {
    return (
      <div className="page">
        <Breadcrumbs chain={[]} />
        <div className="error">{error}</div>
        <p><Link to="/explore">← Back to Explore</Link></p>
      </div>
    )
  }
  if (!taxon) return <Loader label="Loading taxon" />

  const rank = taxon.r
  const isUnranked = !rank || rank === 'unranked'
  const verns = taxon.v || []
  const lineage = taxon.L || {}

  return (
    <div className="page">
      <Breadcrumbs chain={chain} />

      <header className="taxon-header">
        <h1 className={isUnranked ? 'unranked' : ''}>
          {taxon.n}
          {taxon.a ? <span className="authorship">{taxon.a}</span> : null}
        </h1>
        {verns.length > 0 ? (
          <div className="vern-list">
            {verns.map((v, i) => (
              <span key={i}>
                {v.n}
                {v.l ? <span className="lang">{v.l}</span> : null}
              </span>
            ))}
          </div>
        ) : null}
        <div className="pills">
          {rank ? <span className={`pill rank-${rank}`}>{rank}</span> : null}
          {taxon.s ? <span className={`pill status-${taxon.s}`}>{taxon.s}</span> : null}
          {taxon.x ? <span className="pill extinct">extinct ✝</span> : null}
          {taxon.e ? <span className="pill">{taxon.e}</span> : null}
          {taxon.c?.length
            ? <span className="pill">{taxon.c.length.toLocaleString()} direct children</span>
            : null}
        </div>
      </header>

      <div className="two-col">
        <section className="section">
          <h2>Classification</h2>
          {Object.keys(lineage).length === 0
            ? <div className="empty" style={{ padding: '.75rem' }}>
                No denormalised lineage data — see breadcrumb above for the actual parent chain.
              </div>
            : (
              <div className="kv">
                {entries(lineage).map(([k, v]) => (
                  <RowEither key={k} k={RANK_LABEL[expand(k)] || expand(k)} v={v} />
                ))}
              </div>
            )}
        </section>

        <section className="section">
          <h2>Identifiers & links</h2>
          <div className="kv">
            <div className="k">CoL ID</div>
            <div className="v" style={{ fontFamily: 'ui-monospace, monospace' }}>{taxon.i}</div>
            {taxon.p ? (<>
              <div className="k">Parent</div>
              <div className="v">
                <Link to={`/taxon/${encodeURIComponent(taxon.p)}`}>{taxon.p}</Link>
              </div>
            </>) : null}
            {taxon.l ? (<>
              <div className="k">External link</div>
              <div className="v">
                <a href={taxon.l} target="_blank" rel="noreferrer">{shorten(taxon.l, 60)}</a>
              </div>
            </>) : null}
          </div>
        </section>
      </div>

      {taxon.d?.length ? (
        <section className="section">
          <h2>Distribution <span className="count">{taxon.d.length}</span></h2>
          <div className="distribution-list">
            {taxon.d.map((d, i) => (
              <span key={i} className="pill" title={
                [d.g && `gazetteer: ${d.g}`, d.e && `establishment: ${d.e}`, d.t && `threat: ${d.t}`]
                  .filter(Boolean).join(' · ')
              }>{d.a}</span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="section">
        <h2>
          Children
          {children ? <span className="count">{children.length.toLocaleString()}</span> : null}
        </h2>
        {!children
          ? <Loader />
          : children.length === 0
            ? <div className="empty">This is a leaf — no further descendants in the dataset.</div>
            : (
              <div className="cards">
                {children.map(c => <TaxonCard key={c.i} taxon={c} />)}
              </div>
            )}
      </section>
    </div>
  )
}

function entries(obj) {
  const order = ['k', 'ph', 'cl', 'or', 'fa', 'ge', 'sp']
  return order.filter(k => obj[k]).map(k => [k, obj[k]])
}

function expand(k) {
  return ({
    k: 'kingdom', ph: 'phylum', cl: 'class',
    or: 'order', fa: 'family', ge: 'genus', sp: 'species',
  })[k] || k
}

function RowEither({ k, v }) {
  return (<>
    <div className="k">{k}</div>
    <div className="v">{v}</div>
  </>)
}

function shorten(s, n) {
  if (!s) return ''
  if (s.length <= n) return s
  return s.slice(0, n - 1) + '…'
}
