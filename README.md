# tracked-instance

<a href="https://www.npmjs.com/package/tracked-instance"><img src="https://img.shields.io/npm/v/tracked-instance.svg?sanitize=true" alt="Version"></a>

> Track form changes in Vue 3 and send only modified fields to the backend — no more diffing payloads by hand.

```js
const {data, changedData, isDirty} = useTrackedInstance({name: 'Jack', age: 30})

data.value.name = 'John'

changedData.value  // { name: 'John' }   ← only what changed
isDirty.value      // true

data.value.name = 'Jack'  // revert
changedData.value  // undefined           ← back to clean
isDirty.value      // false
```

## Install

```bash
npm i tracked-instance
```

Supports **Vue 3** only.

---

## useTrackedInstance &nbsp;·&nbsp; [▶ Try on playground](https://play.vuejs.org/#eNqtVttuGzcQ/ZWpglYyoJuV1AnWstI29kPS1jFivxTQC3eXq2XEJQmSK1mQDeQPArQFigIF+tZvKFCgH+MfaD+hQ+5FK8WXFg1sCEvOkHPOcOaQ69aXSvUXOW0FrbGJNFMWDLW5Ak7E7GjasmbamkwFy5TUFtagaQLXkGiZQRuXtRum3NALTaI5jV8KY4mIaO1pi/keKw24bCrsSlH4Vi4YhSNYTwUAiwMQeRZS7UaWWU4DMFYzMXMTK0p05QBX+MG5X2XO8pAzk1JcHkrJKcHdAWKmaWQlLvGbAwiSbe13PRX4PxWRRFhIICaWdCFKkTmNj/2AmWOm7aoLXJJySlNMEDI7uoXw2NOZdGo2+90Gk3bbjyoanPvhFvyEcEP9dAN9Cbzdhms0Xe85zBWeu0JdpBSOiZ7D14LNUtuMPBoOn30Y2er8zsAvUs2MlSrFvJ9KrIwmkiJ7zJyTBeYV04Il0vE80FwYOTH2nAp7RlYOd+EzfkMjqeNxcR5dyMVcyKWYlCc76bjfRgRDFq5QiFmJCDp7cDQpi6aM3F8QnjsPx8QZdqLW9lfnr0/7imhDO/6zAMCSVadx9IX3HsYHIEvCLAi6hDOsZobrtIuOZXDBMipz29FdeDYcFt71ybhyKre5FafPkS/B8aBoPWw0HFiaKU4sxRHAOGYLLNkVp9iMMTNoWQUJp5eHMCMqGD1R+JVIYXsJyRhfBYYI0zNUs+QQFIljjBjsH6hL38ZFH2zt6fYK9r3V2dCaPp6cxEg4c7U8HuCwWohGTkLKJxeuysahrhehhQmVW1j0MhlT7sA6+r4cpy1wve7UhF5aHFWxlyy2abA/HH6Kk4MNgkERxQUoguyE/w7r+L7o/UIjKhCu7DcYSoH5/yhQGXyj/Js8VE3Vdx310fPxUPRGo29iRymN5qHEwmiEAth4Phw9zK2VAr6IOIvmuKWXRtwvwEIlIacxzn1SSihW2M3Pf/z1+3t447zGg2JxHfkzERp1eOfWrvvv2BmururmatQxwHq9kaXn0C6+bt791gbUtL9//f5PwClaCr5BTcNWrDhvoRsPsGP+Q/tsIJxbbOQdbuhjFBEQVHusIZLcCW5FCME+ogdP6WjkoT4aPSX0YIgAt+iVBOslNz+9RxF1iYo3nHD5zS8/ePGMmwwdKYeiUWTbjR5OGmqI+ZjAzbsfYZkSCzNqDaqfsGAlWLxoUG4WVAf1WqVxriQX4gU50zIXcfAo+dz9NXRp5NQrxFuA6p4mMctNgFJ1CBkTvZS6iys4GHrtQqoNPPAc+XaEtKk729Kw5/iNBxi8yaNSU+wJliCenVthK6NI+hs0F9xU4RA47g2Xu7hRkpBk/0FuBZXdC3GDuzqMrUtguwKr7y2nVrdVPMR6GVH9t0YKfNH5+3FaGvAhV7+EUHl2XmTOOG2l1ioTDAa5UPNZP5LZ4EO/6uWEEa3Bqzlhs514uE4xTvVrZRle3VtxCedy+crP1S8Ov8ap0S3zbw2mzEE7c+KCZTZt1TZLNJZiYT45P/VaWhtRAHN39dxjRCGSPHcYC7ev8CARdsPPo33p04dnemFOLi0VpiJVPTTcW8h543v4xT3UN3Af95/UWbz+B3cQyP8=)

Track changes to a single object, primitive, or array.

```js
import {useTrackedInstance} from 'tracked-instance'

const {data, changedData, isDirty, loadData, reset} = useTrackedInstance({
  name: 'Jack',
  isActive: false,
})
```

**Mutate `data.value` directly** — `changedData` and `isDirty` update automatically:

```js
data.value.name = 'John'
isDirty.value      // true
changedData.value  // { name: 'John' }

// Revert to original value → field disappears from changedData
data.value.name = 'Jack'
isDirty.value      // false
changedData.value  // undefined
```

**`reset()`** — revert all changes back to the last loaded baseline:

```js
data.value.name = 'John'
reset()
data.value  // { name: 'Jack', isActive: false }
```

**`loadData(newData)`** — replace data without marking anything dirty (use after a successful save):

```js
loadData({name: 'Joe', isActive: true})
isDirty.value  // false  ← Joe is now the new baseline
```

Works with primitives and arrays too:

```js
useTrackedInstance(false)
useTrackedInstance([1, 2, 3])
```

### Custom equality with `equals`

By default values are compared with `===`. Override this for edge cases — for example when a UI component writes `null`
but the backend sends `""`:

```js
const {data, isDirty} = useTrackedInstance(
  {comment: null},
  {equals: (a, b) => (a ?? '') === (b ?? '')}
)

data.value.comment = ''     // treated as equal to null
isDirty.value               // false

data.value.comment = 'hi'
isDirty.value               // true
```

---

## useCollection &nbsp;·&nbsp; [▶ Try on playground](https://play.vuejs.org/#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)

Track an array of items — add, remove, modify, and reset the whole list.

```js
import {useCollection} from 'tracked-instance'

const {items, isDirty, add, remove, loadData, reset} = useCollection()

loadData([{name: 'Jack'}, {name: 'John'}, {name: 'Joe'}])
```

Each item in `items` is a `CollectionItem` with its own `TrackedInstance`:

```js
items.value[0].instance.data.value.name = 'Stepan'
isDirty.value  // true
```

**`add(item, index?)`** — add a new item (marked `isNew: true`):

```js
const newItem = add({name: 'Taras'})
// newItem.isNew.value === true
// newItem.isRemoved.value === false

add({name: 'Taras'}, 0)  // insert at position 0
```

**`remove(index, isHardRemove?)`** — soft-delete by default, hard-delete with `true`:

```js
remove(0)        // soft remove: isRemoved = true, item stays in array
remove(0, true)  // hard remove: spliced out immediately
```

Soft-removed items can be restored with `reset()` or by setting `isRemoved.value = false` manually.

**`reset()`** — removes new items, restores soft-removed ones, reverts all changes:

```js
reset()
```

### Item meta

Attach computed or reactive metadata to each item via a factory function:

```js
const {add, items} = useCollection(instance => ({
  isValidName: computed(() => instance.data.value.name.length > 0)
}))

add({name: ''})
items.value[0].meta.isValidName.value  // false
```

The same `options` (including `equals`) are forwarded to every `TrackedInstance` in the collection:

```js
const {items} = useCollection(
  () => undefined,
  {equals: (a, b) => (a ?? '') === (b ?? '')}
)
```

---

## API Reference

### useTrackedInstance(initialData?, options?)

```typescript
useTrackedInstance<Data>(initialData ? : Data, options ? : TrackedInstanceOptions)
:
TrackedInstance<Data>
```

| Option   | Type                                  | Description                                                |
|----------|---------------------------------------|------------------------------------------------------------|
| `equals` | `(a: unknown, b: unknown) => boolean` | Custom equality for primitive leaf values. Replaces `===`. |

| Return              | Type                     | Description                                                 |
|---------------------|--------------------------|-------------------------------------------------------------|
| `data`              | `Ref<Data>`              | Reactive reference to current data. Mutate directly.        |
| `changedData`       | `Ref<DeepPartial<Data>>` | Only modified fields. `undefined` when nothing has changed. |
| `isDirty`           | `Ref<boolean>`           | `true` when any field differs from the original.            |
| `loadData(newData)` | `void`                   | Replace data and clear dirty state (new baseline).          |
| `reset()`           | `void`                   | Revert all changes back to the last `loadData()` baseline.  |

### useCollection(createItemMeta?, options?)

```typescript
useCollection<Item, Meta>(
  createItemMeta ? : (instance: TrackedInstance<Item>) => Meta,
  options ? : TrackedInstanceOptions,
)
:
Collection<Item, Meta>
```

| Return                         | Type                    | Description                                                      |
|--------------------------------|-------------------------|------------------------------------------------------------------|
| `items`                        | `Ref<CollectionItem[]>` | Reactive array of collection items.                              |
| `isDirty`                      | `ComputedRef<boolean>`  | `true` if any item is dirty, new, or soft-removed.               |
| `add(item, index?)`            | `CollectionItem`        | Add a new item. Appended to end by default.                      |
| `remove(index, isHardRemove?)` | `void`                  | Soft-remove by default. Pass `true` to splice from array.        |
| `loadData(items)`              | `void`                  | Replace all items and clear dirty state.                         |
| `reset()`                      | `void`                  | Remove new items, restore soft-removed, reset all instance data. |

### CollectionItem

```typescript
interface CollectionItem<Item, Meta = undefined> {
  instance: TrackedInstance<Item>                 // tracked instance for this item
  isNew: Ref<boolean>                             // true for items added via add()
  isRemoved: Ref<boolean>                         // true after soft remove
  meta: Meta                                      // custom metadata from createItemMeta()
  remove(isHardRemove?: boolean): void            // shortcut to remove self
}
```
