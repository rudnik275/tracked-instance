import {customRef} from 'vue'
import {cloneDeepWith} from 'lodash-es'

/**
 * Recursively makes all properties of T optional.
 * Arrays use element-level DeepPartial rather than making the array itself optional,
 * which allows sparse array diffs (e.g. only index 2 changed).
 */
export type DeepPartial<Value> = Value extends object
  ? Value extends Array<infer ArrayValue>
    ? Array<DeepPartial<ArrayValue>>
    : { [Property in keyof Value]?: DeepPartial<Value[Property]> }
  : Value

/**
 * Represents one segment in the path from the root proxy to the currently accessed node.
 * Accumulated as Proxy `get` traps are traversed, then passed to `set`/`deleteProperty`
 * handlers so they can reconstruct the full property path for _originalData bookkeeping.
 */
export interface NestedProxyPathItem {
  target: Record<string, any>
  property: string
  receiver?: Record<string, any>
}

/**
 * Returns true only for plain objects — intentionally excludes Array, Date, File, Map,
 * and Set so they are treated as atomic leaf values rather than being traversed.
 */
export const isObject = (value: unknown) =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !(value instanceof File) &&
  !(value instanceof Map) &&
  !(value instanceof Set)

/**
 * Depth-first generator that walks an object tree, yielding [path, value] pairs.
 *
 * By default it descends into plain objects (via isObject). Supply `goDeepCondition`
 * to override — e.g. to also descend into ArrayInOriginalData entries.
 * When `includeParent` is true, intermediate nodes are yielded before their children,
 * which is needed for reset() to handle ArrayInOriginalData length restoration.
 */
export const iterateObject = function* (
  source: Record<string, any>,
  params: {
    goDeepCondition?: (path: string[], value: any) => boolean
    includeParent?: boolean
  } = {},
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

/**
 * Creates a Vue customRef whose value is a deeply nested Proxy tree.
 *
 * Every nested object/array returned by a `get` is itself wrapped in a new Proxy,
 * so mutations at any depth trigger Vue's reactivity system via the root `track`/`trigger`
 * pair. The `handler` factory receives the full path from the root to the current node,
 * allowing callers to intercept `set` and `deleteProperty` with complete path context.
 */
export const createNestedRef = <Source extends Record<string, any>>(
  source: Source,
  handler: <InnerSource extends Record<string, any>>(path: NestedProxyPathItem[]) => ProxyHandler<InnerSource>,
) =>
  customRef<Source>((track, trigger) => {
    const createProxy = <InnerSource extends Record<string, any>>(
      source: InnerSource,
      path: NestedProxyPathItem[] = [],
    ): InnerSource => {
      const currentProxyHandler = handler(path) as unknown as ProxyHandler<InnerSource>
      return new Proxy(source, {
        ...currentProxyHandler,
        get(target, property: string, receiver) {
          track()
          const result = currentProxyHandler.get
            ? currentProxyHandler.get(target, property, receiver)
            : Reflect.get(target, property, receiver)

          // Wrap nested objects and arrays in their own Proxy so deep mutations
          // are also intercepted and the path is extended correctly.
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
        },
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
      },
    }
  })

/**
 * Deep-clones a value while preserving special types:
 * - Date → new Date instance with the same timestamp
 * - File → same reference (Files are immutable browser objects and cannot be meaningfully cloned)
 * All other types delegate to lodash cloneDeepWith for recursive cloning.
 */
export const cloneDeep = (inputValue: any) => cloneDeepWith(inputValue, (value) => {
  if (value instanceof Date) {
    return new Date(value.getTime())
  }
  if (value instanceof File) {
    return value
  }
})