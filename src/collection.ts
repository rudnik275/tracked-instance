import {computed, ComputedRef, markRaw, Raw, Ref, ref} from 'vue'
import {TrackedInstance, TrackedInstanceOptions, useTrackedInstance} from './tracked-instance'

export type CollectionItem<Item, Meta = undefined> = Raw<{
  instance: TrackedInstance<Item>
  /** Arbitrary metadata attached to this item, produced by CollectionOptions.createItemMeta. */
  meta: Meta
  /** True when the item has been soft-deleted via remove(). */
  isRemoved: Ref<boolean>
  /** True for items added via add() after the last loadData() call. */
  isNew: Ref<boolean>
  /** Removes this item from the collection. Shortcut for calling collection.remove(index). */
  remove: (isHardRemoved?: boolean) => void
}>

export interface Collection<Item, Meta = undefined> {
  items: Ref<CollectionItem<Item, Meta>[]>
  /** True when any item is modified, newly added, or soft-deleted. */
  isDirty: ComputedRef<boolean>
  /** Adds an item to the collection. Inserts at the end by default; pass `index` to insert elsewhere. */
  add: (item: Item, index?: number) => CollectionItem<Item, Meta>
  /** Soft-deletes an item by index (sets isRemoved). Pass isHardRemove=true to splice immediately. */
  remove: (index: number, isHardRemove?: boolean) => void
  /** Replaces all items and clears the dirty state. The loaded items become the new baseline. */
  loadData: (items: Item[]) => void
  /** Reverts all changes: drops new items, restores removed items, resets modified fields. */
  reset: () => void
}

export interface CollectionOptions<Item, Meta = undefined> extends TrackedInstanceOptions {
  /**
   * Factory called when a collection item is created (via loadData or add).
   * Use it to attach arbitrary metadata to each item — UI flags, sub-forms, derived state —
   * that lives alongside the tracked instance but is not part of the tracked data.
   * Receives the newly created TrackedInstance so the meta can reference reactive instance fields.
   */
  createItemMeta?: (instance: TrackedInstance<Item>) => Meta
}

/**
 * Creates a reactive collection of TrackedInstance items.
 *
 * Tracks additions, removals, and field-level modifications across all items.
 * Each item is wrapped with markRaw to prevent Vue from making the collection item
 * itself deeply reactive — only instance.data, isRemoved, and isNew carry reactivity.
 */
export const useCollection = <Item = any, Meta = undefined>(
  options?: CollectionOptions<Item, Meta>,
): Collection<Item, Meta> => {
  const {
    createItemMeta = () => undefined as Meta,
    ...instanceOptions
  } = options ?? {} as CollectionOptions<Item, Meta>
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
    const instance = useTrackedInstance<Item>(item, instanceOptions as TrackedInstanceOptions)
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
