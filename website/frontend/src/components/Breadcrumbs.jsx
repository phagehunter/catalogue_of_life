import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMeta } from './MetaContext.jsx'
import { isItalicRank, rankLabel } from '../data/labels.js'

const HEAD = 2, TAIL = 3

// chain: ancestors root → parent; current: the taxon shown. Long chains are
// collapsed to the first two and last three ranks until expanded.
export default function Breadcrumbs({ chain, current, complete }) {
  const meta = useMeta()
  const [expanded, setExpanded] = useState(false)
  const items = chain || []
  const collapse = !expanded && items.length > HEAD + TAIL + 1
  const shown = collapse ? [...items.slice(0, HEAD), null, ...items.slice(-TAIL)] : items
  return (
    <nav aria-label="Classification path">
      <ol className="crumbs">
        <li><Link to="/explore">All life</Link><span className="sep" aria-hidden="true">›</span></li>
        {!complete ? <li><span className="muted" title="Some ancestors are missing from the dataset">…</span><span className="sep" aria-hidden="true">›</span></li> : null}
        {shown.map((t, idx) => t === null ? (
          <li key="gap">
            <button type="button" className="ellipsis" onClick={() => setExpanded(true)} aria-label={`Show ${items.length - HEAD - TAIL} more ranks`}>{items.length - HEAD - TAIL} more…</button>
            <span className="sep" aria-hidden="true">›</span>
          </li>
        ) : (
          <li key={t.i}>
            {t.rank && t.rank !== 'unranked' ? <span className="rank">{rankLabel(t.rank)}</span> : null}
            <Link to={`/taxon/${encodeURIComponent(t.i)}`} className={isItalicRank(t.rank, meta.ranks) ? 'sci' : ''}>{t.n}</Link>
            <span className="sep" aria-hidden="true">›</span>
          </li>
        ))}
        {current ? (
          <li aria-current="page">
            <span className={'current' + (isItalicRank(current.rank, meta.ranks) && !current.isBin ? ' sci' : '')}>{current.n}</span>
          </li>
        ) : null}
      </ol>
    </nav>
  )
}
