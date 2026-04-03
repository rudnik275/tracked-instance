# tracked-instance

Vue 3 library for tracking granular form/data changes and syncing only modified fields with backends. Reduces network traffic for complex forms by sending only `changedData` instead of full payloads.

## Two core composables

- `useTrackedInstance<Data>` — tracks changes to a single object/primitive
- `useCollection<Item, Meta>` — tracks an array of tracked instances (add/remove/modify)

## Tech stack

- **TypeScript** 5.7, strict mode (`noUnusedLocals`, `noUnusedParameters`)
- **Vue 3** — peer dependency, not bundled
- **lodash-es** — get, set, has, unset, cloneDeepWith
- **Module format** — ESM only (`dist/index.mjs`)
- **Build** — `tsc` (types → `dist/types/`) + `esbuild` (bundle → `dist/index.mjs`)
- **Tests** — Vitest 3 (`yarn test`)
- **Package manager** — yarn

## Project structure

```
src/
  index.ts              — public exports only
  tracked-instance.ts   — useTrackedInstance composable
  collection.ts         — useCollection composable
  utils.ts              — shared utilities (Proxy helpers, cloneDeep, iterateObject)
tests/
  tracked-instance.spec.ts
  collection.spec.ts
dist/                   — compiled output (do not edit manually)
```

## Public API types

```typescript
// src/tracked-instance.ts
interface TrackedInstance<Data> {
  data: Ref<Data>                        // reactive reference to current data
  isDirty: Ref<boolean>                  // true when any field differs from original
  changedData: Ref<DeepPartial<Data>>    // only the changed fields (nested diff)
  loadData(newData: Data): void          // replace data and clear dirty state
  reset(): void                          // revert data to last loadData() state
}

// src/collection.ts
interface Collection<Item, Meta = undefined> {
  items: Ref<CollectionItem<Item, Meta>[]>
  isDirty: ComputedRef<boolean>          // true if any item is dirty, new, or removed
  add(item: Item, index?: number): CollectionItem<Item, Meta>
  remove(index: number, isHardRemove?: boolean): void
  loadData(items: Item[]): void
  reset(): void
}

type CollectionItem<Item, Meta = undefined> = Raw<{
  instance: TrackedInstance<Item>
  meta: Meta                             // arbitrary metadata from createItemMeta()
  isRemoved: Ref<boolean>               // soft-delete flag
  isNew: Ref<boolean>                   // true for items added after loadData()
  remove(isHardRemoved?: boolean): void  // shortcut: removes self from collection
}>

// src/utils.ts
type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T
```

## Data flow

### useTrackedInstance

Data is wrapped inside `{ root: Data }` internally to support primitive root values.

```
data.value.field = x
  → Proxy set trap fires (createNestedRef in utils.ts)
  → snapshotValueToOriginalData() stores original value in _originalData (only first change)
  → value is cloneDeep'd before storing in _data
  → _changedData (computed) runs iterateObject(_originalData) comparing against _data
  → changedData exposes only fields that still differ from original
```

`_originalData` is sparse — it only contains fields that have been touched. When a field reverts to original, its key is removed from `_originalData`. `isDirty` checks `Object.keys(_originalData).length > 0`.

### ArrayInOriginalData

Arrays in `_originalData` are stored as `ArrayInOriginalData` instances (not plain arrays) to avoid lodash/Proxy treating them as normal array operations. This class stores only `length` (non-enumerable) so array indices can be tracked as plain keys without interfering with length-change detection.

When array length decreases, the Proxy `set` trap on `length` calls `triggerChangingArrayItems()`, which deletes extra indices from the receiver or marks them as `undefined` depending on direction.

### snapshotValueToOriginalData

Called on every `set`/`deleteProperty`. Logic:
- If `_originalData` already has the path → check if new value matches original; if yes, unset from `_originalData` (field is clean again)
- If not in `_originalData` and `newValue !== oldValue` → store original value
- For objects/arrays → recurse, also marking removed keys as `undefined`

### changedData computation

`iterateObject(_originalData)` traverses only leaf nodes by default. For each leaf path, it reads the current value from `_data` and sets it in `changedData`. Type mismatch between `_originalData` and `_data` (e.g. object replaced by primitive) stops deep traversal — the whole field is included as-is.

### useCollection

Each item is a `markRaw` object containing a `TrackedInstance`. `markRaw` prevents Vue from making the collection item itself deeply reactive (only `instance.data`, `isRemoved`, `isNew` need reactivity).

`isDirty` aggregates: `instance.isDirty.value || isNew.value || isRemoved.value` across all items.

`remove()` defaults to soft delete (`isRemoved = true`). Hard remove or removing a new item splices from array. `reset()` filters out new items, clears `isRemoved`, and calls `instance.reset()` on survivors.

## Edge cases

- **File/Date** — compared by reference, not deep equality; `cloneDeep` preserves them as-is
- **Primitive root** — `useTrackedInstance(42)` works; data is wrapped in `{ root: 42 }` internally
- **Type change** — if a field switches from object to primitive (or vice versa), the whole field appears in `changedData`, not a nested diff
- **Revert to original** — if a changed field is set back to its original value, it disappears from `changedData` and `isDirty` may become false
- **Nested deletions** — `delete data.value.obj.key` records `undefined` in `_originalData`; `changedData` will contain `{ obj: { key: undefined } }`

## Code conventions

- Private/internal fields: underscore prefix (`_originalData`, `_data`, `_changedData`)
- Public API: descriptive camelCase (`loadData`, `reset`, `isDirty`, `changedData`)
- Vue Composition API: `computed`, `ref`, `customRef`, `markRaw`
- Generics for type safety: `<Data>`, `<Item>`, `<Meta>`
- `DeepPartial<T>` for partial nested updates

## Common commands

```bash
yarn build   # tsc + esbuild
yarn test    # vitest run
```

## Release workflow

When asked to commit and there are changes worth adding to CHANGELOG.md, first ask:
> "Will there be any more changes in this version?"

If **yes** — commit normally, update CHANGELOG.md but don't tag yet.

If **no** — do the full release:
1. Update `CHANGELOG.md` with all changes for this version (format: `## [x.y.z] - YYYY`)
2. Bump version in `package.json`
3. Run `yarn build` and `yarn test` to verify
4. Commit: `git commit -m "x.y.z"`
5. Tag: `git tag x.y.z`
6. Push commit and tag: `git push && git push --tags`

GitHub Actions picks up the tag and runs tests, build, then `npm publish` automatically (NPM_TOKEN is configured as a GitHub repo secret).

Version bumping follows semver: patch for fixes, minor for new features, major for breaking changes.