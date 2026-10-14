import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getTaxon, getLineage, getChildren, getChildrenPage, getDetail } from '../data/api.js'
import { useMeta } from '../components/MetaContext.jsx'
import Breadcrumbs from '../components/Breadcrumbs.jsx'
import TaxonCard from '../components/TaxonCard.jsx'
import Skeleton from '../components/Skeleton.jsx'
import Pager from '../components/Pager.jsx'
import useTitle from '../components/useTitle.js'
import { RankPill, StatusPill, ExtinctPill, XrPill, BinPill } from '../components/Pills.jsx'
import { STATUS_HELP, isItalicRank, languageName, rankLabel, formatCount } from '../data/labels.js'

export default function Taxon() {
  const { id } = useParams()
  const meta = useMeta()
  const [taxon, setTaxon] = useState(null)
  const [lineage, setLineage] = useState(null)
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    setTaxon(null); setLineage(null); setDetail(null); setError(null); setNotFound(false)
    window.scrollTo({ top: 0 })
    ;(async () => {
      try {
        const t = await getTaxon(id)
        if (cancelled) return
        if (!t) { setNotFound(true); return }
        setTaxon(t)
        const [lin, det] = await Promise.all([
          getLineage(t),
          (t.counts.vernaculars || t.counts.distributions) ? getDetail(t.i) : Promise.resolve({ vernaculars: [], distribution: [] }),
        ])
        if (cancelled) return
        setLineage(lin)
        setDetail(det)
      } catch (e) {
        if (!cancelled) setError(e.message || String(e))
      }
    })()
    return () => { cancelled = true }
  }, [id])

  const english = detail?.vernaculars.find(v => v.l === 'eng') || null
  useTitle(taxon ? taxon.n : 'Taxon', taxon ? `${taxon.n}${english ? ` (${english.n})` : ''}: ${rankLabel(taxon.rank)} in the Catalogue of Life.` : undefined)

  if (notFound) {
    return (
      <div className="page narrow">
        <Breadcrumbs chain={[]} complete={false} />
        <div className="empty"><strong>No record with ID “{id}”</strong> in this copy of the dataset.<br /><Link to="/explore">Explore from the top</Link></div>
      </div>
    )
  }
  if (error) return <div className="page narrow"><div className="notice error" role="alert">Could not load this record: {error}</div></div>
  if (!taxon) return <div className="page"><Skeleton lines={8} label="Loading taxon" /></div>

  const italic = isItalicRank(taxon.rank, meta.ranks) && !taxon.isBin
  const acceptedParent = !taxon.accepted && lineage?.chain?.length ? lineage.chain[lineage.chain.length - 1] : null
  const colUrl = `https://www.catalogueoflife.org/data/taxon/${encodeURIComponent(taxon.i)}`

  return (
    <div className="page">
      {lineage ? <Breadcrumbs chain={lineage.chain} current={taxon} complete={lineage.complete} /> : <div className="crumbs muted small">Loading classification…</div>}

      <header className="card taxon-hero">
        <h1 className={italic ? 'sci' : ''}>
          {taxon.n}
          {taxon.a ? <span className="authorship">{taxon.a}</span> : null}
        </h1>
        {english ? <div className="common-name">{english.n}</div> : null}
        <div className="pills">
          <RankPill rank={taxon.rank} />
          <StatusPill status={taxon.status} />
          <ExtinctPill extinct={taxon.extinct} />
          <XrPill show={taxon.xrAdded} />
          <BinPill show={taxon.isBin} />
          {taxon.e ? <span className="pill" title="Environment recorded in the source">{taxon.e}</span> : null}
        </div>
        {!taxon.accepted ? (
          <div className="notice info" style={{ marginTop: '1rem', marginBottom: 0 }}>
            <strong>{STATUS_HELP[taxon.status]}</strong>
            {acceptedParent ? <> Accepted name: <Link to={`/taxon/${encodeURIComponent(acceptedParent.i)}`} className={isItalicRank(acceptedParent.rank, meta.ranks) ? 'sci' : ''}>{acceptedParent.n}</Link>.</> : null}
          </div>
        ) : null}
        {taxon.isBin ? (
          <div className="notice info" style={{ marginTop: '1rem', marginBottom: 0 }}>
            A BOLD Barcode Index Number groups DNA sequences that cluster together. It is not a formally described species; the record sits under the lowest taxon its sequences were identified to.
          </div>
        ) : null}
        <div className="btn-row" style={{ marginTop: '1rem' }}>
          <Link className="btn sm" to={`/compare?a=${encodeURIComponent(taxon.i)}`}>Compare with another species</Link>
          <a className="btn sm" href={colUrl} target="_blank" rel="noreferrer">Official record at catalogueoflife.org ↗</a>
        </div>
      </header>

      <div className="grid-2">
        <section className="panel">
          <h2>Classification</h2>
          {lineage ? (
            lineage.chain.length ? (
              <div className="kv">
                {!lineage.complete ? <><div className="k">…</div><div className="v muted">Some ancestors are missing from the dataset</div></> : null}
                {lineage.chain.map(a => (
                  <RowK key={a.i} k={rankLabel(a.rank)}>
                    <Link to={`/taxon/${encodeURIComponent(a.i)}`} className={isItalicRank(a.rank, meta.ranks) ? 'sci' : ''}>{a.n}</Link>
                    {a.status && a.status !== 'accepted' ? <span className="muted small"> ({a.status})</span> : null}
                  </RowK>
                ))}
                <RowK k={rankLabel(taxon.rank)}><strong className={italic ? 'sci' : ''}>{taxon.n}</strong></RowK>
              </div>
            ) : <div className="muted small">{lineage.complete ? 'A top-level group with nothing above it.' : 'This record has no resolvable parent in the dataset.'}</div>
          ) : <Skeleton lines={4} />}
        </section>

        <section className="panel">
          <h2>Identifiers</h2>
          <div className="kv">
            <RowK k="COL ID"><code>{taxon.i}</code></RowK>
            {taxon.p ? <RowK k="Parent ID"><Link to={`/taxon/${encodeURIComponent(taxon.p)}`}><code>{taxon.p}</code></Link></RowK> : null}
            <RowK k="Catalogue of Life"><a href={colUrl} target="_blank" rel="noreferrer">{colUrl.replace('https://', '')}</a></RowK>
            {taxon.link ? <RowK k="Source record"><a href={taxon.link} target="_blank" rel="noreferrer">{shorten(taxon.link, 64)}</a></RowK> : null}
          </div>
        </section>
      </div>

      {detail && detail.vernaculars.length ? <Vernaculars list={detail.vernaculars} total={taxon.counts.vernaculars} /> : null}
      {detail && detail.distribution.length ? <Distribution list={detail.distribution} total={taxon.counts.distributions} /> : null}

      <Children taxon={taxon} />
    </div>
  )
}

function RowK({ k, children }) {
  return <><div className="k">{k}</div><div className="v">{children}</div></>
}

function shorten(s, n) { return s.length <= n ? s : s.slice(0, n - 1) + '…' }

function Vernaculars({ list, total }) {
  const [showAll, setShowAll] = useState(false)
  const groups = new Map()
  for (const v of list) {
    const key = v.l || ''
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(v)
  }
  const ordered = [...groups.entries()].sort((a, b) => (a[0] === 'eng' ? -1 : b[0] === 'eng' ? 1 : b[1].length - a[1].length))
  const shown = showAll ? ordered : ordered.slice(0, 6)
  return (
    <section className="panel">
      <h2>Common names <span className="count">{formatCount(total)}</span></h2>
      <div className="vern-groups">
        {shown.map(([lang, names]) => (
          <div className="vern-group" key={lang || '_'}>
            <div className="lang">{languageName(lang)}</div>
            <div className="names">
              {names.map((v, i) => <span key={i} className={v.p ? 'preferred' : ''} title={v.p ? 'Preferred name in this language' : undefined}>{v.n}</span>)}
            </div>
          </div>
        ))}
      </div>
      {ordered.length > 6 ? <button type="button" className="btn sm ghost" style={{ marginTop: '.6rem' }} onClick={() => setShowAll(s => !s)}>{showAll ? 'Show fewer languages' : `Show all ${ordered.length} languages`}</button> : null}
      {total > list.length ? <p className="small muted" style={{ marginTop: '.5rem' }}>Showing {list.length} of {formatCount(total)}; see the official record for the full list.</p> : null}
    </section>
  )
}

const GAZETTEER = { iso: 'Countries (ISO)', tdwg: 'Botanical regions (TDWG)', mrgid: 'Marine regions', text: 'Free text', fao: 'FAO fishing areas', eez: 'Exclusive economic zones', iho: 'IHO sea areas', longhurst: 'Longhurst provinces', teow: 'Terrestrial ecoregions', realm: 'Biogeographic realms' }

function Distribution({ list, total }) {
  const groups = new Map()
  for (const d of list) {
    const key = (d.gazetteer || 'text').toLowerCase()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(d)
  }
  return (
    <section className="panel">
      <h2>Distribution <span className="count">{formatCount(total)} records</span></h2>
      <div className="dist-groups">
        {[...groups.entries()].map(([gaz, rows]) => (
          <div className="dist-group" key={gaz}>
            <h3>{GAZETTEER[gaz] || gaz}</h3>
            <ul className="dist-list">
              {rows.map((d, i) => (
                <li key={i}>
                  {d.area || d.areaId}
                  {d.area && d.areaId && d.areaId !== d.area ? <span className="note">{d.areaId}</span> : null}
                  {d.establishment ? <span className="note">{d.establishment}</span> : null}
                  {d.threat ? <span className="note">{d.threat}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {total > list.length ? <p className="small muted" style={{ marginTop: '.5rem' }}>Showing {list.length} of {formatCount(total)} records.</p> : null}
    </section>
  )
}

function Children({ taxon }) {
  const meta = useMeta()
  const nChildren = taxon.counts.children
  const nSyn = taxon.counts.synonyms
  const [tab, setTab] = useState(nChildren ? 'c' : 's')
  const [showBins, setShowBins] = useState(false)
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const pageSize = meta.shards.kidsPage
  const total = tab === 'c' ? nChildren : nSyn
  const pages = Math.max(1, Math.ceil(total / pageSize))

  useEffect(() => { setPage(1); setTab(nChildren ? 'c' : 's') }, [taxon.i, nChildren])

  useEffect(() => {
    if (!total) { setRows([]); return }
    let cancelled = false
    setRows(null); setError(null)
    getChildrenPage(taxon.i, tab, page)
      .then(r => { if (!cancelled) setRows(r) })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [taxon.i, tab, page, total])

  if (!nChildren && !nSyn) {
    return <section className="panel"><h2>Children</h2><div className="empty">No descendants or synonyms in the dataset.</div></section>
  }
  const visible = (rows || []).filter(r => showBins || !r.isBin)
  const hiddenBins = (rows || []).length - visible.length
  return (
    <section className="panel">
      <h2 id="children-heading">Contents</h2>
      <div className="tabs" role="tablist" aria-labelledby="children-heading">
        <button role="tab" type="button" className="tab" aria-selected={tab === 'c'} onClick={() => { setTab('c'); setPage(1) }} disabled={!nChildren}>Accepted children <span className="muted">({formatCount(nChildren)})</span></button>
        <button role="tab" type="button" className="tab" aria-selected={tab === 's'} onClick={() => { setTab('s'); setPage(1) }} disabled={!nSyn}>Synonyms <span className="muted">({formatCount(nSyn)})</span></button>
      </div>
      {tab === 'c' ? (
        <div className="toolbar">
          <label><input type="checkbox" checked={showBins} onChange={e => setShowBins(e.target.checked)} /> Show DNA barcode clusters</label>
          {hiddenBins ? <span className="muted">{formatCount(hiddenBins)} hidden on this page</span> : null}
        </div>
      ) : null}
      {error ? <div className="notice error">{error}</div> : null}
      {rows === null && !error ? <Skeleton lines={3} /> : null}
      {rows && visible.length === 0 && !hiddenBins ? <div className="empty">Nothing on this page.</div> : null}
      {rows && visible.length ? (
        <div className="cards" role="tabpanel">
          {visible.map(c => <TaxonCard key={c.i} taxon={c} />)}
        </div>
      ) : null}
      <Pager page={page} pages={pages} onPage={setPage} />
    </section>
  )
}
