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
const MAJOR = new Set(['domain', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species', 'subspecies'])

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
          <Cladogram analysis={analysis} species={species} chains={chains} ranks={meta.ranks} />
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
      {analysis.pairs.length > 1 ? (
        <div className="pair-grid">
          {analysis.pairs.map(({ i, j, mrca }) => {
            const [w, d] = verdictFor(mrca?.rank)
            return (
              <div className="card pair" key={`${i}-${j}`}>
                <div className="names">
                  <span className="dot" style={{ background: COLORS[i] }} aria-hidden="true" /><span className="sci">{species[i].n}</span>
                  <span className="vs">↔</span>
                  <span className="dot" style={{ background: COLORS[j] }} aria-hidden="true" /><span className="sci">{species[j].n}</span>
                </div>
                <div><span className="word">{w}</span> <span className="detail">· {d}{mrca ? <>: <span className={isItalicRank(mrca.rank, ranks) ? 'sci' : ''}>{mrca.name}</span></> : null}</span></div>
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}

// ---- cladogram ------------------------------------------------------------

const ROW = 72, LEFT = 30, RIGHT = 340, LEAF_GAP = 110, WIDTH = 1180

function Cladogram({ analysis, species, chains, ranks }) {
  const layout = useMemo(() => layoutTree(analysis.root, species.length), [analysis, species.length])
  if (!layout) return null
  const { leaves, edges, nodes, height } = layout
  return (
    <section className="card clado-wrap">
      <div className="clado-scroll">
        <svg className="clado" viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label={`Classification tree connecting ${species.map(s => s.n).join(', ')}`}>
          {edges.map(e => <path key={e.id} className={'edge' + (e.shared ? ' shared' : '')} d={`M${e.x1} ${e.y1} V${e.y2} H${e.x2}`} />)}
          {nodes.map(n => (
            <g key={n.id}>
              <circle className={'node' + (n.mrca ? ' mrca' : '')} cx={n.x} cy={n.y} r={n.mrca ? 5 : 2.5} />
              {n.label ? (
                <text className={'lbl' + (n.mrca ? ' mrca' : '')} x={n.x + 7} y={n.y + n.labelDy} textAnchor="start">
                  <tspan className="rk">{rankLabel(n.rank)}</tspan>
                  <tspan className="nm" dx="5">{n.name}</tspan>
                </text>
              ) : null}
            </g>
          ))}
          {leaves.map(l => {
            const sp = species[l.idx]
            const x = WIDTH - RIGHT + LEAF_GAP
            return (
              <g key={l.idx}>
                <line x1={l.x} y1={l.y} x2={x} y2={l.y} stroke={COLORS[l.idx]} strokeWidth="2" strokeDasharray="2 5" opacity=".7" />
                <circle cx={x} cy={l.y} r="7" fill={COLORS[l.idx]} />
                <a href={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/taxon/${encodeURIComponent(sp.i)}`}>
                  <text className="leaf-name" x={x + 16} y={l.y + 5}><tspan fontStyle={isItalicRank(sp.rank, ranks) ? 'italic' : 'normal'}>{sp.n}</tspan></text>
                  {chains[l.idx]?.common ? <text className="leaf-common" x={x + 16} y={l.y + 21}>{chains[l.idx].common}</text> : null}
                </a>
              </g>
            )
          })}
        </svg>
      </div>
      <p className="clado-legend">
        Left to right follows the classification from the top-level group down to each organism; each step is one rank, not a unit of time.
        Gold circles mark the deepest groups shared by two or more of the chosen organisms. Only the main ranks are labelled.
      </p>
    </section>
  )
}

function layoutTree(root, n) {
  if (!root || n < 2) return null
  const leaves = []
  ;(function visit(node) {
    for (const idx of node.leaves) leaves.push({ idx, node })
    for (const c of node.children) visit(c)
  })(root)
  leaves.forEach((l, i) => { l.y = 48 + i * ROW })
  ;(function assignY(node) {
    const ys = []
    ;(function collect(nd) {
      for (const idx of nd.leaves) { const l = leaves.find(L => L.node === nd && L.idx === idx); if (l) ys.push(l.y) }
      for (const c of nd.children) collect(c)
    })(node)
    node.y = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0
    for (const c of node.children) assignY(c)
  })(root)
  let maxDepth = 1
  ;(function md(node) { maxDepth = Math.max(maxDepth, node.depth); for (const c of node.children) md(c) })(root)
  const inner = WIDTH - LEFT - RIGHT
  ;(function assignX(node) {
    node.x = node === root ? LEFT : LEFT + (node.depth / maxDepth) * inner
    for (const c of node.children) assignX(c)
  })(root)
  const edges = [], nodes = []
  ;(function walk(node) {
    if (node !== root) nodes.push(node)
    for (const c of node.children) {
      edges.push({ id: `${node.id}__${c.id}`, x1: node.x, y1: node.y, x2: c.x, y2: c.y, shared: c.passing.size >= 2 })
      walk(c)
    }
  })(root)
  for (const nd of nodes) {
    nd.mrca = nd.passing.size >= 2 && nd.children.length > 1
    // Terminal nodes are named by the leaf label on the right.
    const terminal = nd.children.length === 0 && nd.leaves.length > 0
    nd.label = !terminal && (MAJOR.has(nd.rank) || nd.mrca)
  }
  // Collision handling: labelled nodes on one horizontal line are placed in
  // up to four lanes (above, below, higher, lower). A lane is free when the
  // previous label in it ends before this node starts.
  const approxWidth = nd => 14 + (nd.rank ? nd.rank.length * 5.6 : 0) + nd.name.length * 6.6
  const LANES = [-9, 20, -24, 35]
  const byY = new Map()
  for (const nd of nodes) if (nd.label) { const k = Math.round(nd.y); if (!byY.has(k)) byY.set(k, []); byY.get(k).push(nd) }
  for (const line of byY.values()) {
    line.sort((a, b) => a.x - b.x || b.depth - a.depth)
    const laneEnd = LANES.map(() => -Infinity)
    for (const nd of line) {
      let lane = laneEnd.findIndex(end => end < nd.x + 7)
      if (lane < 0) {
        // No free lane: drop the least important label (non-MRCA, minor rank)
        if (!nd.mrca && !['domain', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species'].includes(nd.rank)) { nd.label = false; continue }
        lane = laneEnd.indexOf(Math.min(...laneEnd))
      }
      nd.labelDy = LANES[lane]
      laneEnd[lane] = nd.x + 7 + approxWidth(nd)
    }
  }
  leaves.forEach(l => { l.x = l.node.x })
  const height = 48 + leaves.length * ROW + 12
  return { leaves, edges, nodes, height }
}
