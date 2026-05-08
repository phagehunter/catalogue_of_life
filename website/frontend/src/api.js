// Tiny client-side data layer. Mirrors the sharding scheme used by
// scripts/process_data.py — same hash, same bucket count.

const NUM_SHARDS = 1024

// Public path. In dev this is "/", in production "/<repo>/".
// Vite hard-codes this at build time via import.meta.env.BASE_URL.
const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/')
const DATA = `${BASE}data/`

// djb2 — must match shard_for() in process_data.py byte-for-byte.
export function shardFor(id) {
  if (!id) return 0
  let h = 5381
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) + h + id.charCodeAt(i)) >>> 0 // unsigned 32-bit
  }
  return h % NUM_SHARDS
}

// One in-flight Promise per shard so a flurry of clicks doesn't refetch.
const shardCache = new Map()
function loadShard(shard) {
  if (!shardCache.has(shard)) {
    shardCache.set(
      shard,
      fetch(`${DATA}taxa/${shard}.json`)
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`shard ${shard}: ${r.status}`)))
        .catch(err => { shardCache.delete(shard); throw err })
    )
  }
  return shardCache.get(shard)
}

export async function getTaxon(id) {
  if (!id) return null
  const shard = shardFor(id)
  const bucket = await loadShard(shard)
  return bucket[id] || null
}

// Fetch many records in parallel — typically the children of a node.
export async function getTaxa(ids) {
  if (!ids || ids.length === 0) return []
  const byShard = new Map()
  for (const id of ids) {
    const s = shardFor(id)
    if (!byShard.has(s)) byShard.set(s, [])
    byShard.get(s).push(id)
  }
  const buckets = await Promise.all([...byShard.keys()].map(loadShard))
  const map = new Map()
  let i = 0
  for (const shard of byShard.keys()) {
    const bucket = buckets[i++]
    for (const id of byShard.get(shard)) {
      const r = bucket[id]
      if (r) map.set(id, r)
    }
  }
  return ids.map(id => map.get(id)).filter(Boolean)
}

// ---- Top-level singletons --------------------------------------------------

let rootsPromise, statsPromise, searchManifestPromise

export function getRoots() {
  if (!rootsPromise) {
    rootsPromise = fetch(`${DATA}roots.json`).then(r => r.json())
  }
  return rootsPromise
}

export function getStats() {
  if (!statsPromise) {
    statsPromise = fetch(`${DATA}stats.json`).then(r => r.json())
  }
  return statsPromise
}

function getSearchManifest() {
  if (!searchManifestPromise) {
    searchManifestPromise = fetch(`${DATA}search/manifest.json`).then(r => r.json())
  }
  return searchManifestPromise
}

// ---- Search ----------------------------------------------------------------

const searchShardCache = new Map()
function loadSearchShard(prefix) {
  if (!searchShardCache.has(prefix)) {
    searchShardCache.set(
      prefix,
      fetch(`${DATA}search/${prefix}.json`)
        .then(r => r.ok ? r.json() : [])
        .catch(() => [])
    )
  }
  return searchShardCache.get(prefix)
}

function normaliseQuery(q) {
  return (q || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function prefixFor(q) {
  const norm = normaliseQuery(q)
  if (!norm) return null
  const a = /[a-z0-9]/.test(norm[0]) ? norm[0] : '_'
  const b = norm.length > 1 && /[a-z0-9]/.test(norm[1]) ? norm[1] : '_'
  return a + b
}

export async function search(query, { limit = 30 } = {}) {
  const q = normaliseQuery(query)
  if (q.length < 2) return []
  const prefix = prefixFor(q)
  const shard = await loadSearchShard(prefix)
  const seen = new Set()
  const out = []
  // Two passes — exact-prefix matches first, then "contains" matches.
  for (const entry of shard) {
    if (out.length >= limit) break
    const n = entry.n.toLowerCase()
    if (n.startsWith(q) && !seen.has(entry.i + '|' + entry.n)) {
      seen.add(entry.i + '|' + entry.n)
      out.push(entry)
    }
  }
  if (out.length < limit) {
    for (const entry of shard) {
      if (out.length >= limit) break
      const n = entry.n.toLowerCase()
      if (!n.startsWith(q) && n.includes(q) && !seen.has(entry.i + '|' + entry.n)) {
        seen.add(entry.i + '|' + entry.n)
        out.push(entry)
      }
    }
  }
  return out
}

// ---- Lineage walk ----------------------------------------------------------

// Walks parent IDs upward from a taxon to build the breadcrumb. Caps at 30
// to defend against malformed data with a parent cycle.
export async function getLineage(id) {
  const chain = []
  let cur = id
  let safety = 0
  const seen = new Set()
  while (cur && safety < 30 && !seen.has(cur)) {
    seen.add(cur)
    const t = await getTaxon(cur)
    if (!t) break
    chain.unshift(t)
    cur = t.p
    safety++
  }
  return chain
}

export { DATA as DATA_BASE }
