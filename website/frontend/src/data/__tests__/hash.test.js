import { describe, it, expect } from 'vitest'
import { djb2, shardFor, normalise, prefixFilename } from '../hash.js'

describe('hash parity with process_data.py', () => {
  it('djb2 known values', () => {
    // Values produced by scripts/process_data.py shard_for() / djb2()
    expect(shardFor('4CGXQ', 4096)).toBe(364)
    expect(shardFor('6MB3T', 4096)).toBe(1073)
    expect(shardFor('5T6MX', 512)).toBe(169)
    expect(shardFor('𝔘x', 1024)).toBe(234)
    expect(shardFor('', 4096)).toBe(0)
  })
  it('normalise', () => {
    expect(normalise('Panthéra  Tígris × Léo')).toBe('panthera tigris × leo')
    expect(normalise("Zoe's Imperial Pigeon")).toBe('zoe s imperial pigeon')
    expect(normalise('')).toBe('')
  })
  it('prefixFilename', () => {
    expect(prefixFilename('pa n')).toBe('pa_n')
    expect(prefixFilename('ほし')).toBe('u307bu3057')
  })
  it('djb2 is unsigned 32-bit', () => {
    expect(djb2('a'.repeat(50))).toBeLessThan(2 ** 32)
  })
})
