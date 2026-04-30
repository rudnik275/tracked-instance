import {cloneDeep, DeepPartial, isObject} from './utils'
import {getAtPath, hasAtPath, setAtPath, unsetAtPath} from './path-ops'

/**
 * Sentinel used to represent arrays inside the ledger store.
 *
 * Plain arrays cannot be stored because:
 *   1. setAtPath treats numeric path keys against array-shaped destinations as array
 *      indices and would reconstruct plain arrays, conflicting with sparse index tracking.
 *   2. A Proxy `set` trap on arrays fires for both index assignments and the implicit
 *      `length` update — storing a plain array would conflate the two events.
 *
 * Enumerable keys are individual indices; `length` is non-enumerable so the ledger
 * walkers skip it while applyReverse can still read the original length to restore it first.
 */
class ArrayInOriginalData {
  length: number

  constructor(length: number) {
    this.length = length
    Object.defineProperty(this, 'length', {
      enumerable: false,
      value: length,
    })
  }
}

interface LedgerPathItem {
  target: Record<string, any>
  property: string
}

type LedgerPath = LedgerPathItem[]

/**
 * Writes the *current* value at `path` into `store`, creating intermediate
 * container nodes (plain objects or ArrayInOriginalData) as needed.
 *
 * Bails out early when an intermediate node in the store is already a primitive —
 * this happens when a field was previously changed from an object to a scalar, meaning
 * the whole subtree is already captured at a higher level and should not be overwritten.
 */
const setOriginalDataValue = (store: Record<string, any>, path: LedgerPath) => {
  let target = store
  for (const {target: oldValueParent, property} of path.slice(0, -1)) {
    if (property in target) {
      if (isObject(target[property]) || target[property] instanceof ArrayInOriginalData) {
        target = target[property]
      } else {
        return
      }
    } else {
      if (Array.isArray(oldValueParent[property])) {
        target = target[property] = new ArrayInOriginalData(oldValueParent[property].length)
      } else if (isObject(oldValueParent[property])) {
        target = target[property] = {}
      }
    }
  }

  const lastItem = path.at(-1)!
  target[lastItem.property] = lastItem.target[lastItem.property]
}

/**
 * Removes a leaf and prunes any ancestor containers that become empty as a result.
 *
 * Object.keys ignores ArrayInOriginalData's non-enumerable `length`, so an AID with
 * no surviving indices is treated as empty and unset from its parent — matching the
 * behavior of the previous customRef-based deleteProperty propagation.
 */
const unsetAndPrune = (store: Record<string, any>, path: string[]) => {
  unsetAtPath(store, path)
  for (let i = path.length - 1; i >= 1; i--) {
    const parentPath = path.slice(0, i)
    const parent = getAtPath(store, parentPath) as Record<string, any> | undefined
    if (parent !== undefined && Object.keys(parent).length === 0) {
      unsetAtPath(store, parentPath)
    } else {
      break
    }
  }
  if (path.length >= 1) {
    const topKey = path[0]
    const topValue = store[topKey]
    if (topValue !== undefined && typeof topValue === 'object' && Object.keys(topValue).length === 0) {
      delete store[topKey]
    }
  }
}

const recordChange = (
  store: Record<string, any>,
  path: LedgerPath,
  value: any,
  equals?: (a: unknown, b: unknown) => boolean,
) => {
  const pathAsString = path.map((i) => i.property)
  const valueInOriginalData = getAtPath(store, pathAsString) as any

  const markRemovedFieldsAsUndefined = (
    valueInOriginalData?: Record<string, any>,
    oldValue?: Record<string, any>,
  ) => {
    const keysSet = new Set<string>()
    if (valueInOriginalData) for (const key of Object.keys(valueInOriginalData)) keysSet.add(key)
    if (oldValue) for (const key of Object.keys(oldValue)) keysSet.add(key)
    const keys = Array.from(keysSet).filter((key) => !Object.keys(value).includes(key))
    for (const key of keys) {
      recordChange(
        store,
        path.concat({target: oldValue || value, property: key}),
        undefined,
        equals,
      )
    }
  }

  const lastPathItem = path.at(-1)!
  const oldValue = lastPathItem.target[lastPathItem.property]
  if (isObject(value) && (isObject(valueInOriginalData) || isObject(oldValue))) {
    markRemovedFieldsAsUndefined(valueInOriginalData, oldValue)
    for (const key of Object.keys(value)) {
      recordChange(store, path.concat({target: oldValue || value, property: key}), value[key], equals)
    }
  } else if (Array.isArray(value) && (valueInOriginalData instanceof ArrayInOriginalData || Array.isArray(oldValue))) {
    markRemovedFieldsAsUndefined(valueInOriginalData, oldValue)
    for (const key of value.keys()) {
      recordChange(store, path.concat({target: oldValue || value, property: key.toString()}), value[key], equals)
    }
  } else {
    const isEqual = equals ? equals(oldValue, value) : oldValue === value
    const isEqualToOriginal = equals ? equals(valueInOriginalData, value) : valueInOriginalData === value
    if (!hasAtPath(store, pathAsString)) {
      if (!isEqual) {
        setOriginalDataValue(store, path)
      }
    } else if (isEqualToOriginal) {
      unsetAndPrune(store, pathAsString)
    }
  }
}

/**
 * Yields ledger paths whose live counterpart is a different shape from the recorded
 * node, so `projectDiff` can emit each as a leaf in the diff. Descends only when both
 * sides agree on container kind (plain object/object or AID/array); a type-changed
 * field is yielded whole rather than walked into.
 */
function* walkLedgerForDiff(
  store: Record<string, any>,
  liveData: any,
): Generator<string[]> {
  const walk = function* (path: string[], node: Record<string, any>): Generator<string[]> {
    for (const [key, value] of Object.entries(node)) {
      const currentPath = path.concat(key)
      const valueInData = getAtPath(liveData, currentPath)
      const isBothObject = isObject(value) && isObject(valueInData)
      const isBothArray = value instanceof ArrayInOriginalData && Array.isArray(valueInData)
      if (isBothObject || isBothArray) {
        yield* walk(currentPath, value)
      } else {
        yield currentPath
      }
    }
  }
  yield* walk([], store)
}

/**
 * Yields every node in the ledger (parents before children) so `applyReverse` can
 * restore array lengths via AID before scalar leaves are written. Descends into plain
 * objects and ArrayInOriginalData; treats anything else as a terminal value to apply.
 */
function* walkLedgerForReverse(
  store: Record<string, any>,
): Generator<[string[], any]> {
  const walk = function* (path: string[], node: Record<string, any>): Generator<[string[], any]> {
    for (const [key, value] of Object.entries(node)) {
      const currentPath = path.concat(key)
      if (isObject(value) || value instanceof ArrayInOriginalData) {
        yield [currentPath, value]
        yield* walk(currentPath, value)
      } else {
        yield [currentPath, value]
      }
    }
  }
  yield* walk([], store)
}

export interface OriginalDataLedgerOptions {
  /**
   * Custom equality function for primitive comparisons (replaces ===).
   * Called only at leaf values; callers typically forward TrackedInstanceOptions.equals.
   */
  equals?: (a: unknown, b: unknown) => boolean
}

/**
 * Sparse record of original (pre-change) values keyed by property path.
 *
 * Plain class — no Vue dependency. The owning composable wraps the ledger in a
 * shallowRef and calls triggerRef after each mutation to drive reactivity.
 */
export class OriginalDataLedger {
  private _store: Record<string, any> = {}
  private readonly _equals?: (a: unknown, b: unknown) => boolean

  constructor(options: OriginalDataLedgerOptions = {}) {
    this._equals = options.equals
  }

  /**
   * Records a write at the given path. Snapshots the original value on the first
   * change at that path, and removes the entry when the value reverts to its original.
   */
  record(path: LedgerPath, value: unknown): void {
    recordChange(this._store, path, value, this._equals)
  }

  /** True when no path is currently dirty. */
  isEmpty(): boolean {
    return Object.keys(this._store).length === 0
  }

  /**
   * Builds a sparse DeepPartial diff by reading current values from `liveData`
   * for every path that has an entry in the ledger. Type-changed fields (object →
   * scalar or vice versa) are emitted whole rather than descended into.
   */
  projectDiff<Data extends Record<string, any>>(liveData: Data): DeepPartial<Data> {
    const result = {} as DeepPartial<Data>
    for (const path of walkLedgerForDiff(this._store, liveData)) {
      setAtPath(result as Record<string, any>, path, getAtPath(liveData, path))
    }
    return result
  }

  /**
   * Returns a clone of `liveData` with every recorded path restored to its original
   * value. Array lengths are restored before individual indices so that excess
   * elements are dropped before scalar restoration runs.
   */
  applyReverse<Data>(liveData: Data): Data {
    const updatedData = cloneDeep(liveData)
    for (const [path, value] of walkLedgerForReverse(this._store)) {
      if (value instanceof ArrayInOriginalData) {
        setAtPath(updatedData as Record<string, any>, path.concat('length'), value.length)
      } else if (!isObject(value)) {
        if (value === undefined) {
          unsetAtPath(updatedData as object, path)
        } else {
          setAtPath(updatedData as Record<string, any>, path, value)
        }
      }
    }
    return updatedData
  }

  /** Drops all recorded changes. The next read will treat current liveData as clean. */
  clear(): void {
    this._store = {}
  }
}
