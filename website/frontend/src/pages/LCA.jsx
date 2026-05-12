import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { search, getLineage, getTaxon } from '../api.js'
import './LCA.css'

// ===========================================================================
//  "How related?" — multi-species phylogenetic comparator.
//
//  Picks 2 to 6 taxa, walks each lineage, merges them into one tree, and
//  renders a real SVG cladogram with pairwise relatedness verdicts.
//
//  All computation is in-browser against the existing sharded JSON.
// ===========================================================================

const MAX_SPECIES = 6
const SPECIES_COLORS = ['#6fd49a', '#f5d27a', '#d97757', '#a78bfa', '#5cc8d4', '#ff8fb6']

// Curated educational pairings rather than trivia ↔ trivia.
const PRESETS = [
  {
    label: 'Vertebrate body plans',
    note: 'Same phylum, very different lineages',
    queries: ['Homo', 'Rana', 'Carcharhinus'],
  },
  {
    label: 'Three solutions to flight',
    note: 'Bird, bat, bumblebee — convergence in action',
    queries: ['Passer', 'Pteropus', 'Bombus'],
  },
  {
    label: 'Plant kingdom across deep time',
    note: 'Flowering plant, fern, moss, alga',
    queries: ['Quercus', 'Pteridium', 'Sphagnum'],
  },
  {
    label: 'Same-genus siblings',
    note: 'What a single genus actually contains',
    queries: ['Panthera', 'Felis'],
  },
  {
    label: 'Domesticated companions',
    note: 'Dog, cat, horse — how close are they really?',
    queries: ['Canis', 'Felis', 'Equus'],
  },
  {
    label: 'Same name, different kingdoms',
    note: 'Why "fish" and "starfish" share more than a name… or do they?',
    queries: ['Salmo', 'Asterias'],
  },
]

// Rank → human-readable verdict.
const RELATEDNESS = {
  species:      ['identical',         'Same species'],
  subspecies:   ['near-twins',        'Same species, different subspecies'],
  variety:      ['near-twins',        'Same species'],
  form:         ['near-twins',        'Same species'],
  subgenus:     ['siblings',          'Same subgenus'],
  genus:        ['siblings',          'Same genus — closely related'],
  subtribe:     ['close cousins',     'Same subtribe'],
  tribe:        ['close cousins',     'Same tribe'],
  subfamily:    ['close cousins',     'Same subfamily'],
  family:       ['cousins',           'Same family'],
  superfamily:  ['cousins',           'Same superfamily'],
  infraorder:   ['relatives',         'Same infraorder'],
  suborder:     ['relatives',         'Same suborder'],
  order:        ['relatives',         'Same order'],
  superorder:   ['distant relatives', 'Same superorder'],
  infraclass:   ['distant relatives', 'Same infraclass'],
  subclass:     ['distant relatives', 'Same subclass'],
  class:        ['distant relatives', 'Same class'],
  superclass:   ['distant kin',       'Same superclass'],
  subphylum:    ['distant kin',       'Same subphylum'],
  phylum:       ['distant kin',       'Same phylum — share a basic body plan'],
  superphylum:  ['ancient kin',       'Same superphylum'],
  subkingdom:   ['ancient kin',       'Same subkingdom'],
  kingdom:      ['kingdom-mates',     'Same kingdom'],
  superkingdom: ['domain-mates',      'Same superkingdom'],
  domain:       ['domain-mates',      'Same domain — share fundamental cell biology'],
}
const DEFAULT_VERDICT = ['life-tree cousins', 'Share only the deepest history of life']

const RANK_PRETTY = (r) => r ? r.charAt(0).toUpperCase() + r.slice(1) : 'Unranked'

// ===========================================================================
//  Page
// ===========================================================================

export default function LCA() {
  const [params, setParams] = useSearchParams()
  const [species, setSpecies] = useState([])
  const [chains, setChains] = useState([])
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const initialised = useRef(false)

  // Restore from URL on mount: ?a=ID1&b=ID2&c=ID3…
  useEffect(() => {
    if (initialised.current) return
    initialised.current = true
    const keys = ['a', 'b', 'c', 'd', 'e', 'f']
    const ids = keys.map(k => params.get(k)).filter(Boolean)
    if (ids.length === 0) return
    Promise.all(ids.map(id => getTaxon(id).catch(() => null)))
      .then(results => setSpecies(results.filter(Boolean)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Walk each species' lineage when the list changes.
  useEffect(() => {
    if (species.length === 0) { setChains([]); return }
    let cancelled = false
    setBusy(true)
    Promise.all(species.map(s => getLineage(s.i)))
      .then(ls => {
        if (cancelled) return
        setChains(ls)
        setBusy(false)
        const keys = ['a', 'b', 'c', 'd', 'e', 'f']
        const next = {}
        species.forEach((s, i) => { if (keys[i]) next[keys[i]] = s.i })
        setParams(next, { replace: true })
      })
      .catch(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [species.map(s => s.i).join('|')])

  // Build the merged tree + pairwise MRCAs.
  const analysis = useMemo(() => analyseChains(species, chains), [species, chains])

  function addSpecies(t) {
    if (!t) return
    if (species.find(s => s.i === t.i)) return
    if (species.length >= MAX_SPECIES) return
    setSpecies([...species, t])
  }
  function removeSpecies(idx) {
    setSpecies(species.filter((_, i) => i !== idx))
  }
  function clearAll() { setSpecies([]) }

  async function loadPreset(queries) {
    setBusy(true)
    const results = await Promise.all(queries.map(async q => {
      const rs = await search(q, { limit: 6 })
      const pick = rs.find(r => !r.v) || rs[0]
      return pick ? getTaxon(pick.i) : null
    }))
    setSpecies(results.filter(Boolean))
    setBusy(false)
  }

  function copyShareUrl() {
    if (!navigator.clipboard) return
    navigator.clipboard.writeText(window.location.href)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
      .catch(() => {})
  }

  return (
    <div className="page lca-page">
      <header className="lca-hero">
        <h1>How related are these species?</h1>
        <p className="lede">
          Pick two to six organisms. We'll trace each lineage through the
          Catalogue of Life, build a real phylogenetic tree, and tell you in
          plain English how close every pair really is.
        </p>
      </header>

      <SpeciesList
        species={species}
        onAdd={addSpecies}
        onRemove={removeSpecies}
        onClear={clearAll}
        busy={busy}
      />

      {busy && species.length === 0 ? <div className="loader">Loading</div> : null}

      {analysis && species.length >= 2 ? (
        <>
          <VerdictGrid analysis={analysis} species={species} />
          <Cladogram analysis={analysis} species={species} />
          <ShareBar onCopy={copyShareUrl} copied={copied} count={species.length} />
        </>
      ) : null}

      {species.length < 2 ? (
        <PresetGrid presets={PRESETS} onPick={loadPreset} />
      ) : null}
    </div>
  )
}


// ===========================================================================
//  Species picker row
// ===========================================================================

function SpeciesList({ species, onAdd, onRemove, onClear, busy }) {
  return (
    <div className="lca-species-list">
      {species.map((s, i) => (
        <SpeciesChip
          key={s.i + ':' + i}
          species={s}
          index={i}
          color={SPECIES_COLORS[i % SPECIES_COLORS.length]}
          onRemove={() => onRemove(i)}
        />
      ))}

      {species.length < MAX_SPECIES && !busy ? (
        <SpeciesPicker
          key={'picker_' + species.length}
          label={species.length === 0
            ? 'Add your first species'
            : species.length === 1
              ? 'Add another to compare'
              : `Add another (${species.length}/${MAX_SPECIES})`}
          color={SPECIES_COLORS[species.length % SPECIES_COLORS.length]}
          onPick={onAdd}
        />
      ) : null}

      {species.length > 0 ? (
        <button className="lca-clear-all" onClick={onClear} type="button">Clear all</button>
      ) : null}
    </div>
  )
}

function SpeciesChip({ species, color, onRemove }) {
  return (
    <div className="lca-chip" style={{ borderColor: color }}>
      <span className="lca-chip-dot" style={{ background: color }} />
      <div className="lca-chip-text">
        <div className="lca-chip-rank">{RANK_PRETTY(species.r)}</div>
        <Link to={`/taxon/${encodeURIComponent(species.i)}`} className="lca-chip-name">
          {species.n}
        </Link>
        {species.v?.length ? (
          <div className="lca-chip-vern">{species.v[0].n}</div>
        ) : null}
      </div>
      <button type="button" className="lca-chip-remove" onClick={onRemove} aria-label="Remove">×</button>
    </div>
  )
}

function SpeciesPicker({ label, color, onPick }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const ref = useRef(null)

  useEffect(() => {
    if (q.length < 2) { setResults([]); return }
    let cancelled = false
    const handle = setTimeout(async () => {
      try {
        const r = await search(q, { limit: 14 })
        if (!cancelled) { setResults(r); setActive(0) }
      } catch {}
    }, 130)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [q])

  useEffect(() => {
    function onDocClick(e) { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  async function pick(entry) {
    const t = await getTaxon(entry.i)
    if (t) onPick(t)
    setOpen(false)
    setQ('')
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[active]) pick(results[active]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={ref} className="lca-picker">
      <label style={{ color }}>{label}</label>
      <input
        type="search"
        placeholder="Type a name (species, genus, family)…"
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        autoComplete="off"
      />
      {open && results.length > 0 ? (
        <div className="suggest" role="listbox">
          {results.map((r, i) => (
            <button
              key={r.i + '|' + r.n + '|' + i}
              type="button"
              className={'suggest-item' + (i === active ? ' active' : '')}
              onMouseDown={e => { e.preventDefault(); pick(r) }}
              onMouseEnter={() => setActive(i)}
            >
              <span className={'nm' + (r.v ? ' vern' : '')}>{r.n}</span>
              <span className="ranklbl">{r.v ? 'common' : (r.r || '')}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}


// ===========================================================================
//  Tree analysis — merge chains, find MRCAs, compute pairwise verdicts
// ===========================================================================

function analyseChains(species, chains) {
  if (chains.length < 2 || chains.some(c => !c?.length)) return null

  // Merge chains into a tree.
  const root = { id: '__root__', name: 'root', rank: null, children: [], speciesAtEnd: [], depth: 0, parent: null }
  chains.forEach((chain, idx) => {
    let cur = root
    for (let i = 0; i < chain.length; i++) {
      const node = chain[i]
      let child = cur.children.find(c => c.id === node.i)
      if (!child) {
        child = {
          id: node.i,
          name: node.n,
          rank: node.r,
          authorship: node.a,
          children: [],
          speciesAtEnd: [],
          depth: i + 1,
          parent: cur,
        }
        cur.children.push(child)
      }
      cur = child
    }
    cur.speciesAtEnd.push(idx)
  })

  // Annotate each node with the set of species that pass through it.
  function annotate(node) {
    const set = new Set(node.speciesAtEnd)
    for (const c of node.children) {
      const childSet = annotate(c)
      for (const x of childSet) set.add(x)
    }
    node.speciesPassing = set
    return set
  }
  annotate(root)

  // Pairwise MRCAs: for each pair (i, j), the deepest node whose
  // speciesPassing contains both i and j.
  const pairs = []
  for (let i = 0; i < species.length; i++) {
    for (let j = i + 1; j < species.length; j++) {
      const mrca = deepestCommon(root, i, j)
      pairs.push({ i, j, mrca })
    }
  }

  // Overall MRCA = deepest node containing ALL species.
  let overall = root
  function findOverall(node) {
    if (node.speciesPassing.size === species.length && node.depth > overall.depth) overall = node
    for (const c of node.children) findOverall(c)
  }
  findOverall(root)

  return { root, pairs, overall }
}

function deepestCommon(root, i, j) {
  let best = null
  function walk(node) {
    if (node.id !== '__root__' && node.speciesPassing.has(i) && node.speciesPassing.has(j)) {
      if (!best || node.depth > best.depth) best = node
    }
    for (const c of node.children) walk(c)
  }
  walk(root)
  return best
}


// ===========================================================================
//  Verdict grid — pairwise "how related?" rendered as a real summary
// ===========================================================================

function VerdictGrid({ analysis, species }) {
  const overallVerdict = verdictFor(analysis.overall?.rank)
  return (
    <section className="lca-verdicts">
      <div className="lca-verdict-headline">
        <div className="lca-verdict-label">All {species.length} species are</div>
        <div className="lca-verdict-word">{overallVerdict[0]}</div>
        <div className="lca-verdict-detail">
          {overallVerdict[1]}
          {analysis.overall ? (
            <> · share <strong>
              <Link to={`/taxon/${encodeURIComponent(analysis.overall.id)}`}>
                {analysis.overall.name}
              </Link>
            </strong> ({RANK_PRETTY(analysis.overall.rank)})</>
          ) : null}
        </div>
      </div>

      {analysis.pairs.length > 1 ? (
        <div className="lca-pairgrid">
          {analysis.pairs.map(({ i, j, mrca }) => {
            const [word, detail] = verdictFor(mrca?.rank)
            return (
              <div className="lca-pair" key={`${i}_${j}`}>
                <div className="lca-pair-species">
                  <Dot color={SPECIES_COLORS[i % SPECIES_COLORS.length]} />
                  <em>{species[i].n}</em>
                </div>
                <div className="lca-pair-vs">↔</div>
                <div className="lca-pair-species">
                  <Dot color={SPECIES_COLORS[j % SPECIES_COLORS.length]} />
                  <em>{species[j].n}</em>
                </div>
                <div className="lca-pair-verdict">
                  <span className="lca-pair-word">{word}</span>
                  <span className="lca-pair-detail">{detail}</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}

function Dot({ color }) {
  return <span className="lca-dot" style={{ background: color }} />
}

function verdictFor(rank) {
  return RELATEDNESS[rank] || DEFAULT_VERDICT
}


// ===========================================================================
//  Cladogram — SVG phylogenetic tree
// ===========================================================================

const ROW_HEIGHT = 56
const LEFT_PAD = 80
const RIGHT_PAD = 280
const SVG_WIDTH = 1100

function Cladogram({ analysis, species }) {
  const layout = useMemo(() => layoutTree(analysis.root, species), [analysis, species])
  if (!layout) return null

  const { leaves, edges, internalNodes, height } = layout

  return (
    <section className="lca-cladogram-wrap">
      <div className="lca-cladogram-scroll">
        <svg
          className="lca-cladogram"
          viewBox={`0 0 ${SVG_WIDTH} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Phylogenetic tree connecting the chosen species"
        >
          {/* Background grid: faint rank lanes */}
          <g className="lca-cladogram-grid">
            {/* Subtle vertical guide lines could go here */}
          </g>

          {/* Branches */}
          {edges.map(e => (
            <path
              key={e.id}
              d={`M ${e.x1.toFixed(1)} ${e.y1.toFixed(1)} L ${e.x1.toFixed(1)} ${e.y2.toFixed(1)} L ${e.x2.toFixed(1)} ${e.y2.toFixed(1)}`}
              className={e.isMRCAEdge ? 'lca-edge lca-edge-mrca' : 'lca-edge'}
            />
          ))}

          {/* Internal nodes — rank/name labels at every branching point */}
          {internalNodes.map(n => (
            <g key={n.id} className={`lca-internal ${n.isMRCA ? 'lca-internal-mrca' : ''}`}>
              <circle cx={n.x} cy={n.y} r={n.isMRCA ? 5 : 3} />
              <text x={n.x} y={n.y - 9} textAnchor="middle">
                <tspan className="lca-internal-rank">{RANK_PRETTY(n.rank)}</tspan>
                <tspan dx="6" className="lca-internal-name">{n.name}</tspan>
              </text>
            </g>
          ))}

          {/* Leaves — the picked species */}
          {leaves.map((leaf) => {
            const color = SPECIES_COLORS[leaf.speciesIdx % SPECIES_COLORS.length]
            const sp = species[leaf.speciesIdx]
            return (
              <g key={`leaf_${leaf.speciesIdx}`} className="lca-leaf">
                <line
                  x1={leaf.node.x}
                  y1={leaf.y}
                  x2={SVG_WIDTH - RIGHT_PAD + 8}
                  y2={leaf.y}
                  className="lca-leaf-tail"
                  style={{ stroke: color }}
                />
                <circle cx={SVG_WIDTH - RIGHT_PAD + 8} cy={leaf.y} r="7" fill={color} />
                <a href={`#/taxon/${encodeURIComponent(sp.i)}`}>
                  <text x={SVG_WIDTH - RIGHT_PAD + 22} y={leaf.y + 5} className="lca-leaf-name">
                    <tspan fontStyle="italic">{sp.n}</tspan>
                  </text>
                  {sp.v?.length ? (
                    <text x={SVG_WIDTH - RIGHT_PAD + 22} y={leaf.y + 22} className="lca-leaf-vern">
                      {sp.v[0].n}
                    </text>
                  ) : null}
                </a>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="lca-cladogram-legend">
        Time / divergence flows <strong>left → right</strong>. Branching points
        are taxonomic ranks; the largest gold circles are MRCAs (Most Recent
        Common Ancestors). Click any name to open its full taxon page.
      </div>
    </section>
  )
}

function layoutTree(root, species) {
  if (!root || species.length < 2) return null

  // 1. Collect leaves in DFS order so siblings stay together visually.
  const leaves = []
  function visit(node) {
    for (const idx of node.speciesAtEnd) leaves.push({ speciesIdx: idx, node })
    for (const c of node.children) visit(c)
  }
  visit(root)

  // 2. Assign y-coords to each leaf row.
  leaves.forEach((l, i) => { l.y = 36 + i * ROW_HEIGHT })

  // 3. Compute internal node y as midpoint of its leaves' span.
  function descendantLeafYs(node, out = []) {
    for (const idx of node.speciesAtEnd) {
      const l = leaves.find(L => L.node === node && L.speciesIdx === idx)
      if (l) out.push(l.y)
    }
    for (const c of node.children) descendantLeafYs(c, out)
    return out
  }
  function assignY(node) {
    if (node === root) {
      const ys = descendantLeafYs(node)
      node.y = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0
    } else {
      const ys = descendantLeafYs(node)
      node.y = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0
    }
    for (const c of node.children) assignY(c)
  }
  assignY(root)

  // 4. Compute x by depth. Find max depth among internal nodes (leaves use parent's x).
  let maxDepth = 1
  function findMax(node) {
    if (node.depth > maxDepth) maxDepth = node.depth
    for (const c of node.children) findMax(c)
  }
  findMax(root)
  const innerWidth = SVG_WIDTH - LEFT_PAD - RIGHT_PAD
  function assignX(node) {
    if (node === root) node.x = LEFT_PAD
    else node.x = LEFT_PAD + (node.depth / maxDepth) * innerWidth
    for (const c of node.children) assignX(c)
  }
  assignX(root)

  // 5. Collect edges (parent → child).
  const edges = []
  const internalNodes = []
  function walk(node) {
    if (node !== root) internalNodes.push(node)
    for (const c of node.children) {
      const speciesShared = new Set([...c.speciesPassing])
      edges.push({
        id: `${node.id}__${c.id}`,
        x1: node.x, y1: node.y, x2: c.x, y2: c.y,
        isMRCAEdge: speciesShared.size >= 2,
      })
      walk(c)
    }
  }
  walk(root)

  // 6. Mark MRCAs (any internal node whose speciesPassing >= 2).
  internalNodes.forEach(n => { n.isMRCA = n.speciesPassing.size >= 2 })

  const height = 36 + leaves.length * ROW_HEIGHT + 36
  return { leaves, edges, internalNodes, height }
}


// ===========================================================================
//  Share + presets
// ===========================================================================

function ShareBar({ onCopy, copied, count }) {
  return (
    <div className="lca-share">
      <button type="button" onClick={onCopy}>
        {copied ? '✓ URL copied' : `Copy URL to share this ${count}-species comparison`}
      </button>
    </div>
  )
}

function PresetGrid({ presets, onPick }) {
  return (
    <section className="lca-presets">
      <h2>Try a curated comparison</h2>
      <div className="lca-preset-grid">
        {presets.map(p => (
          <button
            key={p.label}
            type="button"
            className="lca-preset"
            onClick={() => onPick(p.queries)}
          >
            <div className="lca-preset-label">{p.label}</div>
            <div className="lca-preset-note">{p.note}</div>
            <div className="lca-preset-queries">
              {p.queries.map((q, i) => (
                <span key={q}>
                  <em>{q}</em>{i < p.queries.length - 1 ? ' · ' : ''}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
