import { Link } from 'react-router-dom'

// Renders the lineage above a taxon detail page.
// `chain` is an array of taxon records from root → current.
export default function Breadcrumbs({ chain }) {
  if (!chain || chain.length === 0) {
    return (
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/explore">Explore</Link>
      </nav>
    )
  }
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <Link to="/explore">Explore</Link>
      <span className="sep">›</span>
      {chain.map((t, i) => {
        const last = i === chain.length - 1
        return (
          <span key={t.i}>
            <Link
              to={`/taxon/${encodeURIComponent(t.i)}`}
              className={last ? 'current' : ''}
              aria-current={last ? 'page' : undefined}
            >
              {t.n}
            </Link>
            {!last ? <span className="sep">›</span> : null}
          </span>
        )
      })}
    </nav>
  )
}
