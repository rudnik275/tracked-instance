import {computed, Ref, shallowRef, triggerRef} from 'vue'
import {OriginalDataLedger} from './ledger'
import {cloneDeep, createNestedRef, DeepPartial, NestedProxyPathItem} from './utils'

export interface TrackedInstance<Data> {
  /** Reactive reference to the current (possibly modified) data. */
  data: Ref<Data>
  /** True when at least one field differs from the value at the last loadData() call. */
  isDirty: Ref<boolean>
  /** Partial object containing only the fields that have changed since the last loadData(). */
  changedData: Ref<DeepPartial<Data>>
  /** Replaces the current data and clears the dirty state. The new value becomes the new baseline. */
  loadData: (newData: Data) => void
  /** Reverts all changes, restoring data to the state at the last loadData() call. */
  reset: () => void
}

export interface TrackedInstanceOptions {
  /**
   * Custom equality function for comparing primitive values.
   * When provided, replaces the default strict equality (===) check.
   * Called only for primitive leaf values (strings, numbers, booleans, null, undefined).
   *
   * @example treat null and empty string as equal
   * equals: (a, b) => (a ?? '') === (b ?? '')
   */
  equals?: (a: unknown, b: unknown) => boolean
}

export function useTrackedInstance<Data = any>(value?: undefined, options?: TrackedInstanceOptions): TrackedInstance<Data | undefined>
export function useTrackedInstance<Data>(value: Data, options?: TrackedInstanceOptions): TrackedInstance<Data>

/**
 * Creates a reactive tracked instance for a single value or object.
 *
 * Wraps the initial value in `{ root: Data }` internally to support primitive root values
 * (numbers, strings, etc.) without special-casing the Proxy machinery. The `root` wrapper
 * is transparent — `data` and `changedData` always expose the unwrapped value.
 */
export function useTrackedInstance<Data>(
  initialData?: Data,
  options?: TrackedInstanceOptions,
): TrackedInstance<Data> {
  type InternalData = { root: Data }

  // Plain-JS ledger holds the sparse record of pre-change values.
  // shallowRef + triggerRef bridges its mutations to Vue's reactivity system.
  const ledger = new OriginalDataLedger(options)
  const ledgerRef = shallowRef(ledger)
  const bumpLedger = () => triggerRef(ledgerRef)

  // _data: the live, reactive copy of the user's data, wrapped in { root } to support
  // primitive root values (e.g. useTrackedInstance(42)).
  const _data = createNestedRef<InternalData>({root: cloneDeep(initialData)} as InternalData, (parentTree) => ({
    set(target, property: string, value, receiver) {
      const path = parentTree.concat({target, property, receiver})
      const oldValue = target[property as keyof typeof target]

      if (Array.isArray(target) && property === 'length') {
        // When an array's `length` is set directly (e.g. via splice or assignment),
        // emit synthetic per-index events on the live Proxy so the ledger's index
        // entries stay consistent with the new length:
        //   - Shrinking: delete indices that no longer exist
        //   - Growing: mark new indices as `undefined` (absent in the original)
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
        bumpLedger()
      }

      return Reflect.set(target, property, cloneDeep(value), receiver)
    },
    deleteProperty(target, property) {
      const path = parentTree.concat({target, property} as NestedProxyPathItem)
      ledger.record(path, undefined)
      bumpLedger()
      return Reflect.deleteProperty(target, property)
    },
  }))

  const data = computed<Data>({
    get: () => _data.value.root,
    set: (value) => (_data.value.root = value),
  })

  const isDirty = computed<boolean>(() => !ledgerRef.value.isEmpty())

  const changedData = computed<DeepPartial<Data>>(() => {
    const currentLedger = ledgerRef.value
    return currentLedger.projectDiff(_data.value).root as DeepPartial<Data>
  })

  const loadData = (newData: Data) => {
    _data.value = {root: cloneDeep(newData)} as InternalData
    ledger.clear()
    bumpLedger()
  }

  const reset = () => {
    _data.value = ledger.applyReverse(_data.value)
    ledger.clear()
    bumpLedger()
  }

  return {
    data,
    changedData,
    isDirty,
    loadData,
    reset,
  }
}
