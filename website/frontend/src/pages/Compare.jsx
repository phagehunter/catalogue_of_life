import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getTaxon, getLineage, getDetail, search } from '../data/api.js'
import { useMeta } from '../components/MetaContext.jsx'
import SearchBox from '../components/SearchBox.jsx'
import useTitle from '../components/useTitle.js'
import { normalise } from '../data/hash.js'
import { isItalicRank, rankLabel } from '../data/labels.js'

const MAX = 6
const KEYS = ['a', 'b', 'c', 'd', 'e', 'f']
const COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)']

// Plain-language verdict by the rank of the deepest shared taxon.
const VERDICT = {
  species: ['the same species', 'Both names resolve to one species'],
  subspecies: ['the same species', 'Different subspecies of one species'],
  variety: ['the same species', 'Varieties of one species'], form: ['the same species', 'Forms of one species'],
  subgenus: ['siblings', 'Same subgenus'], genus: ['siblings', 'Same genus'],
  subtribe: ['close cousins', 'Same subtribe'], tribe: ['close cousins', 'Same tribe'], subfamily: ['close cousins', 'Same subfamily'],
  family: ['cousins', 'Same family'], superfamily: ['cousins', 'Same superfamily'],
  infraorder: ['relatives', 'Same infraorder'], suborder: ['relatives', 'Same suborder'], order: ['relatives', 'Same order'],
  superorder: ['distant relatives', 'Same superorder'], infraclass: ['distant relatives', 'Same infraclass'], subclass: ['distant relatives', 'Same subclass'], class: ['distant relatives', 'Same class'],
  superclass: ['distant kin', 'Same superclass'], subphylum: ['distant kin', 'Same subphylum'], phylum: ['distant kin', 'Same phylum, a shared body plan'],
  subkingdom: ['ancient kin', 'Same subkingdom'], kingdom: ['kingdom-mates', 'Same kingdom'],
  domain: ['domain-mates', 'Same domain: shared cell biology, little else'],
}
const DEFAULT_VERDICT = ['barely related', 'They share only a top-level group']

const PRESETS = [
  { label: 'Vertebrate body plans', note: 'Human, frog, shark: same phylum, very different lineages', queries: ['Homo sapiens', 'Rana temporaria', 'Carcharhinus leucas'] },
  { label: 'Three ways to fly', note: 'Sparrow, fruit bat, bumblebee: flight evolved separately', queries: ['Passer domesticus', 'Pteropus vampyrus', 'Bombus terrestris'] },
  { label: 'Plants across deep time', note: 'Oak, bracken, peat moss', queries: ['Quercus robur', 'Pteridium aquilinum', 'Sphagnum palustre'] },
  { label: 'Cats, big and small', note: 'Tiger, house cat, cheetah: one family', queries: ['Panthera tigris', 'Felis catus', 'Acinonyx jubatus'] },
  { label: 'Dog, cat, horse', note: 'Three domesticated mammals', queries: ['Canis lupus', 'Felis catus', 'Equus caballus'] },
  { label: 'Fish and starfish', note: 'Same kingdom, different phyla', queries: ['Salmo salar', 'Asterias rubens'] },
]

export default function Compare() {
  useTitle('Compare species', 'See where the classifications of two to six organisms meet.')
  const meta = useMeta()
  const [params, setParams] = useSearchParams()
  const [species, setSpecies] = useState([])
  const [chains, setChains] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const initialised = useRef(false)

  useEffect(() => {
    if (initialised.current) return
    initialised.current = true
    const ids = KEYS.map(k => params.get(k)).filter(Boolean)
    if (!ids.length) return
    setBusy(true)
    Promise.all(ids.map(id => getTaxon(id).catch(() => null)))
      .then(rs => setSpecies(rs.filter(Boolean)))
      .finally(() => setBusy(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const idKey = species.map(s => s.i).join('|')
  useEffect(() => {
    if (!species.length) { setChains([]); setParams({}, { replace: true }); return }
    let cancelled = false
    setBusy(true); setError(null)
    Promise.all(species.map(async s => {
      const [lin, det] = await Promise.all([getLineage(s), s.counts.vernaculars ? getDetail(s.i) : { vernaculars: [] }])
      const eng = det.vernaculars.find(v => v.l === 'eng' && v.p) || det.vernaculars.find(v => v.l === 'eng')
      return { chain: [...lin.chain, { i: s.i, n: s.n, rank: s.rank }], common: eng?.n || null }
    })).then(rs => {
      if (cancelled) return
      setChains(rs)
      const next = {}
      species.forEach((s, i) => { next[KEYS[i]] = s.i })
      setParams(next, { replace: true })
    }).catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey])

  const analysis = useMemo(() => analyse(species, chains.map(c => c.chain)), [species, chains])

  async function add(item) {
    if (!item || species.length >= MAX || species.some(s => s.i === item.i)) return
    const t = await getTaxon(item.i)
    if (t) setSpecies(s => [...s, t])
  }
  function remove(i) { setSpecies(s => s.filter((_, j) => j !== i)) }

  async function loadPreset(queries) {
    setBusy(true); setError(null)
    try {
      const found = await Promise.all(queries.map(async q => {
        const r = await search(q, { limit: 10 })
        const exact = r.results.find(x => !x.isVernacular && normalise(x.name) === normalise(q) && x.kind !== 'synonym')
        const pick = exact || r.results.find(x => !x.isVernacular) || r.results[0]
        return pick ? getTaxon(pick.i) : null
      }))
      const missing = queries.filter((_, i) => !found[i])
      if (missing.length) setError(`Not in this copy of the dataset: ${missing.join(', ')}`)
      setSpecies(found.filter(Boolean))
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  function share() {
    navigator.clipboard?.writeText(window.location.href)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600) }).catch(() => {})
  }

  return (
    <div className="page">
      <header className="compare-head">
        <h1>How related are these species?</h1>
        <p className="lede">
          Pick two to six organisms by scientific or common name. The tool follows each one up the
          Catalogue of Life classification and reports the deepest group they share.
        </p>
      </header>

      <div className="species-row">
        {species.map((s, i) => <Chip key={s.i} s={s} common={chains[i]?.common} color={COLORS[i]} onRemove={() => remove(i)} ranks={meta.ranks} />)}
        {species.length < MAX ? (
          <div className="card picker">
            <label htmlFor="compare-picker">{species.length === 0 ? 'Add the first organism' : species.length === 1 ? 'Add one more to compare' : `Add another (${species.length} of ${MAX})`}</label>
            <SearchBox onPick={add} placeholder="Scientific or common name…" label="Add an organism to compare" />
          </div>
        ) : null}
        {species.length ? <button type="button" className="btn sm ghost" onClick={() => setSpecies([])}>Clear all</button> : null}
      </div>

      {error ? <div className="notice warn" role="alert">{error}</div> : null}
      {busy ? <p className="muted small" aria-live="polite">Loading classifications…</p> : null}

      {analysis && species.length >= 2 && chains.length === species.length ? (
        <>
          <Verdicts analysis={analysis} species={species} chains={chains} ranks={meta.ranks} />
          <ClassificationGrid analysis={analysis} species={species} chains={chains} ranks={meta.ranks} />
          <p style={{ textAlign: 'center' }}><button type="button" className="btn" onClick={share}>{copied ? '✓ Link copied' : 'Copy a link to this comparison'}</button></p>
        </>
      ) : null}

      {species.length < 2 ? (
        <section>
          <h2>Try a curated comparison</h2>
          <div className="preset-grid">
            {PRESETS.map(p => (
              <button key={p.label} type="button" className="card preset" onClick={() => loadPreset(p.queries)}>
                <div className="title">{p.label}</div>
                <div className="note">{p.note}</div>
                <div className="q">{p.queries.map((q, i) => <span key={q}><span className="sci">{q}</span>{i < p.queries.length - 1 ? ' · ' : ''}</span>)}</div>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function Chip({ s, common, color, onRemove, ranks }) {
  return (
    <div className="card chip" style={{ borderLeftColor: color }}>
      <span className="dot" style={{ background: color }} aria-hidden="true" />
      <div className="chip-body">
        <div className="rank">{rankLabel(s.rank)}</div>
        <Link to={`/taxon/${encodeURIComponent(s.i)}`} className={'name' + (isItalicRank(s.rank, ranks) ? ' sci' : '')}>{s.n}</Link>
        {common ? <div className="common">{common}</div> : null}
      </div>
      <button type="button" className="chip-remove" onClick={onRemove} aria-label={`Remove ${s.n}`}>×</button>
    </div>
  )
}

// ---- analysis -------------------------------------------------------------

function analyse(species, chains) {
  if (chains.length < 2 || chains.length !== species.length || chains.some(c => !c?.length)) return null
  const root = { id: '__root__', name: 'root', rank: null, children: [], leaves: [], depth: 0 }
  chains.forEach((chain, idx) => {
    let cur = root
    for (let i = 0; i < chain.length; i++) {
      const node = chain[i]
      let child = cur.children.find(c => c.id === node.i)
      if (!child) {
        child = { id: node.i, name: node.n, rank: node.rank, children: [], leaves: [], depth: i + 1 }
        cur.children.push(child)
      }
      cur = child
    }
    cur.leaves.push(idx)
  })
  function annotate(node) {
    const set = new Set(node.leaves)
    for (const c of node.children) for (const x of annotate(c)) set.add(x)
    node.passing = set
    return set
  }
  annotate(root)
  const pairs = []
  for (let i = 0; i < species.length; i++) for (let j = i + 1; j < species.length; j++) pairs.push({ i, j, mrca: deepestShared(root, [i, j]) })
  const overall = deepestShared(root, species.map((_, i) => i))
  return { root, pairs, overall }
}

function deepestShared(root, idx) {
  let best = null
  ;(function walk(node) {
    if (node.id !== '__root__' && idx.every(i => node.passing.has(i)) && (!best || node.depth > best.depth)) best = node
    for (const c of node.children) walk(c)
  })(root)
  return best
}

function verdictFor(rank) { return VERDICT[rank] || DEFAULT_VERDICT }

function Verdicts({ analysis, species, chains, ranks }) {
  const [word, detail] = verdictFor(analysis.overall?.rank)
  return (
    <section className="card verdict">
      <div className="label">All {species.length} are</div>
      <div className="word">{word}</div>
      <div className="detail">
        {detail}
        {analysis.overall ? <>: they share <Link to={`/taxon/${encodeURIComponent(analysis.overall.id)}`} className={isItalicRank(analysis.overall.rank, ranks) ? 'sci' : ''}>{analysis.overall.name}</Link> ({rankLabel(analysis.overall.rank).toLowerCase()})</> : null}.
      </div>
      {analysis.pairs.length > 1 ? <PairMatrix analysis={analysis} species={species} ranks={ranks} /> : null}
    </section>
  )
}

// ---- classification grid ----------------------------------------------------
//
// Rows are ranks, columns are the chosen organisms, ordered so organisms that
// share a taxon sit next to each other. Adjacent cells holding the same taxon
// merge into one wide cell, so the shared trunk and every split are visible at
// a glance. Aligning by rank (not chain depth) avoids the false precision of a
// depth-scaled tree: chains carry different numbers of intermediate ranks.

const MAIN_RANKS = ['domain', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species']

function leafOrder(root) {
  const order = []
  ;(function visit(node) {
    for (const idx of node.leaves) order.push(idx)
    for (const c of node.children) visit(c)
  })(root)
  return order
}

function ClassificationGrid({ analysis, species, chains, ranks }) {
  const [allRanks, setAllRanks] = useState(false)
  const order = useMemo(() => leafOrder(analysis.root), [analysis])
  const rankIndex = r => { const i = ranks.indexOf(r); return i < 0 ? ranks.length : i }

  const rows = useMemo(() => {
    const present = new Set()
    for (const ch of chains) for (const n of ch.chain) if (n.rank && n.rank !== 'unranked') present.add(n.rank)
    let list
    if (allRanks) list = [...present]
    else {
      list = MAIN_RANKS.filter(r => present.has(r))
      for (const sp of species) {
        if (sp.rank && present.has(sp.rank) && !list.includes(sp.rank) && rankIndex(sp.rank) > rankIndex('species')) list.push(sp.rank)
      }
    }
    return list.sort((a, b) => rankIndex(a) - rankIndex(b))
  }, [chains, species, allRanks, ranks])

  const grid = useMemo(() => {
    const byRank = {}
    for (const r of rows) {
      const cells = []
      for (let c = 0; c < order.length; c++) {
        const idx = order[c]
        const node = chains[idx].chain.find(n => n.rank === r) || null
        const prev = cells[cells.length - 1]
        if (node && prev && prev.taxon && prev.taxon.i === node.i) { prev.span++; prev.columns.push(idx); continue }
        cells.push({ taxon: node, start: c, span: 1, columns: [idx], isLeaf: !!node && node.i === species[idx].i })
      }
      byRank[r] = cells
    }
    return byRank
  }, [rows, order, chains, species])

  // Intermediate ranks hidden between displayed rows, per organism.
  const hidden = useMemo(() => {
    if (allRanks) return {}
    const out = {}
    rows.forEach((r, i) => {
      const lo = i === 0 ? -1 : rankIndex(rows[i - 1])
      const hi = rankIndex(r)
      out[r] = {}
      for (const idx of order) out[r][idx] = chains[idx].chain.filter(n => n.rank && n.rank !== 'unranked' && rankIndex(n.rank) > lo && rankIndex(n.rank) < hi)
    })
    return out
  }, [rows, order, chains, allRanks])

  const overallId = analysis.overall?.id
  // The deepest displayed row whose single cell spans every organism. When the
  // true deepest shared group sits at a hidden intermediate rank, that row
  // carries the gold marker and names it.
  const deepestSharedRow = [...rows].reverse().find(r => grid[r].length === 1 && grid[r][0].taxon)
  const mrcaVisible = rows.some(r => grid[r].some(c => c.taxon && c.taxon.i === overallId))
  return (
    <section className="card grid-wrap">
      <div className="grid-tools">
        <h2 id="grid-heading">Where the classifications meet</h2>
        <label className="small"><input type="checkbox" checked={allRanks} onChange={e => setAllRanks(e.target.checked)} /> Show every rank</label>
      </div>
      <div className="grid-scroll">
        <table className="cgrid" aria-labelledby="grid-heading">
          <thead>
            <tr>
              <th scope="col" className="rank-head"><span className="visually-hidden">Rank</span></th>
              {order.map(idx => (
                <th scope="col" key={idx}>
                  <span className="dot" style={{ background: COLORS[idx] }} aria-hidden="true" />
                  <span className={isItalicRank(species[idx].rank, ranks) ? 'sci' : ''}>{species[idx].n}</span>
                  {chains[idx].common ? <span className="common">{chains[idx].common}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r}>
                <th scope="row" className="rank-head">{rankLabel(r)}</th>
                {grid[r].map(cell => {
                  const shared = cell.span > 1
                  const t = cell.taxon
                  const lists = cell.columns.map(idx => (hidden[r] && hidden[r][idx]) || [])
                  const same = lists.every(l => l.length === lists[0].length && l.every((x, k) => x.i === lists[0][k].i))
                  const note = same ? lists[0] : null
                  const isMrca = !!t && (t.i === overallId || (!mrcaVisible && r === deepestSharedRow))
                  const cls = ['cell', shared ? 'shared' : 'single', isMrca ? 'mrca' : '', cell.isLeaf ? 'leaf' : '', !t ? 'none' : ''].filter(Boolean).join(' ')
                  return (
                    <td key={`${r}-${cell.start}`} colSpan={cell.span} className={cls}
                        style={!shared ? { '--c': COLORS[cell.columns[0]] } : undefined}>
                      {t ? (
                        <>
                          <Link to={`/taxon/${encodeURIComponent(t.i)}`} className={isItalicRank(t.rank, ranks) ? 'sci' : ''}>{t.n}</Link>
                          {shared ? <span className="tag">shared by {cell.span}</span> : null}
                          {isMrca ? (
                            <span className="tag gold">
                              {t.i === overallId ? 'deepest shared group' : `deepest shared: ${analysis.overall.name} (${rankLabel(analysis.overall.rank).toLowerCase()}, hidden rank)`}
                            </span>
                          ) : null}
                          {note && note.length ? (
                            <span className="more" title={note.map(n => `${rankLabel(n.rank)}: ${n.n}`).join('\n')}>+{note.length} rank{note.length === 1 ? '' : 's'} above</span>
                          ) : null}
                        </>
                      ) : <span className="muted" aria-label="not ranked at this level">—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="clado-legend">
        Each row is a rank in the Catalogue of Life classification. A wide cell is a group the organisms above it share;
        the gold cell is the deepest group all of them share. “+n ranks above” counts intermediate ranks (subclass, infraorder,
        tribe…) hidden between rows; tick “Show every rank” to see them. This reflects expert classification, not a dated evolutionary tree.
      </p>
    </section>
  )
}

// ---- pairwise matrix --------------------------------------------------------

function PairMatrix({ analysis, species, ranks }) {
  const lookup = new Map(analysis.pairs.map(p => [`${p.i}-${p.j}`, p.mrca]))
  const level = m => m ? MAIN_RANKS.indexOf(nearestMain(m.rank, ranks)) : 0
  return (
    <div className="matrix-wrap">
      <table className="matrix" aria-label="Pairwise relatedness">
        <thead>
          <tr>
            <th scope="col"><span className="visually-hidden">Organism</span></th>
            {species.slice(1).map((s, jj) => (
              <th scope="col" key={s.i}><span className="dot" style={{ background: COLORS[jj + 1] }} aria-hidden="true" /><span className="sci">{shortName(s.n)}</span></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {species.slice(0, -1).map((a, i) => (
            <tr key={a.i}>
              <th scope="row"><span className="dot" style={{ background: COLORS[i] }} aria-hidden="true" /><span className="sci">{shortName(a.n)}</span></th>
              {species.slice(1).map((b, jj) => {
                const j = jj + 1
                if (j <= i) return <td key={b.i} className="blank" aria-hidden="true" />
                const m = lookup.get(`${i}-${j}`)
                const [word] = verdictFor(m?.rank)
                return (
                  <td key={b.i} className="pair-cell" style={{ '--lvl': level(m) }}>
                    <span className="word">{word}</span>
                    {m ? <span className={'grp' + (isItalicRank(m.rank, ranks) ? ' sci' : '')}>{m.name}</span> : null}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function shortName(n) {
  const parts = n.split(' ')
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : n
}

// Nearest main rank at or above the given rank, for the matrix colour steps.
function nearestMain(rank, ranks) {
  const idx = ranks.indexOf(rank)
  let best = 'domain'
  for (const m of MAIN_RANKS) if (ranks.indexOf(m) <= idx) best = m
  return best
}
