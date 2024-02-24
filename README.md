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
```vue
<script setup>
  import {useTrackedInstance} from 'tracked-instance'

  const {data, changedData, isDirty, reset, loadData} = useTrackedInstance({
    title: '',
    year: null,
    isPublished: false
  })

  loadData({
    id: 1,
    title: 'The Dark Knight',
    year: 2008,
    isPublished: true
  })
</script>

<template>
  <button @click="reset">reset</button>

  <form @submit.prevent="console.log(changedData.value)">
    <input v-model="data.title" type="text">
    <input v-model.number="data.year" type="text">
    <input v-model="data.isPublished" type="checkbox">

    <button type="submit" :disabled="!isDirty">Show changed data</button>
  </form>
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
```vue
<script setup>
import {ref} from 'vue'
import {useCollection} from 'tracked-instance'

const {isDirty, add, items, remove, reset, loadData} = useCollection()

loadData([{name: 'Jack'}, {name: 'John'}, {name: 'Joe'}])

const newUserName = ref('')
</script>

<template>
  <div>
    isDirty: {{isDirty}}
  </div>

  <button @click="reset">Reset</button>
  
 <div>
   Add new user:
   <input v-model="newUserName" type="text">
   <button @click="add({name: newUserName})">➕ Add user</button>
 </div>

  <ul>
    <template v-for="(item, index) in items">
      <li v-if="!item.isRemoved">
        <input v-model="item.instance.data.value.name" type="text">
        <button @click="remove(index)">♻️ Rollback</button>
        <button @click="remove(index)">🗑 Remove</button>
      </li>
    </template>
  </ul>

  Removed items:
  <ul>
    <li v-for="item in items.filter()">
      {{item.instance.data.name}}
      <button @click="item.isRemoved = false">♻️ Rollback</button>
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
