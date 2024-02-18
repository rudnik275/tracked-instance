import {get, has, set, unset} from 'lodash-es'
import {computed, customRef, Ref} from 'vue'

type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T

export interface TrackedInstance<Data extends Record<string, any>> {
  data: Ref<Data>
  isDirty: Ref<boolean>
  changedData: Ref<DeepPartial<Data>>
  loadData: (newData: DeepPartial<Data>) => void
  reset: () => void
}

interface NestedProxyPathItem {
  target: Record<string, any>
  property: string
  receiver?: Record<string, any>
}

const isObject = (value: unknown) =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !(value instanceof File) &&
  !(value instanceof Map) &&
  !(value instanceof Set)

const isEmpty = (value: object) => Object.keys(value).length === 0

const iterateObject = function* (
  source: Record<string, any>,
  params: {
    // define condition when need to go deep
    goDeepCondition?: (path: string[], value: any) => boolean
    // include parent into separate step when we go deep
    includeParent?: boolean
  } = {}
) {
  const {goDeepCondition = (_, value) => isObject(value), includeParent = false} = params
  const iterateObjectDeep = function* (path: string[], obj: Record<string, any>): Generator<[string[], any]> {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path.concat(key)
      if (goDeepCondition(currentPath, value)) {
        if (includeParent) {
          yield [currentPath, value]
        }
        yield* iterateObjectDeep(currentPath, value)
      } else {
        yield [currentPath, value]
      }
    }
  }

  yield* iterateObjectDeep([], source)
}

const createNestedRef = <Source extends Record<string, any>>(
  source: Source,
  handler: (path: NestedProxyPathItem[]) => ProxyHandler<Source>
) =>
  customRef<Source>((track, trigger) => {
    // make nested objects and arrays is reactive
    const createProxy = <InnerSource extends Record<string, any>>(
      source: InnerSource,
      path: NestedProxyPathItem[] = []
    ): InnerSource => {
      const currentProxyHandler = handler(path) as unknown as ProxyHandler<InnerSource>
      return new Proxy(source, {
        ...currentProxyHandler,
        get(target, property: string, receiver) {
          track()
          const result = currentProxyHandler.get
            ? currentProxyHandler.get(target, property, receiver)
            : Reflect.get(target, property, receiver)

          if (isObject(result) || Array.isArray(result)) {
            return createProxy(result, path.concat({target, property, receiver}))
          }
          return result
        },
        set(target, property, value, receiver) {
          const result = currentProxyHandler.set
            ? currentProxyHandler.set(target, property, value, receiver)
            : Reflect.set(target, property, value, receiver)
          trigger()
          return result
        },
        deleteProperty(target, property) {
          const result = currentProxyHandler.deleteProperty
            ? currentProxyHandler.deleteProperty(target, property)
            : Reflect.deleteProperty(target, property)
          trigger()
          return result
        }
      } as ProxyHandler<InnerSource>)
    }

    let value = createProxy(source)

    return {
      get() {
        track()
        return value
      },
      set(newValue: Source) {
        value = createProxy(newValue)
        trigger()
      }
    }
  })

// array values in originalData should store in default object to avoid removing items on change length
class ArrayInOriginalData {
  length: number

  constructor(length: number) {
    this.length = length
    // length should not include in iterations
    Object.defineProperty(this, 'length', {
      enumerable: false,
      value: length
    })
  }
}

const setOriginalDataValue = (originalData: Record<string, any>, path: Omit<NestedProxyPathItem, 'receiver'>[]) => {
  let originalDataTarget = originalData
  for (const {target: oldValueParent, property} of path.slice(0, -1)) {
    if (property in originalDataTarget) {
      if (isObject(originalDataTarget[property]) || originalDataTarget[property] instanceof ArrayInOriginalData) {
        originalDataTarget = originalDataTarget[property]
      } else {
        // cancel set originalData value because in this case we try to replace primitive value by object or array value
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

const snapshotValueToOriginalData = (
  originalData: Record<string, any>,
  path: Omit<NestedProxyPathItem, 'receiver'>[],
  value: any
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
        undefined
      )
    }
  }

  const lastPathItem = path.at(-1)!
  const oldValue = lastPathItem.target[lastPathItem.property]
  if (isObject(value) && (isObject(valueInOriginalData) || isObject(oldValue))) {
    // if value includes in oldValue or originalData need mark removed fields as undefined and recursively run nested objects
    markRemovedFieldsAsUndefined(valueInOriginalData, oldValue)
    for (const key of Object.keys(value)) {
      snapshotValueToOriginalData(originalData, path.concat({target: oldValue || value, property: key}), value[key])
    }
  } else if (Array.isArray(value) && (valueInOriginalData instanceof ArrayInOriginalData || Array.isArray(oldValue))) {
    // do same for arrays
    markRemovedFieldsAsUndefined(valueInOriginalData, oldValue)
    for (const key of value.keys()) {
      snapshotValueToOriginalData(
        originalData,
        path.concat({target: oldValue || value, property: key.toString()}),
        value[key]
      )
    }
  } else {
    // in case value is plain then store it into originalData
    if (!has(originalData, pathAsString)) {
      if (oldValue !== value) {
        setOriginalDataValue(originalData, path)
      }
    } else if (valueInOriginalData === value) {
      unset(originalData, pathAsString)
    }
  }
}

export const useTrackedInstance = <Data extends Record<string, any>>(
  initialData: Partial<Data>
): TrackedInstance<Data> => {
  type InternalData = { root: Data }
  const _originalData = createNestedRef<DeepPartial<InternalData>>({}, (path) => ({
    deleteProperty(target, property) {
      const result = Reflect.deleteProperty(target, property)
      if (path.length) {
        const parent = path.at(-1)!
        if (isEmpty(target)) {
          delete parent.receiver![parent.property]
        }
      }
      return result
    }
  }))

  const _data = createNestedRef<InternalData>({root: initialData} as InternalData, (parentThree) => ({
    set(target, property: string, value, receiver) {
      const path = parentThree.concat({target, property, receiver})
      const oldValue = target[property as keyof typeof target]

      const triggerChangingArrayItems = () => {
        // in case length in array has changed then emit changing of value by index
        const originalDataValue = get(
          _originalData.value,
          path.map((i) => i.property)
        ) as ArrayInOriginalData | undefined

        const {length: originalDataLength} = originalDataValue || oldValue

        if (value < originalDataLength) {
          // when removed new value
          for (let i = value; i < originalDataLength; i++) {
            delete receiver[i]
          }
        } else if (originalDataLength < value) {
          // store all removed values as "undefined" when this array values was in data before do some change
          for (let i = originalDataLength; i < value; i++) {
            receiver[i] = undefined
          }
        }
      }

      if (Array.isArray(target) && property === 'length') {
        if (value !== oldValue) {
          triggerChangingArrayItems()
        }
      } else {
        snapshotValueToOriginalData(_originalData.value, path, value)
      }

      return Reflect.set(target, property, value, receiver)
    },
    deleteProperty(target, property: keyof typeof target) {
      setOriginalDataValue(_originalData.value, parentThree.concat({target, property} as NestedProxyPathItem))
      return Reflect.deleteProperty(target, property)
    }
  }))

  const data = computed<Data>({
    get: () => _data.value.root,
    set: (value) => (_data.value.root = value)
  })

  const isDirty = computed<boolean>(() => Object.keys(_originalData.value).length > 0)

  const _changedData = computed<DeepPartial<InternalData>>(() => {
    const changedData = {} as DeepPartial<InternalData>
    const originalDataIterator = iterateObject(_originalData.value, {
      goDeepCondition: (path, value) => {
        /*
         * iterate over originalData
         * but avoid going deep in case
         * when value in data have different data type
         * of same value in originalData
         */
        const valueInData = get(_data.value, path)
        const isBothValuesAsArray = value instanceof ArrayInOriginalData && Array.isArray(valueInData)
        const isBothValuesAsObject = isObject(value) && isObject(valueInData)
        return isBothValuesAsObject || isBothValuesAsArray
      }
    })
    for (const [path] of originalDataIterator) {
      const valueInData = get(_data.value, path)
      set(changedData, path, valueInData)
    }
    return changedData
  })

  const changedData = computed(() => _changedData.value.root as DeepPartial<Data>)

  const loadData = (newData: DeepPartial<Data>) => {
    _data.value = {root: newData} as InternalData
    _originalData.value = {}
  }

  const reset = () => {
    const updatedData = JSON.parse(JSON.stringify(_data.value))

    // iterate over originalData including objects to check array values
    for (const [path, value] of iterateObject(_originalData.value, {includeParent: true})) {
      if (value instanceof ArrayInOriginalData) {
        // reset array length in data to remove new items
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
    reset
  }
}
