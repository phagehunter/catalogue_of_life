import { Link } from 'react-router-dom'
import Citation from '../components/Citation.jsx'
import useTitle from '../components/useTitle.js'
import { useMeta } from '../components/MetaContext.jsx'
import { REPO_URL } from '../App.jsx'
import { formatCount } from '../data/labels.js'

export default function About() {
  useTitle('About', 'How this independent Catalogue of Life explorer works and what the data means.')
  const meta = useMeta()
  const c = meta.counts
  const d = meta.dataset || {}
  return (
    <div className="page narrow">
      <h1>About this site</h1>
      <p>
        This is an independent, static explorer for the <a href="https://www.catalogueoflife.org/" target="_blank" rel="noreferrer">Catalogue of Life</a>,
        the global consensus checklist of named species. It is not affiliated with or endorsed by the
        Catalogue of Life. For the authoritative record, every taxon page links to the official entry.
      </p>

      <section className="panel">
        <h2>The data</h2>
        <p>
          The site is built from the Catalogue of Life <strong>{d.alias || 'eXtended Release'}</strong> (version {d.version || '—'},
          issued {d.issued || '—'}{d.doi ? <>, <a href={`https://doi.org/${d.doi}`} target="_blank" rel="noreferrer">doi:{d.doi}</a></> : null}).
          The eXtended Release (XR) starts from the expert-curated base release and programmatically adds names from
          additional sources, including DNA barcode clusters from BOLD. Names added this way are marked <span className="pill xr">XR</span>.
        </p>
        <div className="kv">
          <div className="k">Name usages</div><div className="v">{formatCount(c.nameUsages)} (accepted names, provisional names and synonyms)</div>
          <div className="k">Accepted species</div><div className="v">{formatCount(c.acceptedSpecies)}</div>
          <div className="k">Synonyms</div><div className="v">{formatCount(c.synonyms)}</div>
          <div className="k">DNA barcode clusters</div><div className="v">{formatCount(c.bins)} (hidden from search by default)</div>
          <div className="k">Common names</div><div className="v">{formatCount(c.vernaculars)} for {formatCount(c.taxaWithVernaculars)} taxa</div>
          <div className="k">Distribution records</div><div className="v">{formatCount(c.distributions)} for {formatCount(c.taxaWithDistributions)} taxa</div>
          <div className="k">Site data generated</div><div className="v">{meta.generatedAt}</div>
        </div>
      </section>

      <section className="panel">
        <h2>What the words mean</h2>
        <ul>
          <li><strong>Accepted name</strong>: the name currently used for a taxon. <strong>Provisionally accepted</strong> names are treated as accepted but not fully verified by the source.</li>
          <li><strong>Synonym</strong>: another name for a taxon that has an accepted name. Synonyms are listed on the accepted taxon's page, never as its children.</li>
          <li><strong>Extinct</strong> follows the source flag, which is unevenly recorded across groups.</li>
          <li><strong>DNA barcode cluster</strong> (BOLD BIN): a group of DNA sequences, not a formally described species.</li>
          <li>The <Link to="/compare">Compare</Link> tool reads the shared classification, which reflects expert taxonomy, not a dated evolutionary tree. Depth in its diagram counts ranks, not time.</li>
        </ul>
      </section>

      <section className="panel">
        <h2>How it works</h2>
        <p>
          A GitHub Action turns the Catalogue of Life download (several gigabytes of TSV) into about fifty thousand small
          JSON files, hashed by identifier. The browser fetches only the few files a page needs, so there is no server,
          no database and no account. Searching uses a prefix index that is never truncated: every scientific name, species
          epithet and common name in the dataset is findable.
        </p>
        <p>
          Some records in the XR have no resolvable parent ({formatCount(c.orphanHigherTaxa)} higher taxa). They appear with
          an incomplete classification path rather than being dropped.
        </p>
        <p>Made by <a href="https://curtishoffmann.com/" target="_blank" rel="noreferrer">Curtis Hoffmann</a>. The code is MIT licensed: <a href={REPO_URL} target="_blank" rel="noreferrer">source on GitHub</a>. Fork it and rebuild with a newer release.</p>
      </section>

      <section className="panel">
        <h2>Citation</h2>
        <Citation long />
      </section>
    </div>
  )
}
