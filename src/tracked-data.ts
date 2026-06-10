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

/**
 * Writes `value` at `path`, creating missing intermediate containers. When the
 * Ledger-aware `makeContainer` factory is provided it decides object-vs-array by
 * the recorded LedgerNode kind; the integer-key heuristic is only the fallback,
 * because a plain object keyed by numeric strings ({0: 'a'}) must not be
 * projected as an array.
 */
function setAtPath(
  obj: Record<string, any>,
  path: string[],
  value: unknown,
  makeContainer?: (prefix: string[]) => Record<string, any> | unknown[],
): void {
  if (path.length === 0) return
  let target: any = obj
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    const existing = target[key]
    if (existing == null || typeof existing !== 'object') {
      target[key] = makeContainer
        ? makeContainer(path.slice(0, i + 1))
        : isIntegerKey(path[i + 1]!) ? [] : {}
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

// ---------- ledger node protocol ----------

// Strategy: one container class tagged by `kind` ('object' | 'array'), disambiguated
// from recorded leaf values everywhere through the single `isLedgerNode` helper below.

/**
 * Container node in the Ledger that backs an object or array branch in the live data.
 *
 * Wraps a plain Record so entries() iterates only recorded children — leaves and
 * nested LedgerNodes — preserving the "sparse, only changed paths" Ledger invariant.
 * Array nodes additionally carry the Baseline `length` so applyReverse can restore it
 * before scalar leaves are written; `length` is unread (and harmless) on object nodes.
 * Indices are stored as string keys to keep the Path shape uniform across both kinds.
 */
class LedgerNode {
  private readonly _entries: Record<string, LedgerNode | unknown> = {}

  constructor(readonly kind: 'object' | 'array', public length = 0) {}

  has(key: string): boolean {
    return hasOwn(this._entries, key)
  }

  get(key: string): LedgerNode | unknown {
    return this._entries[key]
  }

  set(key: string, value: LedgerNode | unknown): void {
    this._entries[key] = value
  }

  delete(key: string): void {
    delete this._entries[key]
  }

  entries(): [string, LedgerNode | unknown][] {
    return Object.entries(this._entries)
  }

  isEmpty(): boolean {
    return Object.keys(this._entries).length === 0
  }
}

/**
 * The single disambiguation helper. Every recorder/walker that needs to tell
 * "is this a Ledger container or a recorded leaf value?" goes through this.
 */
const isLedgerNode = (value: unknown): value is LedgerNode => value instanceof LedgerNode

/**
 * Wraps a wholesale-captured Baseline value as a LedgerNode tree so the projection
 * and reverse walkers can traverse it through the protocol. Primitives, Date, File,
 * Map, Set, and other atomic values are returned as-is.
 */
function captureAsLedgerNode(value: unknown): LedgerNode | unknown {
  if (Array.isArray(value)) {
    const node = new LedgerNode('array', value.length)
    for (let i = 0; i < value.length; i++) {
      node.set(String(i), captureAsLedgerNode(value[i]))
    }
    return node
  }
  if (isObject(value)) {
    const node = new LedgerNode('object')
    for (const [key, child] of Object.entries(value)) {
      node.set(key, captureAsLedgerNode(child))
    }
    return node
  }
  return value
}

// ---------- ledger path types ----------

interface LedgerPathItem {
  target: Record<string, any>
  property: string
}

type LedgerPath = LedgerPathItem[]

interface LedgerLookup {
  /** True when `path` resolves to a recorded entry (even one whose value is `undefined`). */
  found: boolean
  /** The recorded value at `path` — a LedgerNode container or a captured leaf — or undefined. */
  value: LedgerNode | unknown
}

/**
 * Resolves `path` inside the Ledger in a single walk, reporting both whether the
 * Path is recorded and the value found there. `found` is distinct from a
 * `value` of `undefined`: a removed key is recorded as the leaf `undefined`, so
 * callers must check `found` rather than `value != null` to tell "recorded as
 * deleted" apart from "never touched".
 */
function lookupInLedger(root: LedgerNode, path: string[]): LedgerLookup {
  if (path.length === 0) return {found: true, value: root}
  let cur: LedgerNode = root
  for (let i = 0; i < path.length - 1; i++) {
    const next = cur.get(path[i])
    if (!isLedgerNode(next)) return {found: false, value: undefined}
    cur = next
  }
  const lastKey = path[path.length - 1]!
  if (!cur.has(lastKey)) return {found: false, value: undefined}
  return {found: true, value: cur.get(lastKey)}
}

/**
 * Removes the leaf at `path` and prunes any ancestor LedgerNode that becomes
 * empty as a result. Empty-container detection goes through node.isEmpty(),
 * which counts only recorded entries — never the array `length` field — so
 * an array LedgerNode with no surviving indices is treated as empty.
 */
function unsetInLedger(root: LedgerNode, path: string[]): void {
  if (path.length === 0) return
  // Walk to the parent of the leaf
  const parents: LedgerNode[] = [root]
  let cur: LedgerNode = root
  for (let i = 0; i < path.length - 1; i++) {
    const next = cur.get(path[i])
    if (!isLedgerNode(next)) return
    parents.push(next)
    cur = next
  }
  cur.delete(path[path.length - 1]!)
  for (let i = parents.length - 1; i >= 1; i--) {
    if (parents[i].isEmpty()) {
      parents[i - 1].delete(path[i - 1]!)
    } else {
      break
    }
  }
}

// ---------- unified ledger traversal ----------

/**
 * Visitor interface for `walkLedger`.
 *
 * The traversal calls `visitContainer` on every LedgerNode (parent before its
 * children) and `visitLeaf` on every non-node entry. When `visitContainer`
 * returns `false`, the traversal skips that node's children — this is the
 * mechanism the diff side uses to stop descent at live-data shape divergence
 * without the traversal itself knowing about live data. The reverse side always
 * returns `true` (or omits the return) to descend unconditionally.
 *
 * Shape: visitor object — chosen over a rich-event generator because
 * (1) the stop-descent flag maps cleanly onto a boolean return value from
 *     `visitContainer`, keeping each consumer's logic self-contained, and
 * (2) the implementation is a straightforward recursive function rather than
 *     a generator that must thread yield* through conditional branches.
 */
interface LedgerVisitor {
  visitContainer(path: string[], node: LedgerNode): boolean
  visitLeaf(path: string[], value: unknown): void
}

/**
 * Traverses the entire Ledger tree rooted at `store`, dispatching to the
 * supplied visitor in parent-before-children order. Container nodes are
 * visited before their children so that `applyReverse` can restore an array's
 * `length` (recorded on the array LedgerNode) before writing scalar leaves.
 */
function walkLedger(store: LedgerNode, visitor: LedgerVisitor): void {
  const walk = (path: string[], node: LedgerNode): void => {
    for (const [key, value] of node.entries()) {
      const currentPath = path.concat(key)
      if (isLedgerNode(value)) {
        const shouldDescend = visitor.visitContainer(currentPath, value)
        if (shouldDescend) {
          walk(currentPath, value)
        }
      } else {
        visitor.visitLeaf(currentPath, value)
      }
    }
  }
  walk([], store)
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
  private _store: LedgerNode = new LedgerNode('object')
  private readonly _equals?: (a: unknown, b: unknown) => boolean

  constructor(options: OriginalDataLedgerOptions = {}) {
    this._equals = options.equals
  }

  /**
   * Writes the Baseline value at `path` into the store, creating intermediate
   * LedgerNode containers (object or array) as needed.
   *
   * Bails out early when an intermediate slot in the store is already a recorded
   * leaf — this happens when a field was previously changed from an object to a
   * scalar, meaning the whole subtree is already captured at a higher level and
   * should not be overwritten.
   */
  private _setStoreValue(path: LedgerPath): void {
    let target: LedgerNode = this._store
    for (const {target: oldValueParent, property} of path.slice(0, -1)) {
      if (target.has(property)) {
        const existing = target.get(property)
        if (isLedgerNode(existing)) {
          target = existing
        } else {
          return
        }
      } else {
        if (Array.isArray(oldValueParent[property])) {
          const node = new LedgerNode('array', oldValueParent[property].length)
          target.set(property, node)
          target = node
        } else if (isObject(oldValueParent[property])) {
          const node = new LedgerNode('object')
          target.set(property, node)
          target = node
        }
      }
    }

    const lastItem = path.at(-1)!
    target.set(lastItem.property, captureAsLedgerNode(lastItem.target[lastItem.property]))
  }

  /**
   * Records `undefined` for any keys present in `storeNode` or `oldValue` but
   * absent from the incoming `value`, so that keys removed by an object/array
   * replacement land in the Ledger as deletions.
   */
  private _markMissingKeysAsRemoved(
    path: LedgerPath,
    value: Record<string, any>,
    storeNode: LedgerNode | undefined,
    oldValue: Record<string, any> | undefined,
  ): void {
    const present = new Set(Object.keys(value))
    const removed = new Set<string>()
    if (storeNode) for (const [key] of storeNode.entries()) removed.add(key)
    if (oldValue) for (const key of Object.keys(oldValue)) removed.add(key)
    for (const key of removed) {
      if (present.has(key)) continue
      // `oldValue || value`: see _recordContainerMutation for why the new value
      // stands in as the parent when there is no Baseline subtree.
      this._recordLeaf(path.concat({target: oldValue || value, property: key}), undefined)
    }
  }

  /**
   * Handles a Proxy-trap event for an object or array value: marks removed
   * keys/indices as deleted, then recurses into each present key/index. The only
   * object-vs-array difference is the key list, computed inline.
   *
   * `oldValue` and `storeNode` are resolved once by the caller (`record`) and
   * passed in so this method does not re-walk the Ledger for the parent path.
   */
  private _recordContainerMutation(
    path: LedgerPath,
    value: Record<string, any>,
    oldValue: Record<string, any> | undefined,
    storeNode: LedgerNode | undefined,
  ): void {
    this._markMissingKeysAsRemoved(path, value, storeNode, oldValue)
    const keys = Array.isArray(value) ? value.map((_, i) => String(i)) : Object.keys(value)
    for (const key of keys) {
      // `oldValue || value` substitutes the new value as the Baseline parent when
      // there is no prior subtree (e.g. a wholly-new branch). With a real Baseline,
      // children compare new-vs-old; without one they compare new-vs-new and so are
      // NOT individually recorded — the wholesale capture at this Path already covers
      // them. Replacing this with `oldValue?.[key]` would make children compare against
      // `undefined` and spuriously record every one. Load-bearing — do not simplify.
      this.record(path.concat({target: oldValue || value, property: key}), value[key])
    }
  }

  /**
   * Handles a Proxy-trap event for a primitive (leaf) value: either records the
   * Baseline value if the field is first touched, or clears it from the Ledger
   * if the current value matches the Baseline (field reverted to clean).
   *
   * Reads the Ledger once via lookupInLedger: `found` tells first-touch from
   * already-recorded (a recorded leaf may legitimately be `undefined`), and the
   * resolved value is the Baseline to compare a revert against.
   */
  private _recordLeaf(path: LedgerPath, value: unknown): void {
    const pathAsString = path.map((i) => i.property)
    const {found, value: baseline} = lookupInLedger(this._store, pathAsString)
    const lastPathItem = path.at(-1)!
    const oldValue = lastPathItem.target[lastPathItem.property]
    if (!found) {
      const isEqual = this._equals ? this._equals(oldValue, value) : oldValue === value
      if (!isEqual) this._setStoreValue(path)
    } else {
      const isEqualToBaseline = this._equals ? this._equals(baseline, value) : baseline === value
      if (isEqualToBaseline) unsetInLedger(this._store, pathAsString)
    }
  }

  /**
   * Single entry point called by the Proxy for every mutation. Resolves the
   * value-in-Ledger (a LedgerNode container, a captured leaf, or absent) and the
   * old live value once, then dispatches to the container or leaf recorder so all
   * "shape" judgments stay in sync and the parent Path is walked only once.
   */
  record(path: LedgerPath, value: unknown): void {
    const pathAsString = path.map((i) => i.property)
    const {value: valueInStore} = lookupInLedger(this._store, pathAsString)
    const lastPathItem = path.at(-1)!
    const oldValue = lastPathItem.target[lastPathItem.property]
    const storeNode = isLedgerNode(valueInStore) ? valueInStore : undefined
    if (isObject(value) && (storeNode?.kind === 'object' || isObject(oldValue))) {
      this._recordContainerMutation(path, value, oldValue, storeNode)
    } else if (Array.isArray(value) && (storeNode?.kind === 'array' || Array.isArray(oldValue))) {
      this._recordContainerMutation(path, value, oldValue, storeNode)
    } else {
      this._recordLeaf(path, value)
    }
  }

  isEmpty(): boolean {
    return this._store.isEmpty()
  }

  /**
   * Ledger-aware container factory for setAtPath: a missing intermediate
   * container is an array exactly when the recorded LedgerNode at that prefix
   * is an array node. Every intermediate prefix on a leaf's Path corresponds to
   * a container node in the store, so the lookup always resolves.
   */
  private _containerForPrefix = (prefix: string[]): Record<string, any> | unknown[] => {
    const {value} = lookupInLedger(this._store, prefix)
    return isLedgerNode(value) && value.kind === 'array' ? [] : {}
  }

  projectDiff<Data extends Record<string, any>>(liveData: Data): DeepPartial<Data> {
    const result = {} as DeepPartial<Data>
    const containerFor = this._containerForPrefix
    walkLedger(this._store, {
      visitContainer(path, node): boolean {
        // Stop descent when the live data at this path has a different shape from
        // the recorded node (type-divergence). In that case yield the whole path
        // as a leaf so the caller sees the full replacement rather than a partial diff.
        const liveValue = getAtPath(liveData, path)
        const isBothObject = node.kind === 'object' && isObject(liveValue)
        const isBothArray = node.kind === 'array' && Array.isArray(liveValue)
        if (isBothObject || isBothArray) return true
        setAtPath(result as Record<string, any>, path, liveValue, containerFor)
        return false
      },
      visitLeaf(path, _value): void {
        setAtPath(result as Record<string, any>, path, getAtPath(liveData, path), containerFor)
      },
    })
    return result
  }

  applyReverse<Data>(liveData: Data): Data {
    const updatedData = cloneDeep(liveData)
    const containerFor = this._containerForPrefix
    walkLedger(this._store, {
      visitContainer(path, node): boolean {
        // Restore the container shape before children are written (parent-before-
        // children ordering). For arrays also restore the Baseline length. If the
        // field was type-changed to a different shape (e.g. hobbies went from
        // string[] to string, or a numeric-keyed object became a scalar), create a
        // fresh container of the recorded kind so child visits populate it
        // correctly instead of relying on key-shape guessing.
        const cur = getAtPath(updatedData as any, path)
        if (node.kind === 'array') {
          if (Array.isArray(cur)) {
            cur.length = node.length
          } else {
            const restored: unknown[] = []
            restored.length = node.length
            setAtPath(updatedData as Record<string, any>, path, restored, containerFor)
          }
        } else if (!isObject(cur)) {
          setAtPath(updatedData as Record<string, any>, path, {}, containerFor)
        }
        return true
      },
      visitLeaf(path, value): void {
        if (value === undefined) {
          unsetAtPath(updatedData as object, path)
        } else {
          setAtPath(updatedData as Record<string, any>, path, value, containerFor)
        }
      },
    })
    return updatedData
  }

  clear(): void {
    this._store = new LedgerNode('object')
  }
}

// ---------- tracked proxy ----------

interface TrackedProxyHandle<Data> {
  dataRef: Ref<Data>
  /**
   * The raw (un-proxied) live data. Internal walkers (projectDiff, applyReverse)
   * read through this instead of dataRef so they don't pay Proxy-trap cost and
   * don't allocate throwaway nested proxies; reactivity is unaffected because
   * every mutation already bumps the ledger ref.
   */
  getRaw: () => Data
}

/**
 * Wraps `initialData` in a deeply-Proxy'd Vue ref. Every mutation at any depth calls
 * `onMutation(path, value)` exactly once so the owner can record the change and drive
 * Vue reactivity in a single step.
 *
 * Handles four responsibilities the public composable shouldn't care about:
 *   - nested Proxy creation + path bookkeeping
 *   - stable proxy identity: nested proxies are cached per raw object (keyed by the
 *     access path), so `data.value.obj === data.value.obj` holds and identity-based
 *     consumers (includes/indexOf, Map/Set keys, memoization) work. The cache stays
 *     correct because every write stores a fresh clone — a raw object can never
 *     silently move to another Path while keeping its cached proxy.
 *   - Array.length synthesis: writes to an array's `length` don't fire individual
 *     index events through Proxy traps, so synthetic per-index `delete`/`set` events
 *     are emitted on the live receiver to keep ledger index entries consistent
 *   - cloneDeep on every write so stored values are detached from caller refs
 *
 * Symbol-keyed properties are exempt from tracking: a symbol cannot be represented
 * in a string-keyed Path, so symbol reads return the raw value and symbol writes
 * mutate the data without touching the Ledger.
 */
const createTrackedProxy = <Data extends Record<string, any>>(
  initialData: Data,
  onMutation: (path: LedgerPath, value: unknown) => void,
): TrackedProxyHandle<Data> => {
  let rawValue = initialData
  const dataRef = customRef<Data>((track, trigger) => {
    const proxyCache = new WeakMap<object, {proxy: any; pathKey: string}>()

    const createProxy = <Inner extends Record<string, any>>(
      source: Inner,
      parentTree: LedgerPath = [],
      parentKey = '',
    ): Inner =>
      new Proxy(source, {
        get(target, property, receiver) {
          track()
          const result = Reflect.get(target, property, receiver)
          if (typeof property === 'symbol') return result
          if (isObject(result) || Array.isArray(result)) {
            const pathKey = parentKey + ' ' + property
            const cached = proxyCache.get(result)
            if (cached && cached.pathKey === pathKey) return cached.proxy
            const proxy = createProxy(result, parentTree.concat({target, property}), pathKey)
            proxyCache.set(result, {proxy, pathKey})
            return proxy
          }
          return result
        },
        set(target, property, value, receiver) {
          if (typeof property === 'symbol') {
            const result = Reflect.set(target, property, value, receiver)
            trigger()
            return result
          }
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
            onMutation(path, value)
          }

          const result = Reflect.set(target, property, cloneDeep(value), receiver)
          trigger()
          return result
        },
        deleteProperty(target, property) {
          if (typeof property === 'symbol') {
            const result = Reflect.deleteProperty(target, property)
            trigger()
            return result
          }
          const path = parentTree.concat({target, property})
          onMutation(path, undefined)
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
        rawValue = newValue
        value = createProxy(newValue)
        trigger()
      },
    }
  })
  return {dataRef, getRaw: () => rawValue}
}

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

  const {dataRef, getRaw} = createTrackedProxy<Data>(cloneDeep(initialValue), (path, value) => {
    ledger.record(path, value)
    bumpLedger()
  })

  const isDirty = computed<boolean>(() => !ledgerRef.value.isEmpty())

  // Projections read the raw data, not the proxy: every mutation bumps ledgerRef
  // unconditionally, so the ledger dependency alone fully covers invalidation and
  // the Proxy-trap overhead of walking live data is skipped.
  const changedData = computed<DeepPartial<Data>>(() =>
    ledgerRef.value.projectDiff(getRaw()),
  )

  const loadData = (newValue: Data) => {
    dataRef.value = cloneDeep(newValue)
    ledger.clear()
    bumpLedger()
  }

  const reset = () => {
    dataRef.value = ledger.applyReverse(getRaw())
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
