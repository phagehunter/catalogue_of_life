import { describe, it, expect, beforeEach, vi } from 'vitest'
import { shardFor } from '../hash.js'

const META = {
  schema: 2, ranks: ['unranked', 'domain', 'kingdom', 'family', 'genus', 'species', 'subspecies'],
  statuses: ['accepted', 'provisionally accepted', 'synonym'],
  shards: { core: 16, higher: 4, kids: 8, kidsPage: 2, searchMaxPrefix: 6 },
  linkPrefixes: ['https://x.org/a?id='], roots: [],
}
const files = {}
function put(path, obj) { files[path] = obj }

beforeEach(() => {
  for (const k of Object.keys(files)) delete files[k]
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const path = url.replace(/^.*\/data\//, '')
    if (!(path in files)) return { ok: false, status: 404 }
    return { ok: true, status: 200, json: async () => files[path] }
  }))
  vi.resetModules()
})

async function load() {
  const api = await import('../api.js')
  put('meta.json', META)
  return api
}

describe('records', () => {
  it('decodes core records and dictionary links', async () => {
    const api = await load()
    put(`taxa/${shardFor('S1', 16)}.json`, { S1: { i: 'S1', n: 'Panthera tigris', r: 5, p: 'G1', l: [0, '3'], nc: 2, ns: 1 } })
    const t = await api.getTaxon('S1')
    expect(t.rank).toBe('species')
    expect(t.status).toBe('accepted')
    expect(t.link).toBe('https://x.org/a?id=3')
    expect(t.counts).toEqual({ children: 2, synonyms: 1, vernaculars: 0, distributions: 0 })
    expect(await api.getTaxon('NOPE')).toBeNull()
  })
  it('ignores prototype keys', async () => {
    const api = await load()
    put(`taxa/${shardFor('constructor', 16)}.json`, {})
    expect(await api.getTaxon('constructor')).toBeNull()
  })
  it('builds a lineage through non-higher parents', async () => {
    const api = await load()
    put(`taxa/${shardFor('U1', 16)}.json`, { U1: { i: 'U1', n: 'P. t. altaica', r: 6, p: 'S1' } })
    put(`taxa/${shardFor('S1', 16)}.json`, { S1: { i: 'S1', n: 'Panthera tigris', r: 5, p: 'G1' } })
    put(`taxa/${shardFor('G1', 16)}.json`, { G1: { i: 'G1', n: 'Panthera', r: 4, p: 'F1', h: 1 } })
    put(`higher/${shardFor('G1', 4)}.json`, { G1: { i: 'G1', n: 'Panthera', r: 4, A: [['D1', 'Eukaryota', 1], ['F1', 'Felidae', 3]] } })
    const u1 = await api.getTaxon('U1')
    const { chain, complete } = await api.getLineage(u1)
    expect(chain.map(c => c.n)).toEqual(['Eukaryota', 'Felidae', 'Panthera', 'Panthera tigris'])
    expect(complete).toBe(true)
  })
  it('pages children', async () => {
    const api = await load()
    put(`kids/${shardFor('G1', 8)}.json`, { G1: { c: [['S1', 'Panthera tigris', 5, 0, 0, 2, 0], ['S2', 'Panthera leo', 5, 0, 0, 0, 0]], s: [['Y1', 'Felis tigris', 5, 2, 0, 0, 0]] } })
    put('kids/p/G1-c1.json', [['S3', 'Panthera atrox', 5, 0, 1, 0, 0]])
    const k = await api.getChildren('G1')
    expect(k.children.map(c => c.n)).toEqual(['Panthera tigris', 'Panthera leo'])
    expect(k.synonyms[0].status).toBe('synonym')
    const p2 = await api.getChildrenPage('G1', 'c', 2)
    expect(p2[0].extinct).toBe(true)
    expect(await api.getChildrenPage('G1', 'c', 3)).toEqual([])
  })
  it('retries once then evicts failed fetches', async () => {
    const api = await load()
    let calls = 0
    fetch.mockImplementation(async (url) => {
      if (url.endsWith('meta.json')) return { ok: true, status: 200, json: async () => META }
      calls++
      return { ok: false, status: 500 }
    })
    await expect(api.getTaxon('S1')).rejects.toThrow('HTTP 500')
    expect(calls).toBe(2)
    expect(api.__test.cache.has(`taxa/${shardFor('S1', 16)}.json`)).toBe(false)
  })
})

describe('search', () => {
  it('uses the longest available prefix, ranks exact first, dedupes by taxon', async () => {
    const api = await load()
    put('search/manifest.json', { maxPrefix: 6, shards: { p: 's', pa: 's', pan: 'f' } })
    put('search/pan.json', [
      ['G1', 'Panthera', 4, 0],
      ['S1', 'Panthera tigris', 5, 0],
      ['S1', 'Panther', 'eng', 1, 'Panthera tigris'],
      ['Y1', 'Panthera tigrina', 5, 3],
      ['B1', 'BOLD:AAA1', 0, 0],
    ])
    const r = await api.search('panth')
    expect(r.partial).toBe(false)
    expect(r.results.map(x => x.i)).toEqual(['G1', 'S1', 'Y1'])
    expect(r.results[1].commonName).toBe('Panther')
    const exact = await api.search('Panthera tigris')
    expect(exact.results[0].i).toBe('S1')
  })
  it('flags partial results on a summary shard', async () => {
    const api = await load()
    put('search/manifest.json', { maxPrefix: 6, shards: { p: 's', pa: 's' } })
    put('search/pa.json', [['G1', 'Pan', 4, 0]])
    const r = await api.search('pa')
    expect(r.partial).toBe(true)
    expect(r.results[0].i).toBe('G1')
  })
  it('matches epithet tokens and vernacular entries', async () => {
    const api = await load()
    put('search/manifest.json', { maxPrefix: 6, shards: { t: 'f' } })
    put('search/t.json', [
      ['S1', 'Panthera tigris', 5, 4, 'tigris'],
      ['S1', 'Tiger', 'eng', 1, 'Panthera tigris'],
    ])
    const r = await api.search('tig')
    expect(r.results.length).toBe(1)
    expect(r.results[0].scientificName).toBe('Panthera tigris')
    expect(r.results[0].commonName).toBe('Tiger')
  })
})
