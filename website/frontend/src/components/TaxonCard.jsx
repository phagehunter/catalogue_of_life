import { Link } from 'react-router-dom'

// Compact card for grids of taxa (children, search results, kingdom list).
// Tolerates missing fields — every property except `i`/`n` is optional.
export default function TaxonCard({ taxon }) {
  if (!taxon) return null
  const rank = taxon.r || ''
  const isUnranked = !rank || rank === 'unranked'
  const verns = taxon.v || []
  const primaryVern = verns.find(v => v.p) || verns[0]
  return (
    <Link className="card" to={`/taxon/${encodeURIComponent(taxon.i)}`}>
      <div className={`name${isUnranked ? ' unranked' : ''}`}>
        {taxon.n}
        {taxon.a ? <span className="meta"> {taxon.a}</span> : null}
      </div>
      {primaryVern ? <div className="vern">{primaryVern.n}</div> : null}
      <div className="meta">
        {rank ? <span className={`pill rank-${rank}`}>{rank}</span> : null}
        {taxon.x ? <span className="pill extinct">extinct ✝</span> : null}
        {taxon.s && taxon.s !== 'accepted'
          ? <span className={`pill status-${taxon.s}`}>{taxon.s}</span>
          : null}
        {taxon.c?.length
          ? <span className="pill">{taxon.c.length.toLocaleString()} {taxon.c.length === 1 ? 'child' : 'children'}</span>
          : null}
      </div>
    </Link>
  )
}
