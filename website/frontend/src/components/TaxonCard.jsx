import { Link } from 'react-router-dom'
import { RankPill, StatusPill, ExtinctPill, BinPill } from './Pills.jsx'
import { useMeta } from './MetaContext.jsx'
import { isItalicRank, formatCount } from '../data/labels.js'

// Works with child summaries, core records, and search results.
export default function TaxonCard({ taxon, commonName }) {
  const meta = useMeta()
  if (!taxon) return null
  const italic = isItalicRank(taxon.rank, meta.ranks) && !taxon.isBin
  const kids = taxon.counts?.children || 0
  return (
    <Link className="card taxon-card" to={`/taxon/${encodeURIComponent(taxon.i)}`}>
      <span className={'name' + (italic ? ' sci' : '')}>{taxon.n}</span>
      {commonName ? <span className="common">{commonName}</span> : null}
      <span className="meta">
        <RankPill rank={taxon.rank} />
        <StatusPill status={taxon.status} />
        <ExtinctPill extinct={taxon.extinct} />
        <BinPill show={taxon.isBin} />
        {kids ? <span className="pill">{formatCount(kids)} {kids === 1 ? 'child' : 'children'}</span> : null}
      </span>
    </Link>
  )
}
