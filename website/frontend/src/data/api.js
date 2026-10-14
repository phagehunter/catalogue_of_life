// Client data layer for the schema-v2 static tree. Every fetch is cached as
// an in-flight promise; failures are evicted so they can be retried.
import { shardFor, normalise, prefixFilename } from './hash.js'

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')
export const DATA = `${BASE}data/`

const cache = new Map()

async function fetchJson(path, { retries = 1 } = {}) {
  if (cache.has(path)) return cache.get(path)
  const p = (async () => {
    let lastErr
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const r = await fetch(DATA + path)
        if (r.status === 404) return null
        if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
        return await r.json()
      } catch (e) {
        lastErr = e
      }
    }
    throw lastErr
  })()
  cache.set(path, p)
  p.catch(() => cache.delete(path))
  return p
}

// ---- Meta -----------------------------------------------------------------

let metaPromise
export function getMeta() {
  if (!metaPromise) {
    metaPromise = fetchJson('meta.json').then(m => {
      if (!m) throw new Error('meta.json not found — has the data build run?')
      if (m.schema !== 2) throw new Error(`Unsupported data schema ${m.schema}`)
      return m
    })
    metaPromise.catch(() => { metaPromise = null })
  }
  return metaPromise
}

// ---- Records --------------------------------------------------------------

const has = (obj, key) => obj != null && Object.prototype.hasOwnProperty.call(obj, key)

export async function getTaxon(id) {
  if (!id) return null
  const meta = await getMeta()
  const bucket = await fetchJson(`taxa/${shardFor(id, meta.shards.core)}.json`)
  return has(bucket, id) ? decorate(bucket[id], meta) : null
}

export async function getTaxa(ids) {
  const meta = await getMeta()
  const byShard = new Map()
  for (const id of new Set(ids)) {
    const s = shardFor(id, meta.shards.core)
    if (!byShard.has(s)) byShard.set(s, [])
    byShard.get(s).push(id)
  }
  const buckets = await Promise.all([...byShard.keys()].map(s => fetchJson(`taxa/${s}.json`)))
  const out = new Map()
  let i = 0
  for (const [, list] of byShard) {
    const bucket = buckets[i++]
    for (const id of list) if (has(bucket, id)) out.set(id, decorate(bucket[id], meta))
  }
  return ids.map(id => out.get(id)).filter(Boolean)
}

export async function getHigher(id) {
  if (!id) return null
  const meta = await getMeta()
  const bucket = await fetchJson(`higher/${shardFor(id, meta.shards.higher)}.json`)
  if (!has(bucket, id)) return null
  const h = bucket[id]
  return { ...h, rank: meta.ranks[h.r], chain: h.A.map(([i, n, r]) => ({ i, n, r, rank: meta.ranks[r] })) }
}

export async function getDetail(id) {
  if (!id) return null
  const meta = await getMeta()
  const bucket = await fetchJson(`detail/${shardFor(id, meta.shards.core)}.json`)
  if (!has(bucket, id)) return { vernaculars: [], distribution: [] }
  const d = bucket[id]
  return {
    vernaculars: (d.v || []).map(([n, l, p]) => ({ n, l, p: !!p })),
    distribution: (d.d || []).map(([area, areaId, gazetteer, establishment, threat]) =>
      ({ area, areaId, gazetteer, establishment, threat })),
  }
}

// Decorate a core record with readable fields. Keeps the compact keys too.
function decorate(rec, meta) {
  const rank = rec.r != null ? meta.ranks[rec.r] : 'unranked'
  const status = rec.s != null ? meta.statuses[rec.s] : 'accepted'
  let link = null
  if (Array.isArray(rec.l)) link = (meta.linkPrefixes[rec.l[0]] || '') + rec.l[1]
  else if (typeof rec.l === 'string') link = rec.l
  if (link && !/^https?:\/\//.test(link)) link = null
  return {
    ...rec,
    rank,
    status,
    accepted: status === 'accepted' || status === 'provisionally accepted',
    link,
    extinct: !!rec.x,
    isBin: !!rec.b,
    isHigher: !!rec.h,
    xrAdded: !!rec.m,
    counts: { children: rec.nc || 0, synonyms: rec.ns || 0, vernaculars: rec.nv || 0, distributions: rec.nd || 0 },
  }
}

// ---- Lineage --------------------------------------------------------------

// Ancestors root → parent as [{i, n, rank}], plus whether the chain is
// complete (false when an ancestor is missing from the dataset).
export async function getLineage(taxon) {
  const meta = await getMeta()
  const between = []       // non-higher ancestors between taxon and its nearest higher ancestor
  let cur = taxon
  let hops = 0
  while (cur && hops < 8) {
    if (cur.isHigher) {
      const h = await getHigher(cur.i)
      const chain = h ? h.chain : []
      // `between` already holds every ancestor walked so far (nearest first).
      return { chain: [...chain, ...between.reverse()], complete: !!h && !h.orphan }
    }
    if (!cur.p) return { chain: between.reverse(), complete: false }
    const parent = await getTaxon(cur.p)
    if (!parent) return { chain: between.reverse(), complete: false }
    between.push({ i: parent.i, n: parent.n, rank: parent.rank, status: parent.status })
    cur = parent
    hops++
  }
  return { chain: between.reverse(), complete: false }
}

// ---- Children -------------------------------------------------------------

function summary(meta) {
  return ([id, n, r, s, x, nc, flags]) => ({
    i: id, n, rank: meta.ranks[r] || 'unranked', status: meta.statuses[s] || 'accepted',
    extinct: !!x, counts: { children: nc || 0 }, isBin: !!(flags & 1),
    accepted: s === 0 || s === 1,
  })
}

export async function getChildren(parentId) {
  const meta = await getMeta()
  const bucket = await fetchJson(`kids/${shardFor(parentId, meta.shards.kids)}.json`)
  const entry = has(bucket, parentId) ? bucket[parentId] : {}
  const map = summary(meta)
  return { children: (entry.c || []).map(map), synonyms: (entry.s || []).map(map), pageSize: meta.shards.kidsPage }
}

// page 1 is the inline page; page >= 2 are overflow files.
export async function getChildrenPage(parentId, kind, page) {
  const meta = await getMeta()
  if (page <= 1) {
    const all = await getChildren(parentId)
    return kind === 's' ? all.synonyms : all.children
  }
  const rows = await fetchJson(`kids/p/${encodeURIComponent(parentId)}-${kind}${page - 1}.json`)
  return (rows || []).map(summary(meta))
}

// ---- Search ---------------------------------------------------------------

let manifestPromise
function getManifest() {
  if (!manifestPromise) {
    manifestPromise = fetchJson('search/manifest.json').then(m => m || { maxPrefix: 6, shards: {} })
    manifestPromise.catch(() => { manifestPromise = null })
  }
  return manifestPromise
}

export function entryKey(e) {
  // kind 4 with a numeric rank slot = epithet token (extra = matched word);
  // everything else matches on the normalised display name.
  if (e[3] === 4 && typeof e[2] === 'number') return e[4]
  return normalise(e[1])
}

export function decodeEntry(e, meta) {
  const [id, name, rankOrLang, kind, extra] = e
  const sci = typeof rankOrLang === 'number'
  return {
    i: id,
    name,
    kind: ['accepted', 'vernacular', 'provisional', 'synonym', 'token'][kind] || 'accepted',
    isVernacular: !sci,
    rank: sci ? meta.ranks[rankOrLang] : null,
    language: sci ? null : rankOrLang,
    scientificName: sci ? name : (extra || null),
    matchedWord: sci && kind === 4 ? extra : null,
  }
}

export async function search(query, { limit = 25, includeBins = false } = {}) {
  const q = normalise(query)
  if (q.length < 2) return { results: [], partial: false, query: q }
  const [meta, manifest] = await Promise.all([getMeta(), getManifest()])
  const shards = manifest.shards
  let prefix = null
  for (let L = Math.min(q.length, manifest.maxPrefix || 6); L >= 1; L--) {
    const p = q.slice(0, L)
    if (shards[p]) { prefix = p; break }
  }
  if (!prefix) return { results: [], partial: false, query: q }
  const rows = (await fetchJson(`search/${prefixFilename(prefix)}.json`)) || []
  const partial = shards[prefix] === 's' && q.length <= prefix.length

  const scored = []
  for (const e of rows) {
    const key = entryKey(e)
    if (!key || !key.startsWith(q)) continue
    if (!includeBins && typeof e[1] === 'string' && e[1].startsWith('BOLD:')) continue
    const exact = key === q ? 0 : 1
    scored.push({ e, score: exact * 100 + e[3] * 10 + Math.min(key.length - q.length, 9) })
  }
  scored.sort((a, b) => a.score - b.score || a.e[1].localeCompare(b.e[1]))

  // One row per taxon: keep the best entry, remember a matched common name.
  const seen = new Map()
  const out = []
  for (const { e } of scored) {
    const d = decodeEntry(e, meta)
    const prev = seen.get(d.i)
    if (prev) {
      if (!prev.commonName && d.isVernacular) prev.commonName = d.name
      continue
    }
    const item = { ...d, commonName: d.isVernacular ? d.name : null }
    seen.set(d.i, item)
    out.push(item)
    if (out.length >= limit) break
  }
  return { results: out, partial, query: q, total: scored.length }
}

export const __test = { fetchJson, cache }
