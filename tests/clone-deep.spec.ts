import {describe, expect, it} from 'vitest'
import {cloneDeep} from '../src/utils'

describe('cloneDeep', () => {
  it('returns primitives unchanged', () => {
    expect(cloneDeep(42)).toBe(42)
    expect(cloneDeep('s')).toBe('s')
    expect(cloneDeep(null)).toBe(null)
    expect(cloneDeep(undefined)).toBe(undefined)
  })

  it('deep-clones plain objects so mutations are independent', () => {
    const source = {a: {b: {c: 1}}}
    const clone = cloneDeep(source)
    expect(clone).toEqual(source)
    expect(clone).not.toBe(source)
    expect(clone.a).not.toBe(source.a)
    clone.a.b.c = 99
    expect(source.a.b.c).toBe(1)
  })

  it('deep-clones arrays', () => {
    const source = [{x: 1}, {x: 2}]
    const clone = cloneDeep(source)
    expect(clone).toEqual(source)
    expect(clone).not.toBe(source)
    expect(clone[0]).not.toBe(source[0])
  })

  it('clones Date as a new instance with the same timestamp', () => {
    const source = new Date('2024-01-15T10:00:00Z')
    const clone = cloneDeep(source)
    expect(clone).toBeInstanceOf(Date)
    expect(clone).not.toBe(source)
    expect(clone.getTime()).toBe(source.getTime())
  })

  it('keeps File as the same reference (Files are immutable)', () => {
    const source = new File(['hi'], 'a.txt', {type: 'text/plain'})
    expect(cloneDeep(source)).toBe(source)
  })

  it('keeps Map as the same reference (treated as atomic)', () => {
    const source = new Map([['k', 1]])
    expect(cloneDeep(source)).toBe(source)
  })

  it('keeps Set as the same reference (treated as atomic)', () => {
    const source = new Set([1, 2])
    expect(cloneDeep(source)).toBe(source)
  })
})
