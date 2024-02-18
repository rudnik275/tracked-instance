# 🚀 Features
- 🕶 Track what changed in your form
- 🌎 Send on backend only fields which changed
- 📦 Build multiple requests for lists only for items which was changed/removed/added
- 🦾 Type Strong: Written in TypeScript

#  Install
> npm i tracked-instance

# Support
Supports Vue 3.x only

# Usage

```javascript

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
