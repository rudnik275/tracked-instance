import {customRef} from 'vue'

export type DeepPartial<Value> = Value extends object
  ? Value extends Array<infer ArrayValue>
    ? Array<DeepPartial<ArrayValue>>
    : { [Property in keyof Value]?: DeepPartial<Value[Property]> }
  : Value

export interface NestedProxyPathItem {
  target: Record<string, any>
  property: string
  receiver?: Record<string, any>
}

export const isObject = (value: unknown) =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !(value instanceof File) &&
  !(value instanceof Map) &&
  !(value instanceof Set)

export const isEmpty = (value: object) => Object.keys(value).length === 0

export const iterateObject = function* (
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

export const createNestedRef = <Source extends Record<string, any>>(
  source: Source,
  handler: <InnerSource extends Record<string, any>>(path: NestedProxyPathItem[]) => ProxyHandler<InnerSource>
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
