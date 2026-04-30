import {describe, expect, it} from 'vitest'
import {getAtPath, hasAtPath, setAtPath, unsetAtPath} from '../src/path-ops'

describe('getAtPath', () => {
  it('reads a nested value', () => {
    expect(getAtPath({a: {b: {c: 42}}}, ['a', 'b', 'c'])).toBe(42)
  })

  it('returns the input when the path is empty', () => {
    const obj = {a: 1}
    expect(getAtPath(obj, [])).toBe(obj)
  })

  it('returns undefined when an intermediate is missing', () => {
    expect(getAtPath({a: {}}, ['a', 'b', 'c'])).toBeUndefined()
  })
})

describe('hasAtPath', () => {
  it('returns true for a present leaf', () => {
    expect(hasAtPath({a: {b: 1}}, ['a', 'b'])).toBe(true)
  })

  it('returns false when an intermediate is missing', () => {
    expect(hasAtPath({a: {}}, ['a', 'b', 'c'])).toBe(false)
  })

  it('returns true when the leaf is present but explicitly undefined', () => {
    expect(hasAtPath({a: {b: undefined}}, ['a', 'b'])).toBe(true)
  })
})

describe('setAtPath', () => {
  it('writes a value at a nested path that already exists', () => {
    const obj: any = {a: {b: 1}}
    setAtPath(obj, ['a', 'b'], 99)
    expect(obj).toEqual({a: {b: 99}})
  })

  it('creates plain object intermediates when the next key is non-numeric', () => {
    const obj: any = {}
    setAtPath(obj, ['a', 'b', 'c'], 7)
    expect(obj).toEqual({a: {b: {c: 7}}})
    expect(Array.isArray(obj.a)).toBe(false)
  })

  it('creates an array intermediate when the next key is a numeric string', () => {
    const obj: any = {}
    setAtPath(obj, ['arr', '0'], 'x')
    expect(Array.isArray(obj.arr)).toBe(true)
    expect(obj.arr[0]).toBe('x')
  })

  it('preserves an existing array when traversing into it', () => {
    const arr: any[] = []
    const obj: any = {arr}
    setAtPath(obj, ['arr', '0'], 'x')
    expect(obj.arr).toBe(arr)
    expect(obj.arr[0]).toBe('x')
  })
})

describe('unsetAtPath', () => {
  it('deletes a leaf', () => {
    const obj: any = {a: {b: 1, c: 2}}
    unsetAtPath(obj, ['a', 'b'])
    expect(obj).toEqual({a: {c: 2}})
  })

  it('is a no-op for a missing path', () => {
    const obj: any = {a: {}}
    expect(() => unsetAtPath(obj, ['a', 'b', 'c'])).not.toThrow()
    expect(obj).toEqual({a: {}})
  })
})
