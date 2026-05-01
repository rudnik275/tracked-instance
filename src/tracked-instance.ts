import {computed, Ref} from 'vue'
import {createTrackedData} from './tracked-data'
import {DeepPartial} from './utils'

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
 * Creates a reactive Tracked Instance for a single value or object.
 *
 * Wraps the initial value in `{ root: Data }` internally so the tracking machinery
 * can assume a Record-shaped root and primitive root values (numbers, strings, etc.)
 * still work without special-casing. The `root` wrapper is transparent — `data`
 * and `changedData` always expose the unwrapped value.
 */
export function useTrackedInstance<Data>(
  initialData?: Data,
  options?: TrackedInstanceOptions,
): TrackedInstance<Data> {
  type InternalData = { root: Data }

  const tracked = createTrackedData<InternalData>(
    {root: initialData} as InternalData,
    options,
  )

  const data = computed<Data>({
    get: () => tracked.dataRef.value.root,
    set: (value) => (tracked.dataRef.value.root = value),
  })

  const changedData = computed<DeepPartial<Data>>(
    () => tracked.changedData.value.root as DeepPartial<Data>,
  )

  const loadData = (newData: Data) => {
    tracked.loadData({root: newData} as InternalData)
  }

  return {
    data,
    isDirty: tracked.isDirty,
    changedData,
    loadData,
    reset: tracked.reset,
  }
}
