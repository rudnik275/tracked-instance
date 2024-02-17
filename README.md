# TrackedInstance

**TrackedInstance** - part of form manager which accepts object and tracks changes.
It creates to display changes in form only when user do some changes, instead of show isDirty on touch input.

## Example

User get some data from backend

```
const response = {
  name: '123'
}
const form = useTrackedInstance(response) // initial form data
```

He changed field **name**

```
form.data.value.name = '1'
```

`TrackedInstance.isDirty` will equal `true`
But if we remove symbols what we added, then `isDirty` will equal `false`
In this way, for example, you can determine whether there have been any changes on this form and understand whether
it is necessary to send request to update form.
TrackedInstance has boolean field `isNew` it is necessary to understand whether it is a new form or not.
User may need to save this form even if `isDirty === false`

## Fields and methods:

- **data** - our form data
- **originalData** - object which collects values of data before do some change in each field
- **changeData** - data filtered by fields which includes in originalData. Used for partial update request
- **isDirty** - weather form is dirty
- **loadData** - loads default values () в instance. After this action `isDirty === false`
- **reset** - rollback changes on **initial state** or state which was set by loadData

## Example:

Form consists of two parts, both parts saved in different entities on backend

```vue

<script>
const formPart1 = useTrackedInstance({ name: '' })
const formPart2 = useTrackedInstance({ someValue: '', anotherValue: 0 })
</script>

<template>
  <input v-model="formPart1.data.value.name">
  <input v-model="formPart2.data.value.someValue">
  <input v-model="formPart2.data.value.anotherValue">
</template>
```

```typescript
const save = () => {
  if (formPart1.isDirty.value) {
    api.patch(url1, formPart1.data.value)
  }
  if (formPart2.isDirty.value) {
    api.patch(url2, formPart2.data.value)
  }
}
```

TrackedInstance in this case helps to send `PATCH` request only for instance which has some changes

For example user changed `formPart1.data.value.name = 'my name'`
in this case `PATCH` sent only for `url1`

# Collection

It connects master form with relative entities

## Example

We have entity **user** in database which stores users. Rest endpoint `/user`
Another entity **user-role** which stores user roles. Rest endpoint `/user-role`
And we want to create UI form which will process entities updates.

- weather form isNew (user creation), then we need to save data to endpoint `/user` and all his roles to `/user-role`
- if we open form of existing user and changed his name, but did not touch his roles, in this case you need to
  send `PATCH:/user`, but do not send any requests for `/user-role`
- if we open form of an existing user, but didn't change anything for master record of user, but added role to him, in
  this case you don't need to do `PATCH:/user`, but only `POST` for those roles that we added to him, while those roles
  which have **already been** and **have not changed** shouldn't send any requests
 
- `if (isNew)` - send `POST` request
- `else if (isDirty)` send `PATCH` request
- `else` - do nothing

And for roles (`/user-role`) we will use `Collection`, commonly it's array of `TrackedInstance`'s

- `if (collectionItem.isNew)` - `POST:/user-role`
- `else if (collectionItem.isDirty)` - `PATCH:/user-role`
- `else` - do nothing

## Example

```typescript
const props = defineProps<{
  userId?: string
}>()
const form = useTrackedInstance({username: ''})
const userRoleCollection = useCollection()
const loadForm = async () => {
  // if user id came from outside (from props of component), then record exists in database and needs to be fetched
  if (props.userId) {
    // load user
    const user = await api.get(`user/${props.userId}`)
    form.loadData(user)

    // load roles
    const roles = await api.get('user-role', {params: {userId: props.userId}})
    userRoleCollection.loadData(roles)
  }
}
loadForm()

const save = async () => {
  const formIsNew = !Boolean(props.userId)
  if (formIsNew) {
    // if form was new, request of creation will be made for it and the updated data will be loaded via loadData. The form will become isDirty === false
    // weather form isNew, then need to send "create" request and updated data should loaded by "loadData". In this case isDirty === false
    const newUser = await api.post('user', form.data.value)
    form.loadData(newUser)
  } else if (form.isDirty.value) {
    // wheather form not new, then send "update" request and also update data by "loadData"
    const updatedUser = await api.patch(`user/${props.userId}`, form.data.value)
    form.loadData(updatedUser)
  }

  // send request for each record in collection which has some changes, removed or isNew
  const items = userRoleCollection.items.filter(item => !item.isRemoved.value)
  for (const item of userRoleCollection.items.value) {
    if (item.instance.isNew.value) {
      const newRole = await api.post('user-role', item.instance.data.value)
      item.instance.loadData(newRole)
    } else if (item.instance.isDirty.value) {
      const updatedRole = await api.patch(`user-role/${item.instance.data.value.id}`, item.data.value)
      item.instance.loadData(updatedRole)
    }
  }

  // Remove only those records which already exist in database.
  // If user added new record and doesn't save it, then we just silently remove it and don't build any requests for it 
  const removedItems = userRoleCollection.items.value.filter(item => item.isRemoved.value)
  for (const item of removedItems) {
    api.delete(`user-role/${item.data.value.id}`)
  }
}
```

## Fields and methods:

```typescript
interface CollectionItem {
  instance: TrackedInstance
  isRemoved: Ref<boolean>
  isNew: Ref<boolean> //weather is new instance. Field can be changed manually or changed in loadData in second argument
  meta: Record<string, any>
}
```
By field `isNew` we can build different requests for **new** or **not new** forms.
For example, we can send `POST` request for **new** instance and `PATCH` for **not new**

For master record `/user` we will use TrackedInstance and on **save** will check:

- **items** - array of `CollectionItem`
- **isDirty** - weather collection includes some changes (isNew, isDirty, deletedData.length > 0)
- **add** - push new item
- **remove** - remove item
- **cleanRemoved** - clean all removed items. It can be useful for removing deleted items after save
- **loadData** - update data, after loading `isDirty === false`
- **reset** - rollback changes on **initial state** or state which was set by loadData

If we added new item via `Collection.add`, but there was no `save` yet, then deletion request for such an item is not
needed, which means `Collection.remove` will just silently remove item.
And if item has `isNew === false`, this means that record already exists in database and item will fall
into `deletedData`

Both of these tools (TrackedInstance, Collection) allow you to determine which requests need to be sent.
And send not everything, but only what was changed, added or removed.
With those tools we can do any actions in form and his child entities without send any request,
instead of case when we can't do anything with child entities before don't save master record,
because we can't build correct request for child entities without master record ID  
