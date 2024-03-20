import {computed, ComputedRef, ref, Ref, ShallowRef, shallowRef, triggerRef} from 'vue'
import {TrackedInstance, useTrackedInstance} from './tracked-instance'

export interface CollectionItem<Item, Meta> {
  instance: TrackedInstance<Item>
  meta: Meta
  isRemoved: Ref<boolean>
  isNew: Ref<boolean>
}

export interface Collection<Item, Meta> {
  items: ShallowRef<CollectionItem<Item, Meta>[]>
  isDirty: ComputedRef<boolean>
  add: (item: Item, afterIndex?: number) => CollectionItem<Item, Meta>
  remove: (index: number, isHardRemove?: boolean) => void
  loadData: (items: Item[]) => void
  reset: () => void
}

export const useCollection = <Item = any, Meta = any>(
  createItemMeta: (instance: TrackedInstance<Item>) => Meta = () => undefined as Meta
): Collection<Item, Meta> => {
  const items = shallowRef<CollectionItem<Item, Meta>[]>([])

  const isDirty = computed(() =>
    items.value.some(({instance, isRemoved, isNew}) => instance.isDirty.value || isNew.value || isRemoved.value)
  )

  const createItem = (item: Item, isNew: boolean): CollectionItem<Item, Meta> => {
    const instance = useTrackedInstance<Item>(item)
    return {
      isRemoved: ref(false),
      isNew: ref(isNew),
      instance,
      meta: createItemMeta(instance)
    }
  }

  const add = (item: Item, index: number = items.value.length) => {
    const newItem = createItem(item, true)
    items.value.splice(index, 0, newItem)
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
    items.value = loadedItems.map(item => createItem(item, false))
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
