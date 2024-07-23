import {computed, ComputedRef, markRaw, Raw, Ref, ref} from 'vue'
import {TrackedInstance, useTrackedInstance} from './tracked-instance'

export type CollectionItem<Item, Meta = undefined> = Raw<{
  instance: TrackedInstance<Item>
  meta: Meta
  isRemoved: Ref<boolean>
  isNew: Ref<boolean>
  remove: (isHardRemoved?: boolean) => void
}>

export interface Collection<Item, Meta = undefined> {
  items: Ref<CollectionItem<Item, Meta>[]>
  isDirty: ComputedRef<boolean>
  add: (item: Item, afterIndex?: number) => CollectionItem<Item, Meta>
  remove: (index: number, isHardRemove?: boolean) => void
  loadData: (items: Item[]) => void
  reset: () => void
}

export const useCollection = <Item = any, Meta = undefined>(
  createItemMeta: (instance: TrackedInstance<Item>) => Meta = () => undefined as Meta,
): Collection<Item, Meta> => {
  const items = ref<CollectionItem<Item, Meta>[]>([])

  const isDirty = computed(() =>
    items.value.some((
      {
        instance,
        isRemoved,
        isNew,
      },
    ) => instance.isDirty.value || isNew.value || isRemoved.value),
  )

  const createItem = (item: Item, isNew: boolean) => {
    const instance = useTrackedInstance<Item>(item)
    const collectionItem: CollectionItem<Item, Meta> = markRaw({
      isRemoved: ref(false),
      isNew: ref(isNew),
      instance,
      meta: createItemMeta(instance),
      remove: (isHardRemove = false) => {
        const index = items.value.indexOf(collectionItem)
        remove(index, isHardRemove)
      },
    })
    return collectionItem
  }

  const add = (item: Item, index: number = items.value.length) => {
    const newItem = createItem(item, true)
    items.value.splice(index, 0, newItem)
    return newItem
  }

  const remove = (index: number, isHardRemove = false) => {
    const item = items.value[index]
    if (item.isNew.value || isHardRemove) {
      items.value.splice(index, 1)
    } else {
      items.value[index].isRemoved.value = true
    }
  }

  const loadData = (loadedItems: Item[]) => {
    items.value = loadedItems.map(item => createItem(item, false))
  }

  const reset = () => {
    items.value = items.value.filter(({isNew}) => !isNew.value)
    for (const item of items.value) {
      item.isRemoved.value = false
      item.instance.reset()
    }
  }

  return {
    items,
    isDirty,
    add,
    remove,
    loadData,
    reset,
  }
}
