import { useMeta } from './MetaContext.jsx'

export default function Citation({ long = false }) {
  const meta = useMeta()
  const d = meta.dataset || {}
  const version = d.version || d.issued || 'unknown version'
  const doi = d.doi ? `https://doi.org/${d.doi}` : null
  return (
    <div className="citation">
      Data: <a href="https://www.catalogueoflife.org/" target="_blank" rel="noreferrer">Catalogue of Life</a>
      {d.alias ? <> {d.alias}</> : null}, version {version}
      {doi ? <>, <a className="doi" href={doi} target="_blank" rel="noreferrer">doi:{d.doi}</a></> : null}
      , licensed <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.
      {long ? <> Site data generated {meta.generatedAt?.slice(0, 10)}. This explorer is an independent project and is not affiliated with or endorsed by the Catalogue of Life.</> : null}
    </div>
  )
}
