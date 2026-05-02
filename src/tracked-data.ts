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

// ---------- ledger node protocol ----------

// Strategy: two thin classes sharing a `LedgerNode` discriminated union via a `kind` tag,
// disambiguated everywhere through the single `isLedgerNode` helper below.

/**
 * Container node in the Ledger that backs an object branch in the live data.
 *
 * Wraps a plain Record so entries() iterates only recorded children — leaves and
 * nested LedgerNodes — preserving the "sparse, only changed paths" Ledger invariant.
 */
class LedgerObjectNode {
  readonly kind = 'object' as const
  private readonly _entries: Record<string, LedgerNode | unknown> = {}

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

  entries(): IterableIterator<[string, LedgerNode | unknown]> {
    return Object.entries(this._entries)[Symbol.iterator]()
  }

  isEmpty(): boolean {
    return Object.keys(this._entries).length === 0
  }
}

/**
 * Container node in the Ledger that backs an array branch in the live data.
 *
 * Carries the Baseline `length` so applyReverse can restore it before scalar leaves
 * are written. Entries are recorded indices only (sparse), iterated as string keys
 * to keep the Path shape uniform with LedgerObjectNode.
 */
class LedgerArrayNode {
  readonly kind = 'array' as const
  length: number
  private readonly _entries: Record<string, LedgerNode | unknown> = {}

  constructor(length: number) {
    this.length = length
  }

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

  entries(): IterableIterator<[string, LedgerNode | unknown]> {
    return Object.entries(this._entries)[Symbol.iterator]()
  }

  isEmpty(): boolean {
    return Object.keys(this._entries).length === 0
  }
}

type LedgerNode = LedgerObjectNode | LedgerArrayNode

/**
 * The single disambiguation helper. Every recorder/walker that needs to tell
 * "is this a Ledger container or a recorded leaf value?" goes through this.
 */
const isLedgerNode = (value: unknown): value is LedgerNode =>
  value instanceof LedgerObjectNode || value instanceof LedgerArrayNode

/**
 * Wraps a wholesale-captured Baseline value as a LedgerNode tree so the projection
 * and reverse walkers can traverse it through the protocol. Primitives, Date, File,
 * Map, Set, and other atomic values are returned as-is.
 */
function captureAsLedgerNode(value: unknown): LedgerNode | unknown {
  if (Array.isArray(value)) {
    const node = new LedgerArrayNode(value.length)
    for (let i = 0; i < value.length; i++) {
      node.set(String(i), captureAsLedgerNode(value[i]))
    }
    return node
  }
  if (isObject(value)) {
    const node = new LedgerObjectNode()
    for (const [key, child] of Object.entries(value as Record<string, any>)) {
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

/**
 * Reads the value at `path` from the Ledger. Returns undefined if any
 * intermediate slot is missing or is a recorded leaf rather than a container.
 */
function getInLedger(root: LedgerNode, path: string[]): LedgerNode | unknown {
  let cur: LedgerNode | unknown = root
  for (const key of path) {
    if (!isLedgerNode(cur) || !cur.has(key)) return undefined
    cur = cur.get(key)
  }
  return cur
}

/**
 * Tests whether `path` resolves to a recorded entry inside the Ledger.
 */
function hasInLedger(root: LedgerNode, path: string[]): boolean {
  if (path.length === 0) return true
  let cur: LedgerNode = root
  for (let i = 0; i < path.length - 1; i++) {
    const next = cur.get(path[i])
    if (!isLedgerNode(next)) return false
    cur = next
  }
  return cur.has(path[path.length - 1]!)
}

/**
 * Removes the leaf at `path` and prunes any ancestor LedgerNode that becomes
 * empty as a result. Empty-container detection goes through node.isEmpty(),
 * which counts only recorded entries — never the array `length` field — so
 * a LedgerArrayNode with no surviving indices is treated as empty just like
 * the previous Object.keys-on-AID trick.
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
 * `length` (recorded on the LedgerArrayNode) before writing scalar leaves.
 */
function walkLedger(store: LedgerObjectNode, visitor: LedgerVisitor): void {
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
  private _store: LedgerObjectNode = new LedgerObjectNode()
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
          const node = new LedgerArrayNode(oldValueParent[property].length)
          target.set(property, node)
          target = node
        } else if (isObject(oldValueParent[property])) {
          const node = new LedgerObjectNode()
          target.set(property, node)
          target = node
        }
      }
    }

    const lastItem = path.at(-1)!
    target.set(lastItem.property, captureAsLedgerNode(lastItem.target[lastItem.property]))
  }

  /**
   * Removes a leaf and prunes any ancestor LedgerNode that becomes empty.
   *
   * node.isEmpty() counts only recorded entries — never the LedgerArrayNode
   * `length` field — so an array node with no surviving indices is treated as
   * empty and unset from its parent, matching the behavior of the previous
   * Object.keys-ignoring-non-enumerable-length approach.
   */
  private _unsetAndPrune(path: string[]): void {
    unsetInLedger(this._store, path)
  }

  /**
   * Records `undefined` for any keys present in `valueInStore` or `oldValue` but
   * absent from the incoming `value`, so that keys removed by an object/array
   * replacement land in the Ledger as deletions.
   */
  private _markMissingKeysAsRemoved(
    path: LedgerPath,
    value: Record<string, any>,
    valueInStore: LedgerNode | undefined,
    oldValue: Record<string, any> | undefined,
  ): void {
    const keysSet = new Set<string>()
    if (valueInStore) {
      for (const [key] of valueInStore.entries()) keysSet.add(key)
    }
    if (oldValue) for (const key of Object.keys(oldValue)) keysSet.add(key)
    const keys = Array.from(keysSet).filter((key) => !Object.keys(value).includes(key))
    for (const key of keys) {
      this._recordLeaf(
        path.concat({target: oldValue || value, property: key}),
        undefined,
      )
    }
  }

  /**
   * Handles a Proxy-trap event for an object value: marks removed keys as deleted,
   * then recurses into each present key.
   */
  private _recordObjectMutation(path: LedgerPath, value: Record<string, any>): void {
    const pathAsString = path.map((i) => i.property)
    const valueInStore = getInLedger(this._store, pathAsString)
    const valueInStoreNode = isLedgerNode(valueInStore) ? valueInStore : undefined
    const lastPathItem = path.at(-1)!
    const oldValue = lastPathItem.target[lastPathItem.property]
    this._markMissingKeysAsRemoved(path, value, valueInStoreNode, oldValue)
    for (const key of Object.keys(value)) {
      this.record(path.concat({target: oldValue || value, property: key}), value[key])
    }
  }

  /**
   * Handles a Proxy-trap event for an array value: marks removed indices as deleted,
   * then recurses into each present index.
   */
  private _recordArrayMutation(path: LedgerPath, value: any[]): void {
    const pathAsString = path.map((i) => i.property)
    const valueInStore = getInLedger(this._store, pathAsString)
    const valueInStoreNode = isLedgerNode(valueInStore) ? valueInStore : undefined
    const lastPathItem = path.at(-1)!
    const oldValue = lastPathItem.target[lastPathItem.property]
    this._markMissingKeysAsRemoved(path, value as unknown as Record<string, any>, valueInStoreNode, oldValue)
    for (const key of value.keys()) {
      this.record(path.concat({target: oldValue || value, property: key.toString()}), value[key])
    }
  }

  /**
   * Handles a Proxy-trap event for a primitive (leaf) value: either records the
   * Baseline value if the field is first touched, or clears it from the Ledger
   * if the current value matches the Baseline (field reverted to clean).
   */
  private _recordLeaf(path: LedgerPath, value: unknown): void {
    const pathAsString = path.map((i) => i.property)
    const valueInStore = getInLedger(this._store, pathAsString)
    const lastPathItem = path.at(-1)!
    const oldValue = lastPathItem.target[lastPathItem.property]
    const isEqual = this._equals ? this._equals(oldValue, value) : oldValue === value
    const isEqualToOriginal = this._equals ? this._equals(valueInStore, value) : valueInStore === value
    if (!hasInLedger(this._store, pathAsString)) {
      if (!isEqual) {
        this._setStoreValue(path)
      }
    } else if (isEqualToOriginal) {
      this._unsetAndPrune(pathAsString)
    }
  }

  /**
   * Single entry point called by the Proxy for every mutation. Inspects the
   * current value, the value-in-Ledger (a LedgerNode container, a captured
   * leaf-object/array, or a primitive leaf), and the old live value; dispatches
   * to the appropriate case so all three "shape" judgments stay in sync.
   */
  record(path: LedgerPath, value: unknown): void {
    const pathAsString = path.map((i) => i.property)
    const valueInStore = getInLedger(this._store, pathAsString)
    const lastPathItem = path.at(-1)!
    const oldValue = lastPathItem.target[lastPathItem.property]
    const storeKind = isLedgerNode(valueInStore) ? valueInStore.kind : undefined
    if (isObject(value) && (storeKind === 'object' || isObject(oldValue))) {
      this._recordObjectMutation(path, value as Record<string, any>)
    } else if (Array.isArray(value) && (storeKind === 'array' || Array.isArray(oldValue))) {
      this._recordArrayMutation(path, value as any[])
    } else {
      this._recordLeaf(path, value)
    }
  }

  isEmpty(): boolean {
    return this._store.isEmpty()
  }

  projectDiff<Data extends Record<string, any>>(liveData: Data): DeepPartial<Data> {
    const result = {} as DeepPartial<Data>
    walkLedger(this._store, {
      visitContainer(path, node): boolean {
        // Stop descent when the live data at this path has a different shape from
        // the recorded node (type-divergence). In that case yield the whole path
        // as a leaf so the caller sees the full replacement rather than a partial diff.
        const liveValue = getAtPath(liveData, path)
        const isBothObject = node.kind === 'object' && isObject(liveValue)
        const isBothArray = node.kind === 'array' && Array.isArray(liveValue)
        if (isBothObject || isBothArray) return true
        setAtPath(result as Record<string, any>, path, liveValue)
        return false
      },
      visitLeaf(path, _value): void {
        setAtPath(result as Record<string, any>, path, getAtPath(liveData, path))
      },
    })
    return result
  }

  applyReverse<Data>(liveData: Data): Data {
    const updatedData = cloneDeep(liveData)
    walkLedger(this._store, {
      visitContainer(path, node): boolean {
        // Restore array length before children are written (parent-before-children
        // ordering). If the field was type-changed to a non-array (e.g. hobbies went
        // from string[] to string), create a fresh array so child visits populate it
        // correctly instead of building a plain object with numeric string keys.
        if (node.kind === 'array') {
          const cur = getAtPath(updatedData as any, path)
          if (Array.isArray(cur)) {
            cur.length = node.length
          } else {
            const restored: unknown[] = []
            restored.length = node.length
            setAtPath(updatedData as Record<string, any>, path, restored)
          }
        }
        return true
      },
      visitLeaf(path, value): void {
        if (value === undefined) {
          unsetAtPath(updatedData as object, path)
        } else {
          setAtPath(updatedData as Record<string, any>, path, value)
        }
      },
    })
    return updatedData
  }

  clear(): void {
    this._store = new LedgerObjectNode()
  }
}

// ---------- tracked proxy ----------

/**
 * Wraps `initialData` in a deeply-Proxy'd Vue ref. Every mutation at any depth calls
 * `onMutation(path, value)` exactly once so the owner can record the change and drive
 * Vue reactivity in a single step.
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
  onMutation: (path: LedgerPath, value: unknown) => void,
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
            onMutation(path, value)
          }

          const result = Reflect.set(target, property, cloneDeep(value), receiver)
          trigger()
          return result
        },
        deleteProperty(target, property: string) {
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

  const dataRef = createTrackedProxy<Data>(cloneDeep(initialValue), (path, value) => {
    ledger.record(path, value)
    bumpLedger()
  })

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
