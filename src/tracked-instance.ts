import {get, has, set, unset} from 'lodash-es'
import {computed, Ref} from 'vue'
import {cloneDeep, createNestedRef, DeepPartial, isEmpty, isObject, iterateObject, NestedProxyPathItem} from './utils'

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

/**
 * Sentinel class used to represent arrays inside _originalData.
 *
 * We cannot store plain arrays in _originalData because:
 *   1. Lodash's `get`/`set`/`has` treat numeric-keyed paths as array indices and
 *      would reconstruct plain arrays automatically, conflicting with our sparse index tracking.
 *   2. A Proxy `set` trap on arrays fires for both index assignments *and* the implicit
 *      `length` update — storing a plain array would conflate the two events.
 *
 * Instead, ArrayInOriginalData is a plain object whose enumerable keys are individual
 * array indices. `length` is stored as a non-enumerable property so that iterateObject
 * skips it while still allowing triggerChangingArrayItems() to read the original length.
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

/**
 * Writes the *current* value at `path` into `originalData`, creating intermediate
 * container nodes (plain objects or ArrayInOriginalData) as needed.
 *
 * Bails out early when an intermediate node in originalData is already a primitive —
 * this happens when a field was previously changed from an object to a scalar, meaning
 * the whole subtree is already captured at a higher level and should not be overwritten.
 */
const setOriginalDataValue = (originalData: Record<string, any>, path: Omit<NestedProxyPathItem, 'receiver'>[]) => {
  let originalDataTarget = originalData
  for (const {target: oldValueParent, property} of path.slice(0, -1)) {
    if (property in originalDataTarget) {
      if (isObject(originalDataTarget[property]) || originalDataTarget[property] instanceof ArrayInOriginalData) {
        originalDataTarget = originalDataTarget[property]
      } else {
        return
      }
    } else {
      if (Array.isArray(oldValueParent[property])) {
        originalDataTarget = originalDataTarget[property] = new ArrayInOriginalData(oldValueParent[property].length)
      } else if (isObject(oldValueParent[property])) {
        originalDataTarget = originalDataTarget[property] = {}
      }
    }
  }

  const lastItem = path.at(-1)!
  originalDataTarget[lastItem.property] = lastItem.target[lastItem.property]
}

/**
 * Core bookkeeping function called on every `set` and `deleteProperty`.
 *
 * Ensures _originalData contains the *first* observed value for each modified path
 * so subsequent writes can be compared against the true baseline. When a field returns
 * to its original value the entry is removed from _originalData, keeping the structure
 * sparse and isDirty accurate.
 *
 * Algorithm:
 *   - Primitive value:
 *       • Not yet in _originalData and value changed  → snapshot original (pre-change) value
 *       • Already in _originalData and value equals original → unset (field is clean again)
 *   - Object / Array:
 *       • Marks keys present in the old value or _originalData but absent in the new value
 *         as `undefined` so they appear in changedData as explicit deletions.
 *       • Recurses into each key of the new value.
 *
 * The optional `equals` function overrides strict equality (===) for primitive comparisons,
 * allowing callers to treat semantically equivalent values (e.g. null vs "") as unchanged.
 */
const snapshotValueToOriginalData = (
  originalData: Record<string, any>,
  path: Omit<NestedProxyPathItem, 'receiver'>[],
  value: any,
  equals?: TrackedInstanceOptions['equals'],
) => {
  const pathAsString = path.map((i) => i.property)
  const valueInOriginalData = get(originalData, pathAsString)

  const markRemovedFieldsAsUndefined = (valueInOriginalData?: Record<string, any>, oldValue?: Record<string, any>) => {
    const keysSet = new Set<string>()
    if (valueInOriginalData) {
      for (const key of Object.keys(valueInOriginalData)) {
        keysSet.add(key)
      }
    }
    if (oldValue) {
      for (const key of Object.keys(oldValue)) {
        keysSet.add(key)
      }
    }
    const keys = Array.from(keysSet).filter((key) => !Object.keys(value).includes(key))
    for (const key of keys) {
      snapshotValueToOriginalData(
        originalData,
        path.concat({target: oldValue || value, property: key} as Omit<NestedProxyPathItem, 'receiver'>),
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
      snapshotValueToOriginalData(originalData, path.concat({target: oldValue || value, property: key}), value[key], equals)
    }
  } else if (Array.isArray(value) && (valueInOriginalData instanceof ArrayInOriginalData || Array.isArray(oldValue))) {
    markRemovedFieldsAsUndefined(valueInOriginalData, oldValue)
    for (const key of value.keys()) {
      snapshotValueToOriginalData(
        originalData,
        path.concat({target: oldValue || value, property: key.toString()}),
        value[key],
        equals,
      )
    }
  } else {
    const isEqual = equals ? equals(oldValue, value) : oldValue === value
    const isEqualToOriginal = equals ? equals(valueInOriginalData, value) : valueInOriginalData === value
    if (!has(originalData, pathAsString)) {
      if (!isEqual) {
        setOriginalDataValue(originalData, path)
      }
    } else if (isEqualToOriginal) {
      unset(originalData, pathAsString)
    }
  }
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
  const {equals} = options ?? {}
  type InternalData = { root: Data }

  // _originalData: sparse record of pre-change values, keyed by the same paths as _data.
  // Only contains fields that have been modified; absence means "no change at this path".
  const _originalData = createNestedRef<DeepPartial<InternalData>>({}, (path) => ({
    deleteProperty(target, property) {
      const result = Reflect.deleteProperty(target, property)
      // Propagate upward: if an intermediate node becomes empty after deletion,
      // remove it too so that isDirty (Object.keys check) stays accurate.
      if (path.length) {
        const parent = path.at(-1)!
        if (isEmpty(target)) {
          delete parent.receiver![parent.property]
        }
      }
      return result
    },
  }))

  // _data: the live, reactive copy of the user's data, wrapped in { root } to support
  // primitive root values (e.g. useTrackedInstance(42)).
  const _data = createNestedRef<InternalData>({root: cloneDeep(initialData)} as InternalData, (parentThree) => ({
    set(target, property: string, value, receiver) {
      const path = parentThree.concat({target, property, receiver})
      const oldValue = target[property as keyof typeof target]

      const triggerChangingArrayItems = () => {
        // When an array's `length` is set directly (e.g. via splice or assignment),
        // manually emit index-level change events so _originalData stays consistent:
        //   - Shrinking: delete indices that no longer exist in the receiver
        //   - Growing: mark new indices as `undefined` (they were absent in the original)
        const arrayInOriginalData = get(
          _originalData.value,
          path.map((i) => i.property),
        ) as ArrayInOriginalData | undefined

        const originalDataValue = arrayInOriginalData?.length || oldValue

        if (value < originalDataValue) {
          for (let i = value; i < originalDataValue; i++) {
            delete receiver[i]
          }
        } else if (originalDataValue < value) {
          for (let i = originalDataValue; i < value; i++) {
            receiver[i] = undefined
          }
        }
      }

      if (Array.isArray(target) && property === 'length') {
        if (value !== oldValue) {
          triggerChangingArrayItems()
        }
      } else {
        snapshotValueToOriginalData(_originalData.value, path, value, equals)
      }

      return Reflect.set(target, property, cloneDeep(value), receiver)
    },
    deleteProperty(target, property) {
      const path = parentThree.concat({target, property} as NestedProxyPathItem)
      snapshotValueToOriginalData(_originalData.value, path, undefined, equals)
      return Reflect.deleteProperty(target, property)
    },
  }))

  const data = computed<Data>({
    get: () => _data.value.root,
    set: (value) => (_data.value.root = value),
  })

  const isDirty = computed<boolean>(() => Object.keys(_originalData.value).length > 0)

  const _changedData = computed<DeepPartial<InternalData>>(() => {
    // Build changedData by reading current _data values for every path recorded in _originalData.
    // goDeepCondition stops descent when _originalData has an object/array node but _data has
    // a scalar at the same path (type-change scenario): the whole field is included as-is.
    const changedData = {} as DeepPartial<InternalData>
    const originalDataIterator = iterateObject(_originalData.value, {
      goDeepCondition: (path, value) => {
        const valueInData = get(_data.value, path)
        const isBothValuesAsArray = value instanceof ArrayInOriginalData && Array.isArray(valueInData)
        const isBothValuesAsObject = isObject(value) && isObject(valueInData)
        return isBothValuesAsObject || isBothValuesAsArray
      },
    })
    for (const [path] of originalDataIterator) {
      const valueInData = get(_data.value, path)
      set(changedData, path, valueInData)
    }
    return changedData
  })

  const changedData = computed(() => _changedData.value.root as DeepPartial<Data>)

  const loadData = (newData: Data) => {
    _data.value = {root: cloneDeep(newData)} as InternalData
    _originalData.value = {}
  }

  const reset = () => {
    const updatedData = cloneDeep(_data.value)

    for (const [path, value] of iterateObject(_originalData.value, {includeParent: true})) {
      if (value instanceof ArrayInOriginalData) {
        // Restore the original array length first so that excess elements are dropped
        // before individual index values are restored below.
        set(updatedData, path.concat('length'), value.length)
      } else if (!isObject(value)) {
        if (value === undefined) {
          unset(updatedData, path)
        } else {
          set(updatedData, path, value)
        }
      }
    }

    _data.value = updatedData
    _originalData.value = {}
  }

  return {
    data,
    changedData,
    isDirty,
    loadData,
    reset,
  }
}