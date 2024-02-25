# Tracked instance
<a href="https://www.npmjs.com/package/tracked-instance"><img src="https://img.shields.io/npm/v/tracked-instance.svg?sanitize=true" alt="Version"></a>

# 🚀 Features
- 🕶 Track what changed in your form
- 🌎 Send on backend only fields which changed
- 📦 Build multiple requests only for items that have been changed/removed/added
- 🦾 Type Strong: Written in TypeScript

# Description
Build large forms and send all requests in one take.
Combination of useTrackedInstance and useCollection can manage very large form with entities which deeply related each other.
You can control what data should be sent to the server so that only what has changed is sent.
Tracked instance is not so much about managing forms, but about building and optimizing queries.

#  Install
> npm i tracked-instance

# Support
Supports Vue 3.x only

# Usage

## Tracked instance

Track everything what was changed

```javascript
const {data, changedData, isDirty, loadData, reset} = useTrackedInstance({
  name: 'Jack',
  isActive: false
})
```
Do some changes and see only changed field in changedData.
Then set previous value and see what changedData is empty.
That guaranty what you always get real changes
```javascript
data.value.name = 'John'
console.log(isDirty.value) // true
console.log(changedData.value) // {name: 'John'}

data.value.name = 'Jack'
console.log(isDirty.value) // false
console.log(changedData.value) // undefined
```
Rollback initial value:
```javascript
data.value.name = 'John'
reset()
console.log(data.value) // { name: 'Jack', isActive: false }
console.log(isDirty.value) // false
console.log(changedData.value) // undefined
```
All changes should be replaced by new loaded data.
The data will be considered not dirty
```javascript
data.value.name = 'John'
data.value.isActive = true
loadData({
  name: 'Joe',
  isActive: false
})
console.log(isDirty.value) // false
console.log(data.value) // { name: 'Joe', isActive: false }
```

Can accept primitive values or arrays
```javascript
useTrackedInstance(false)
useTrackedInstance([1,2,3])
```

### Real-world example
[Try on playground](https://play.vuejs.org/#eNqNVc1u00AQfpXBl7RSapfCAVlJVGh7KEiloj36srEn8TbrtbU/aaMoz4DEjROvgYTEw/AC8AjM7tqpaarSm+d/vplv1uvobdPES4tRGo10rnhjQKOxzSSTvGpqZWBtNV4rli+wOJfaMJnjBmaqrmBggvqAt/pBJjOZ1yTBumCGDSEvmZxjceoFrk+5MqshKKQaQxA185YNjGG3yN46kwCGG4EpDAZDJ62QqRSkFcKLXF/aqeC6xCKFGRMavbpAw7jQKfgMAEkCuqytKGCKYBvqDOlzta3vvDaZ3Oy79sk5uACX3HAmwCGBW24ohYGKLRBmtaqgcFgy2SUJ7XJq5KVvomv8ukQ4ZWoBHySfl6aP4+jw8M0uDqPs4zCoIOampsBWASBZ5WqclIprUzclKrioBZMDh9l3qRHbJWgCBBK1A79kwqIOWQh5D37YnmZLPGmjxrC3D+NJKLpF64YS+zQURtGjJLCHeEOCwaoRNEOSAEYFX07a3VPv644HsNmMEmfzTqWCJHxNrTG1hONc8HwxziLPliya/Pr64/f3z/DJiaMkePlyFOOxHms7rbiJG4VLlIZCezgoQcA74rKxppvg8qCqCxTk6xH5rWVRZzWrBslk8I4aaMn0VJpY2mqKqsvm1ryTLLg8K12Xp8ePnXR5ifliWt/1Ez4jZUuuuCNV7Kj0X+Bt4jD7B75h+Pcp0oJrNhVYkO1Fu/LO2oIG+PPty0+4oi11JG0r3K/XCW673abLo0nYaOEPMx0lpPEWWvuE2NV7cjzDnNrxs8fJaBiFx+2gYk18o2tJz5/nd9YaiC7bM6MxPHjnnDGLSmManSaJlc1iHud1lez6dbdFFY2m25rx+YN6FNdwgepjYzjd3j91mRD17Xuv274KPsbt/BH9jSYauNYu3c2oJTWwtRmm5u6MnPns6sIvdmskaljH+yeMdHa1sK7H4PbOyoLa7vn5bs/9+LicX+uzO4NSd6Bco34a3j+L6J9z8gT0+3Zfxa+3U9z8BYQrOQM=)
```vue
<script setup>
  import {useTrackedInstance} from 'tracked-instance'

  const {data, changedData, isDirty, reset, loadData} = useTrackedInstance({
    title: '',
    year: null,
    isPublished: false,
    details: {
      // should be updated by loadData
    }
  })

  // update initial data without make form dirty
  loadData({
    id: 1,
    title: 'The Dark Knight',
    year: 2008,
    isPublished: true,
    details: {
      director: {
        name: 'Christopher Nolan' // form see changes in nested values
      }
    }
  })

  const saveChanges = () => {
    loadData(data.value)
  }
</script>

<template>
  <div>isDirty: {{ isDirty }}</div>
  <hr />
  <button @click="reset">♻️ Reset</button>

  <form @submit.prevent="saveChanges">
    <input
      v-model="data.title"
      type="text"
    />
    <input
      v-model.number="data.year"
      type="number"
    />
    <input
      v-model="data.isPublished"
      type="checkbox"
    />

    <input
      v-model="data.details.director.name"
      type="text"
    />

    <button
      type="submit"
      :disabled="!isDirty"
    >
      💾 Save changes
    </button>
  </form>

  <h2>Changed data:</h2>
  <pre>{{ changedData }}</pre>
</template>

```

## Collection

```javascript
const {isDirty, add, items, remove, reset, loadData} = useCollection()

loadData([{name: 'Jack'}, {name: 'John'}, {name: 'Joe'}])
```
Should be dirty on make some changes, remove or add item
```javascript
items.value[0].instance.data.value.name = 'Stepan'
console.log(isDirty.value) // true 
```
Add new item:
```javascript
const addedItem = add({name: 'Taras'})
console.log(addedItem) // {instance: TrackedInstance<{name: 'Taras'}>, isRemoved: false, isNew: true, meta: {}}}
```
Add new item in specific position:
```javascript
add({name: 'Taras'}, 0)
```

Item should be softly removed and can be reverted by reset()
```javascript
remove(0)
remove(0, true) // hard remove
```

Reset all changes including changing data on each item
```javascript
reset()
```

Item meta. Additional custom fields which can watch on item instance. 
If set then should be applied to each item which was added by add() or loadData()
```javascript
const {add, items} = useCollection(instance => ({
  isValidName: computed(() => instance.data.value.name.length > 0)
}))

add({name: ''})

console.log(items.value[0].meta.isValidName.value) // false
```

### Real-world example
[Try on playground](https://play.vuejs.org/#eNp9VcFy0zAQ/ZWtL3ZnUvsAp5BmKG0P9FCYFk6Yg2sriRpZ9khymk7G38DADMNwob/BDDN8DD9AP4GVZDuym3BJLO1q973dp9XGOynLcFURb+xNZCpoqUASVZXTmNO8LISCjSCzGmaiyMFHR39rqCQ5LRgjqaIFb12USNIlyY4olyrhqfaPeVrgCjZUnlGh7keQZNkIqCK5HIEgebEi+h8Tj4AVSXaWqKSGY+glCA51pNYcfNjwJCdj8C8wn1+PoFsXC95fE7/+aA5bGJzcvZdEXKIZcyC7wPcds0xW5HSR8DmRaA4O4XgKm5hDhyzQC7Dww1XCKmI3AMIZZYqIQJv0sQP9EVJ5ZShm1hlTNd55UgbG1+Swvk3VwgwTOf74U8d8EtkWYXNwgf4lSxTBFcDkplKqwG0deZxRmdwwkh3H3kFT9Niztpcpo+kSDQ5PazNxAB4fvvyGazRC2lh1+MjGd3NtQ5nWxd70z/dff39+giu97J9YCIgMavzO6GragBrDZgPNN9T1JNI2x80iOsky3TQtBzG2WxPKy0q1lVwd5UVGGCJxetsSBlD3JUGbImsEaTc1GBNnSAWVGTTKcWLVhy8GsvF9zffHVwNOA+vzdYlUrE3WdgwBzwqB2Uz38SbwjKwP8c+KCiO30CeMojOdmUbuEJPjOixKvzD71BVqrttS7SmXW7KdZbOXOLBEENTjw7fPqAO92StM73gfaY/kJblrCbpeXb4+HaM/nA+Or5MNwNWlg+IpMJPYinKAA9XZ9SRitO1o1L+Ekem1/my6ZBtqROvowDTVKsCMirbx7fwIqJ0IT0fHtt0dxj09dQEPu7VLSajpWcKkVlRbLhy9NzhcB3Xq6DdsezXwRp59HY5wuIW3suD4sJjpiVmNAdWNBbahUGSD10IbY2+hVCnHUVTxcjkP0yKPnvrpCMiwxoxK4uSe0fkgH54rKSPiTamfj37ehLHi7sLsKVGRUbufLki63LF/K9cW2lutNbFCAJ1NJWKux582n19fmmvTGfH+VayhtceIsixYpTFat1cVzxC242fQvjblo3z+Tp6vFeGyJaWBmmoY/9jDR/r0P9S3cJ+Fz7sq1v8AiAKmmg==)
```vue
<script setup>
  import {ref} from 'vue'
  import {useCollection} from 'tracked-instance'

  const {isDirty, add, items, remove, reset, loadData} = useCollection()

  loadData([{name: 'Jack'}, {name: 'John'}, {name: 'Joe'}])

  const newUserName = ref('')

  const saveChanges = () => {
    loadData(
      items.value
        .filter(item => !item.isRemoved.value)
        .map((item) => item.instance.data.value)
    )
  }
</script>

<template>
  <button
    :disabled="!isDirty"
    @click="saveChanges"
  >
    💾 Save changes
  </button>
  <button @click="reset">♻️ Reset</button>
  <hr />

  <div>isDirty: {{ isDirty }}</div>

  <div>
    Add new user:
    <input
      v-model="newUserName"
      type="text"
    />
    <button @click="add({name: newUserName}); newUserName = ''">➕ Add user</button>
  </div>

  <ul>
    <template v-for="(item, index) in items">
      <li v-if="!item.isRemoved.value">
        <input
          v-model="item.instance.data.value.name"
          type="text"
        />
        <button @click="remove(index)">🗑 Remove</button>
        <button
          v-if="!item.isNew.value"
          @click="item.instance.reset()"
        >
          ♻️ Reset
        </button>
        isNew: {{ item.isNew.value }}
      </li>
    </template>
  </ul>

  Removed items:
  <ul>
    <li v-for="item in items.filter((i) => i.isRemoved.value)">
      {{ item.instance.data.value.name }}
      <button @click="item.isRemoved.value = false">♻️ Rollback</button>
    </li>
  </ul>
</template>
```

# Documentation
## TrackedInstance
- **data** - tracked data
- **changeData** - includes only modified fields from data, considers nested objects and arrays
- **isDirty** - weather instance has some changes
- **loadData** - rewrite data and clear dirty state
- **reset** - rollback changes at the last point when the instance was not isDirty

## Collection
- **items** - array of `CollectionItem`
- **isDirty** - weather collection includes some changes (add/remove/change)
- **add** - add new item
- **remove** - soft remove item by index. Soft removed items should be deleted permanently after load data. Can be reverted by reset. If passed second param isHardRemove can be deleted permanently.
- **loadData** - accepts array of data for each item. Rewrite each instance data and clear dirty state
- **reset** - rollback changes at the last point when the instance was not isDirty

```typescript
interface CollectionItem {
  instance: TrackedInstance
  isRemoved: Ref<boolean>
  isNew: Ref<boolean> //weather is new instance. Field can be changed manually or changed in loadData in second argument
  meta: Record<string, any>
}
```
