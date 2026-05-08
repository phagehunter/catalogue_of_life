import { Link } from 'react-router-dom'

export default function About() {
  return (
    <div className="page narrow">
      <h1>About this site</h1>
      <p>
        This site is a fast, static explorer for the
        {' '}<a href="https://www.catalogueoflife.org/" target="_blank" rel="noreferrer">Catalogue&nbsp;of&nbsp;Life</a>
        {' '}— a global, open consensus list of every named species, animal, plant,
        fungus, and microbe known to science.
      </p>

      <section className="section">
        <h2>How it works</h2>
        <p>
          The raw Catalogue of Life dump weighs in at several gigabytes
          spread across <code>NameUsage.tsv</code>, <code>VernacularName.tsv</code>,
          and <code>Distribution.tsv</code>. A GitHub Action processes those
          files into thousands of tiny sharded JSON files (1024 buckets), so
          the browser only ever loads a small slice when you click around.
        </p>
        <ul>
          <li><strong>Sharding</strong>: each taxon's bucket is decided by a
            stable <code>djb2</code> hash of its CoL ID, computed identically
            in the Python builder and the JS client.</li>
          <li><strong>Search</strong>: a separate index, sharded by the first
            two characters of the lowercased name, so even a "browse alphabetically"
            interaction stays under 1 MB per fetch.</li>
          <li><strong>Caching</strong>: every shard is fetched at most once
            per visit and held in memory.</li>
        </ul>
      </section>

      <section className="section">
        <h2>Coverage caveats</h2>
        <ul>
          <li>The catalogue includes both <em>accepted</em> names and
            <em> synonyms</em>. Synonym records are kept but flagged with a pill.</li>
          <li>Some records have missing parent IDs — the breadcrumb falls back
            to the denormalised lineage when this happens.</li>
          <li>"Marked extinct" is shown when the source dataset records the
            <code>extinct</code> flag; coverage of this flag is uneven.</li>
        </ul>
      </section>

      <section className="section">
        <h2>Source &amp; licence</h2>
        <p>
          Data is provided by the Catalogue of Life consortium under a
          {' '}<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC&nbsp;BY&nbsp;4.0</a>
          {' '}licence. The source code for this explorer lives on GitHub —
          fork freely and rebuild with your own snapshot.
        </p>
        <p>
          <Link to="/explore" className="cta primary">Start exploring →</Link>
        </p>
      </section>
    </div>
  )
}
