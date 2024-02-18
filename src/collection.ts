import {computed, shallowRef, triggerRef, ShallowRef, ComputedRef, ref, Ref} from 'vue'
import {TrackedInstance, useTrackedInstance} from './tracked-instance'

export interface CollectionItem<Item extends Record<string, any>, Meta = Record<string, any>> {
  instance: TrackedInstance<Item>
  meta: Meta
  isRemoved: Ref<boolean>
  isNew: Ref<boolean>
}

export interface Collection<Item extends Record<string, any>, Meta = Record<string, any>> {
  items: ShallowRef<CollectionItem<Item, Meta>[]>
  isDirty: ComputedRef<boolean>
  add: (item: Partial<Item>, afterIndex?: number) => CollectionItem<Item, Meta>
  remove: (index: number, isHardRemove?: boolean) => void
  loadData: (items: Item[]) => void
  reset: () => void
}

export const useCollection = <Item extends Record<string, any>, Meta = Record<string, any>>(
  createItemMeta: (instance: TrackedInstance<Item>) => Meta = () => ({}) as Meta
): Collection<Item, Meta> => {
  const items = shallowRef<CollectionItem<Item, Meta>[]>([])

  const isDirty = computed(() =>
    items.value.some(({instance, isRemoved, isNew}) => instance.isDirty.value || isNew.value || isRemoved.value)
  )

  const add = (item: Partial<Item>, afterIndex: number = items.value.length) => {
    const instance = useTrackedInstance<Item>(item)
    const newItem = {
      isRemoved: ref(false),
      isNew: ref(true),
      instance,
      meta: createItemMeta(instance)
    } as CollectionItem<Item, Meta>
    items.value.splice(afterIndex, 0, newItem)
    triggerRef(items)
    return newItem
  }

  const remove = (index: number, isHardRemove = false) => {
    const item = items.value[index]
    if (item.isNew.value || isHardRemove) {
      items.value.splice(index, 1)
      triggerRef(items)
    } else {
      items.value[index].isRemoved.value = true
    }
  }

  const loadData = (loadedItems: Item[]) => {
    items.value = loadedItems.map((item) => {
      const instance = useTrackedInstance<Item>(item)
      return {
        isNew: ref(false),
        isRemoved: ref(false),
        instance,
        meta: createItemMeta(instance)
      } as CollectionItem<Item, Meta>
    })
    triggerRef(items)
  }

  const reset = () => {
    items.value = items.value.filter(({isNew}) => !isNew.value)
    for (const item of items.value) {
      item.isRemoved.value = false
      item.instance.reset()
    }
    triggerRef(items)
  }

  return {
    items,
    isDirty,
    add,
    remove,
    loadData,
    reset
  }
}
