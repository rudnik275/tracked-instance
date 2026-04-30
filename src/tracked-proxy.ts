import {customRef, Ref} from 'vue'
import {OriginalDataLedger} from './ledger'
import {cloneDeep, isObject} from './utils'

interface NestedProxyPathItem {
  target: Record<string, any>
  property: string
  receiver?: Record<string, any>
}

/**
 * Wraps `initialData` in a deeply-Proxy'd Vue ref. Every mutation at any depth is
 * recorded into `ledger`, then `onMutate` is called so the owner can drive Vue
 * reactivity (e.g. triggerRef on a shallowRef holding the ledger).
 *
 * Handles three responsibilities the composable shouldn't care about:
 *   - nested Proxy creation + path bookkeeping
 *   - `Array.length` synthesis: writes to an array's `length` don't fire individual
 *     index events through Proxy traps, so synthetic per-index `delete`/`set` events
 *     are emitted on the live receiver to keep ledger index entries consistent
 *   - cloneDeep on every write so stored values are detached from caller refs
 */
export const createTrackedProxy = <Data extends Record<string, any>>(
  initialData: Data,
  ledger: OriginalDataLedger,
  onMutate: () => void,
): Ref<Data> =>
  customRef<Data>((track, trigger) => {
    const createProxy = <Inner extends Record<string, any>>(
      source: Inner,
      parentTree: NestedProxyPathItem[] = [],
    ): Inner =>
      new Proxy(source, {
        get(target, property: string, receiver) {
          track()
          const result = Reflect.get(target, property, receiver)
          if (isObject(result) || Array.isArray(result)) {
            return createProxy(result, parentTree.concat({target, property, receiver}))
          }
          return result
        },
        set(target, property: string, value, receiver) {
          const path = parentTree.concat({target, property, receiver})
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
