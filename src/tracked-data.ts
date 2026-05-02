import {computed, ComputedRef, customRef, Ref, shallowRef, triggerRef} from 'vue'
import {cloneDeep, DeepPartial, isObject} from './utils'

// ---------- path helpers (private, inlined from former path-ops) ----------

const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key)
const isIntegerKey = (key: string) => /^(?:0|[1-9]\d*)$/.test(key)

function getAtPath(obj: any, path: string[]): unknown {
  let cur: any = obj
  for (const key of path) {
    if (cur == null) return undefined
    cur = cur[key]
  }
  return cur
}

function hasAtPath(obj: any, path: string[]): boolean {
  if (path.length === 0) return obj !== undefined
  let cur: any = obj
  for (let i = 0; i < path.length - 1; i++) {
    if (cur == null || typeof cur !== 'object' || !hasOwn(cur, path[i])) return false
    cur = cur[path[i]]
  }
  return cur != null && typeof cur === 'object' && hasOwn(cur, path[path.length - 1]!)
}

function setAtPath(obj: Record<string, any>, path: string[], value: unknown): void {
  if (path.length === 0) return
  let target: any = obj
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    const existing = target[key]
    if (existing == null || typeof existing !== 'object') {
      target[key] = isIntegerKey(path[i + 1]!) ? [] : {}
    }
    target = target[key]
  }
  target[path[path.length - 1]!] = value
}

function unsetAtPath(obj: any, path: string[]): boolean {
  if (path.length === 0) return false
  let cur: any = obj
  for (let i = 0; i < path.length - 1; i++) {
    if (cur == null || typeof cur !== 'object') return true
    cur = cur[path[i]]
  }
  if (cur == null || typeof cur !== 'object') return true
  return delete cur[path[path.length - 1]!]
}

// ---------- ledger sentinel ----------

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

// ---------- ledger record/walk helpers ----------

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
 * node, so the diff projection can emit each as a leaf in the diff. Descends only when
 * both sides agree on container kind (plain object/object or AID/array); a type-changed
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
 * Yields every node in the ledger (parents before children) so the reverse-apply pass
 * can restore array lengths via AID before scalar leaves are written. Descends into plain
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

// ---------- ledger ----------

interface OriginalDataLedgerOptions {
  equals?: (a: unknown, b: unknown) => boolean
}

/**
 * Sparse record of pre-change values keyed by Path.
 *
 * Internal to this module: a Tracked Instance owns exactly one Ledger, and the
 * Ledger drives Changed Data, isDirty, and reset(). The reactivity trigger sits
 * one level up in createTrackedData and fires once per recorded mutation.
 */
class OriginalDataLedger {
  private _store: Record<string, any> = {}
  private readonly _equals?: (a: unknown, b: unknown) => boolean

  constructor(options: OriginalDataLedgerOptions = {}) {
    this._equals = options.equals
  }

  record(path: LedgerPath, value: unknown): void {
    recordChange(this._store, path, value, this._equals)
  }

  isEmpty(): boolean {
    return Object.keys(this._store).length === 0
  }

  projectDiff<Data extends Record<string, any>>(liveData: Data): DeepPartial<Data> {
    const result = {} as DeepPartial<Data>
    for (const path of walkLedgerForDiff(this._store, liveData)) {
      setAtPath(result as Record<string, any>, path, getAtPath(liveData, path))
    }
    return result
  }

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

  clear(): void {
    this._store = {}
  }
}

// ---------- tracked proxy ----------

/**
 * Wraps `initialData` in a deeply-Proxy'd Vue ref. Every mutation at any depth is
 * recorded into `ledger`, then `onMutate` is called so the owner can drive Vue
 * reactivity (a triggerRef on the shallowRef holding the ledger).
 *
 * Handles three responsibilities the public composable shouldn't care about:
 *   - nested Proxy creation + path bookkeeping
 *   - Array.length synthesis: writes to an array's `length` don't fire individual
 *     index events through Proxy traps, so synthetic per-index `delete`/`set` events
 *     are emitted on the live receiver to keep ledger index entries consistent
 *   - cloneDeep on every write so stored values are detached from caller refs
 */
const createTrackedProxy = <Data extends Record<string, any>>(
  initialData: Data,
  ledger: OriginalDataLedger,
  onMutate: () => void,
): Ref<Data> =>
  customRef<Data>((track, trigger) => {
    const createProxy = <Inner extends Record<string, any>>(
      source: Inner,
      parentTree: LedgerPath = [],
    ): Inner =>
      new Proxy(source, {
        get(target, property: string, receiver) {
          track()
          const result = Reflect.get(target, property, receiver)
          if (isObject(result) || Array.isArray(result)) {
            return createProxy(result, parentTree.concat({target, property}))
          }
          return result
        },
        set(target, property: string, value, receiver) {
          const path = parentTree.concat({target, property})
          const oldValue = target[property as keyof typeof target]

          if (Array.isArray(target) && property === 'length') {
            if (value !== oldValue) {
              if (value < oldValue) {
                for (let i = value; i < oldValue; i++) {
                  delete receiver[i]
                }
              } else {
                for (let i = oldValue; i < value; i++) {
                  receiver[i] = undefined
                }
              }
            }
          } else {
            ledger.record(path, value)
            onMutate()
          }

          const result = Reflect.set(target, property, cloneDeep(value), receiver)
          trigger()
          return result
        },
        deleteProperty(target, property: string) {
          const path = parentTree.concat({target, property})
          ledger.record(path, undefined)
          onMutate()
          const result = Reflect.deleteProperty(target, property)
          trigger()
          return result
        },
      })

    let value = createProxy(initialData)

    return {
      get() {
        track()
        return value
      },
      set(newValue: Data) {
        value = createProxy(newValue)
        trigger()
      },
    }
  })

// ---------- public factory ----------

export interface CreateTrackedDataOptions {
  /**
   * Custom equality function for comparing primitive values.
   * When provided, replaces the default strict equality (===) check at leaf comparisons.
   */
  equals?: (a: unknown, b: unknown) => boolean
}

export interface TrackedData<Data extends Record<string, any>> {
  dataRef: Ref<Data>
  isDirty: ComputedRef<boolean>
  changedData: ComputedRef<DeepPartial<Data>>
  loadData: (newValue: Data) => void
  reset: () => void
}

/**
 * Builds the full tracking machinery for a single object shape: the deeply-proxied
 * data ref, the Ledger, and the reactive isDirty / changedData projections.
 *
 * Owns the Vue reactivity wiring (shallowRef + triggerRef) for the Ledger so that
 * every recorded mutation invalidates dependent computeds exactly once. Callers
 * never see the Ledger or the Proxy directly.
 */
export const createTrackedData = <Data extends Record<string, any>>(
  initialValue: Data,
  options: CreateTrackedDataOptions = {},
): TrackedData<Data> => {
  const ledger = new OriginalDataLedger(options)
  const ledgerRef = shallowRef(ledger)
  const bumpLedger = () => triggerRef(ledgerRef)

  const dataRef = createTrackedProxy<Data>(cloneDeep(initialValue), ledger, bumpLedger)

  const isDirty = computed<boolean>(() => !ledgerRef.value.isEmpty())

  const changedData = computed<DeepPartial<Data>>(() =>
    ledgerRef.value.projectDiff(dataRef.value),
  )

  const loadData = (newValue: Data) => {
    dataRef.value = cloneDeep(newValue)
    ledger.clear()
    bumpLedger()
  }

  const reset = () => {
    dataRef.value = ledger.applyReverse(dataRef.value)
    ledger.clear()
    bumpLedger()
  }

  return {
    dataRef,
    isDirty,
    changedData,
    loadData,
    reset,
  }
}
