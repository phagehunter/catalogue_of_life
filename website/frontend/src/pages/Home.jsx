import { Link } from 'react-router-dom'
import SearchBox from '../components/SearchBox.jsx'
import BarChart from '../components/BarChart.jsx'
import Citation from '../components/Citation.jsx'
import useTitle from '../components/useTitle.js'
import { useMeta } from '../components/MetaContext.jsx'
import { TreeIcon, CompareIcon, BookIcon } from '../components/Icons.jsx'
import { formatCount, rankLabel } from '../data/labels.js'

export default function Home() {
  const meta = useMeta()
  const c = meta.counts
  useTitle('', `Browse, search and compare ${formatCount(c.acceptedSpecies)} accepted species from the Catalogue of Life.`)

  const kingdoms = Object.entries(c.byKingdom || {})
    .map(([name, ranks]) => ({ label: name, value: ranks.species || 0, sub: `${formatCount(ranks.species || 0)} accepted species · ${formatCount(ranks.genus || 0)} genera · ${formatCount(ranks.family || 0)} families` }))
    .filter(k => k.value > 0)
    .sort((a, b) => b.value - a.value)
  const topKingdoms = kingdoms.slice(0, 8)
  const rest = kingdoms.slice(8).reduce((n, k) => n + k.value, 0)
  if (rest) topKingdoms.push({ label: `${kingdoms.length - 8} other kingdoms`, value: rest })

  return (
    <div className="page">
      <section className="hero">
        <h1>Every named species, one search away</h1>
        <p className="lede">
          An independent explorer for the Catalogue of Life: {formatCount(c.acceptedSpecies)} accepted
          species, {formatCount(c.nameUsages)} scientific names including synonyms,
          and {formatCount(c.vernaculars)} common names in {c.vernacularLanguages?.length || 'many'}+ languages.
        </p>
        <SearchBox size="lg" autoFocus placeholder="Try “Panthera tigris”, “oak”, or “tigris”…" />
        <p className="examples">
          Examples: <Link to="/search?q=Panthera%20tigris">Panthera tigris</Link> · <Link to="/search?q=tiger">tiger</Link> · <Link to="/search?q=Quercus">Quercus</Link> · <Link to="/search?q=sapiens">sapiens</Link>
        </p>
      </section>

      <section className="feature-grid" aria-label="What you can do here">
        <Link className="card feature" to="/explore">
          <TreeIcon className="icon" />
          <h2>Explore the tree</h2>
          <p>Start at the domains of life and open any branch down to species, subspecies and DNA barcode clusters.</p>
          <span className="go">Open the tree →</span>
        </Link>
        <Link className="card feature" to="/compare">
          <CompareIcon className="icon" />
          <h2>Compare species</h2>
          <p>Pick two to six organisms and see where their classifications meet: same genus, same family, or barely the same kingdom.</p>
          <span className="go">Compare →</span>
        </Link>
        <Link className="card feature" to="/about">
          <BookIcon className="icon" />
          <h2>About the data</h2>
          <p>Where the data comes from, what the eXtended Release adds, and what this site does and does not claim.</p>
          <span className="go">Read more →</span>
        </Link>
      </section>

      <section aria-label="Dataset at a glance">
        <h2 className="visually-hidden">Dataset at a glance</h2>
        <div className="stats">
          <Stat label="Accepted species" value={c.acceptedSpecies} />
          <Stat label="All names" value={c.nameUsages} sub={`${formatCount(c.synonyms)} synonyms`} />
          <Stat label="Common names" value={c.vernaculars} sub={`for ${formatCount(c.taxaWithVernaculars)} taxa`} />
          <Stat label="Distribution records" value={c.distributions} />
          <Stat label="Marked extinct" value={c.extinct} sub="accepted names" />
          <Stat label="DNA barcode clusters" value={c.bins} sub="BOLD BINs from the XR" />
        </div>
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2>Top-level groups</h2>
          <ul className="inline-list">
            {meta.roots.map(r => (
              <li key={r.i}>
                <Link to={`/taxon/${encodeURIComponent(r.i)}`}>{r.n}</Link>
                <span className="muted small"> {rankLabel(meta.ranks[r.r]).toLowerCase()}{r.nc ? ` · ${formatCount(r.nc)} children` : ''}</span>
              </li>
            ))}
          </ul>
          <p className="small muted" style={{ marginTop: '.75rem' }}>
            The Catalogue of Life groups life into three domains plus viruses. “Incertae sedis” holds names whose placement is still uncertain.
          </p>
        </section>
        <section className="panel">
          <h2>Accepted species by kingdom</h2>
          <BarChart rows={topKingdoms} valueLabel="Accepted species by kingdom" />
          <p className="small muted" style={{ marginTop: '.75rem' }}>Counts come from the kingdom recorded on each accepted species; DNA barcode clusters and synonyms are excluded.</p>
        </section>
      </div>

      <p><Citation /></p>
    </div>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{formatCount(value)}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  )
}
