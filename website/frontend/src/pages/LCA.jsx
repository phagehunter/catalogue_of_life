import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { search, getLineage, getTaxon } from '../api.js'
import './LCA.css'

// ===========================================================================
//  Last Common Ancestor — pick two organisms, find the most recent shared
//  ancestor in the taxonomy and visualize the path each took afterward.
//
//  Algorithm:
//    1. Walk parents from each species back to the root → two ordered chains.
//    2. The chains share a prefix (root → … → LCA), then diverge.
//    3. The LCA is the last element of the shared prefix.
//    4. The two divergent suffixes are the two paths to render.
//
//  Everything runs in the browser against the existing sharded JSON data.
//  No backend, no extra build step.
// ===========================================================================

const RANK_PRETTY = (r) => r ? r.charAt(0).toUpperCase() + r.slice(1) : 'Unranked'

// Genus-level names so the lookup hits the search shard reliably even when
// the per-prefix shard is capped. The LCA is the same whichever species
// in the genus you pick, so this is a free trick.
const QUICK_PICKS = [
  ['Homo', 'Musa', 'human ↔ banana'],
  ['Homo', 'Saccharomyces', 'human ↔ baker\u2019s yeast'],
  ['Tyrannosaurus', 'Gallus', 'T. rex ↔ chicken'],
  ['Pan', 'Mus', 'chimp ↔ mouse'],
  ['Octopus', 'Apis', 'octopus ↔ honeybee'],
  ['Quercus', 'Sequoia', 'oak ↔ redwood'],
]


export default function LCA() {
  const [params, setParams] = useSearchParams()
  const [a, setA] = useState(null)
  const [b, setB] = useState(null)
  const [aChain, setAChain] = useState([])
  const [bChain, setBChain] = useState([])
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  // Restore from URL on mount (so /lca?a=ID&b=ID is shareable).
  useEffect(() => {
    const aId = params.get('a')
    const bId = params.get('b')
    if (aId) getTaxon(aId).then(t => t && setA(t)).catch(() => {})
    if (bId) getTaxon(bId).then(t => t && setB(t)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recompute lineages whenever either species changes.
  useEffect(() => {
    if (!a || !b) {
      setAChain([]); setBChain([])
      return
    }
    let cancelled = false
    setBusy(true)
    Promise.all([getLineage(a.i), getLineage(b.i)])
      .then(([la, lb]) => {
        if (cancelled) return
        setAChain(la); setBChain(lb); setBusy(false)
        setParams({ a: a.i, b: b.i }, { replace: true })
      })
      .catch(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a?.i, b?.i])

  const lca = useMemo(() => {
    if (!aChain.length || !bChain.length) return null
    let i = 0
    while (i < aChain.length && i < bChain.length && aChain[i].i === bChain[i].i) i++
    if (i === 0) return null
    return {
      node: aChain[i - 1],
      depthFromRoot: i - 1,
      aPath: aChain.slice(i),
      bPath: bChain.slice(i),
    }
  }, [aChain, bChain])

  function quickPick(aName, bName) {
    Promise.all([
      search(aName, { limit: 6 }),
      search(bName, { limit: 6 }),
    ]).then(async ([rsA, rsB]) => {
      // Prefer scientific names over vernaculars (`v` flag from the index).
      const pickId = (rs) => (rs.find(r => !r.v) || rs[0])?.i
      const idA = pickId(rsA)
      const idB = pickId(rsB)
      if (idA) setA(await getTaxon(idA))
      if (idB) setB(await getTaxon(idB))
    })
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
        <h1>Last Common Ancestor</h1>
        <p className="lede">
          Pick any two organisms. We'll trace both lineages back through the
          tree of life, pin-point the most recent ancestor they share, and
          show every taxonomic step that took them apart.
        </p>
      </header>

      <div className="lca-pickers">
        <SpeciesPicker label="Species A" value={a} onChange={setA} accent="leaf" />
        <span className="lca-vs" aria-hidden>↔</span>
        <SpeciesPicker label="Species B" value={b} onChange={setB} accent="gold" />
      </div>

      {(!a || !b) && !busy ? (
        <div className="lca-quickpicks">
          <div className="lca-quickpicks-label">Try one of these:</div>
          {QUICK_PICKS.map(([qa, qb, label]) => (
            <button
              key={label}
              type="button"
              className="lca-quickpick"
              onClick={() => quickPick(qa, qb)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {busy ? <div className="loader">Walking the tree of life</div> : null}

      {lca && a && b ? (
        <LCAResult
          lca={lca}
          a={a}
          b={b}
          aChain={aChain}
          bChain={bChain}
          onCopy={copyShareUrl}
          copied={copied}
        />
      ) : null}

      {a && b && !busy && !lca ? (
        <div className="empty">
          These two records don't share any lineage in the dataset (one or
          both may be orphans with missing parent IDs).
        </div>
      ) : null}
    </div>
  )
}


// ---------------------------------------------------------------------------
//  Result view — the tree itself
// ---------------------------------------------------------------------------

function LCAResult({ lca, a, b, aChain, bChain, onCopy, copied }) {
  const totalDistance = lca.aPath.length + lca.bPath.length
  const lcaSelfA = lca.aPath.length === 0
  const lcaSelfB = lca.bPath.length === 0

  return (
    <>
      <div className="stats lca-stats">
        <Stat
          label="Last shared ancestor"
          value={lca.node.n}
          sub={RANK_PRETTY(lca.node.r)}
        />
        <Stat
          label="Steps apart"
          value={totalDistance.toLocaleString()}
          sub={`${lca.aPath.length} → A · ${lca.bPath.length} → B`}
        />
        <Stat
          label="Shared depth from root"
          value={(lca.depthFromRoot + 1).toLocaleString()}
          sub={`out of ${aChain.length} on A's lineage`}
        />
      </div>

      <section className="lca-tree" aria-label="Phylogenetic path between the two species">
        <div className="lca-tree-root">
          <div className="lca-pill">★ Last Common Ancestor</div>
          <Link
            to={`/taxon/${encodeURIComponent(lca.node.i)}`}
            className="lca-node lca-node-lca"
          >
            <span className="lca-rank">{RANK_PRETTY(lca.node.r)}</span>
            <span className="lca-name">{lca.node.n}</span>
            {lca.node.a ? <span className="lca-author">{lca.node.a}</span> : null}
          </Link>
        </div>

        <div className="lca-tree-branches">
          <Branch label={a.n} path={lca.aPath} self={lcaSelfA ? a : null} side="a" />
          <Branch label={b.n} path={lca.bPath} self={lcaSelfB ? b : null} side="b" />
        </div>
      </section>

      <div className="lca-share">
        <button type="button" onClick={onCopy}>
          {copied ? '✓ URL copied' : 'Copy shareable URL'}
        </button>
      </div>
    </>
  )
}

function Branch({ label, path, self, side }) {
  if (self) {
    return (
      <div className={`lca-branch lca-branch-${side}`}>
        <div className="lca-branch-label">→ <em>{label}</em></div>
        <div className="lca-branch-self">
          <em>{label}</em> is the common ancestor itself.
        </div>
      </div>
    )
  }
  return (
    <div className={`lca-branch lca-branch-${side}`}>
      <div className="lca-branch-label">→ <em>{label}</em></div>
      {path.map((node, i) => {
        const isLeaf = i === path.length - 1
        return (
          <PathNode
            key={node.i}
            node={node}
            step={i}
            side={side}
            isLeaf={isLeaf}
          />
        )
      })}
    </div>
  )
}

function PathNode({ node, step, side, isLeaf }) {
  const cls = [
    'lca-node',
    'lca-node-step',
    `lca-side-${side}`,
    isLeaf ? `lca-node-leaf lca-leaf-${side}` : '',
  ].filter(Boolean).join(' ')
  return (
    <Link
      to={`/taxon/${encodeURIComponent(node.i)}`}
      className={cls}
      style={{ animationDelay: `${step * 70}ms` }}
    >
      <span className="lca-rank">{RANK_PRETTY(node.r)}</span>
      <span className="lca-name">{node.n}</span>
      {isLeaf && node.v?.length
        ? <span className="lca-vern">{node.v[0].n}</span>
        : null}
    </Link>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  )
}


// ---------------------------------------------------------------------------
//  Species picker — autocomplete using the existing sharded search index
// ---------------------------------------------------------------------------

function SpeciesPicker({ label, value, onChange, accent }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const ref = useRef(null)

  useEffect(() => { if (!value) setQ('') }, [value?.i])

  useEffect(() => {
    if (q.length < 2) { setResults([]); return }
    let cancelled = false
    const handle = setTimeout(async () => {
      try {
        const r = await search(q, { limit: 12 })
        if (!cancelled) { setResults(r); setActive(0) }
      } catch { /* network or missing shard */ }
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
    if (t) onChange(t)
    setOpen(false)
    setQ(entry.n)
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setActive(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault(); if (results[active]) pick(results[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={ref} className={`lca-picker lca-picker-${accent}`}>
      <label>{label}</label>
      {value ? (
        <div className="lca-picker-chosen">
          <div className="lca-picker-chosen-text">
            <div className="lca-rank">{RANK_PRETTY(value.r)}</div>
            <div className="lca-name">{value.n}</div>
            {value.a ? <div className="lca-author">{value.a}</div> : null}
          </div>
          <button
            type="button"
            className="lca-clear"
            onClick={() => { onChange(null); setQ('') }}
            aria-label="Clear selection"
          >×</button>
        </div>
      ) : (
        <input
          type="search"
          placeholder="Type a species, genus, or family name…"
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          autoComplete="off"
        />
      )}
      {!value && open && results.length > 0 ? (
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
