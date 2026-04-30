import {computed, Ref, shallowRef, triggerRef} from 'vue'
import {OriginalDataLedger} from './ledger'
import {createTrackedProxy} from './tracked-proxy'
import {cloneDeep, DeepPartial} from './utils'

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

  const ledger = new OriginalDataLedger(options)
  const ledgerRef = shallowRef(ledger)
  const bumpLedger = () => triggerRef(ledgerRef)

  const _data = createTrackedProxy<InternalData>(
    {root: cloneDeep(initialData)} as InternalData,
    ledger,
    bumpLedger,
  )

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
