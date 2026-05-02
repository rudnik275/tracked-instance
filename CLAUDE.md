# tracked-instance

Vue 3 library for tracking granular form/data changes and syncing only modified fields with backends. Reduces network traffic for complex forms by sending only `changedData` instead of full payloads.

## Two core composables

- `useTrackedInstance<Data>` — tracks changes to a single object/primitive
- `useCollection<Item, Meta>` — tracks an array of tracked instances (add/remove/modify)

## Tech stack

- **TypeScript** 6, strict mode (`noUnusedLocals`, `noUnusedParameters`)
- **Vue 3** — peer dependency, not bundled
- **No runtime dependencies** — `cloneDeep` and `isObject` are local in `src/utils.ts`
- **Module format** — ESM only (`dist/index.mjs`)
- **Build** — `tsc` (types → `dist/types/`) + `esbuild` (bundle → `dist/index.mjs`)
- **Tests** — Vitest 4 (`yarn test`)
- **Package manager** — yarn

## Project structure

```
src/
  index.ts              — public exports only
  tracked-instance.ts   — useTrackedInstance composable (thin adapter; wraps in { root: Data })
  collection.ts         — useCollection composable
  tracked-data.ts       — internal engine: Ledger, Proxy, LedgerNode protocol, walker
  utils.ts              — shared utilities (cloneDeep, isObject, DeepPartial)
tests/
  tracked-instance.spec.ts
  collection.spec.ts
docs/
  adr/                  — architecture decisions (read before refactoring the engine)
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
interface CollectionOptions<Item, Meta = undefined> extends TrackedInstanceOptions {
  createItemMeta?: (instance: TrackedInstance<Item>) => Meta  // factory for per-item metadata
}

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

Data is wrapped inside `{ root: Data }` internally so the engine can assume a Record-shaped root and primitive root values still work.

```
data.value.field = x
  → Proxy set trap fires (createTrackedProxy in tracked-data.ts)
  → onMutation(path, value) callback is invoked exactly once (see ADR-0002)
  → ledger.record(path, value) writes the Baseline value into the sparse store keyed by Path
  → triggerRef bumps the ledgerRef; isDirty and changedData recompute
  → projectDiff walks the Ledger and reads current values from live data → Changed Data
  → reset() applies ledger.applyReverse(liveData) to restore the Baseline, then clears the Ledger
```

The **Ledger**'s store is sparse — only **Paths** that have been touched are recorded. When a field reverts to its **Baseline**, its **Path** is unset and empty parents are pruned. `isDirty` is `!ledger.isEmpty()`.

### LedgerNode protocol

The **Ledger**'s store is a tree of `LedgerNode` containers, never plain JS objects. Two file-private classes in `tracked-data.ts`:

- `LedgerObjectNode` — backs an object branch; sparse `entries()` over recorded keys; `isEmpty()` for prune detection
- `LedgerArrayNode` — backs an array branch; carries the **Baseline** `length` so `applyReverse` can restore it before scalar leaves are written

Container-vs-leaf disambiguation goes through one helper, `isLedgerNode(value)`, never inlined per call site (see ADR-0002 for why this lives in one module). When a wholesale **Baseline** value is captured at a **Path** (e.g. `data.contact = null` overwrites a prior object), `captureAsLedgerNode` recursively wraps it so every recorded subtree is uniformly traversable through the protocol — see ADR-0003 for the disjointness invariant.

When an array's `length` decreases, the Proxy `set` trap on `length` synthesizes per-index `delete` events on the receiver so the **Ledger** sees individual index mutations consistent with the new length; on increase it synthesizes per-index `set undefined` events.

### Recording a mutation

`OriginalDataLedger.record(path, value)` is invoked from the Proxy's `onMutation` callback on every `set`/`deleteProperty`. Logic:

- If the **Path** is already recorded → check if the new value matches the **Baseline** via the **Equals Predicate** (default `===`); if yes, unset the **Path** and prune empty parent containers
- If the **Path** is not recorded and `newValue !== oldValue` → write the **Baseline** value via `_setStoreValue`
- For objects → `_recordObjectMutation` recurses; keys removed by the assignment are recorded as `undefined`
- For arrays → `_recordArrayMutation` walks by index

The **Equals Predicate** lives on `this._equals` and is never threaded as a parameter.

### Changed Data projection

`OriginalDataLedger.projectDiff(liveData)` runs `walkLedger` with a visitor:

- `visitContainer(path, node)` — checks whether the live data at `path` has the same shape as the recorded `LedgerNode`. If shapes diverge (recorded object, live primitive) the whole live value is written into the result and the visitor returns `false` to stop descent; otherwise it descends.
- `visitLeaf(path, value)` — reads the current value at `path` from live data and writes it into the result.

`applyReverse` consumes the same `walkLedger` traversal with a different visitor that restores `LedgerArrayNode.length` on the parent visit before scalar indices are written by leaf visits — that's why container nodes are visited parent-before-children.

### useCollection

Each item is a `markRaw` object containing a `TrackedInstance`. `markRaw` prevents Vue from making the collection item itself deeply reactive (only `instance.data`, `isRemoved`, `isNew` need reactivity).

`isDirty` aggregates: `instance.isDirty.value || isNew.value || isRemoved.value` across all items.

`remove()` defaults to soft delete (`isRemoved = true`). Hard remove or removing a new item splices from array. `reset()` filters out new items, clears `isRemoved`, and calls `instance.reset()` on survivors.

## Edge cases

- **File/Date** — compared by reference, not deep equality; `cloneDeep` preserves them as-is
- **Primitive root** — `useTrackedInstance(42)` works; data is wrapped in `{ root: 42 }` internally
- **Type change** — if a field switches from object to primitive (or vice versa), the whole field appears in `changedData`, not a nested diff
- **Revert to original** — if a changed field is set back to its original value, it disappears from `changedData` and `isDirty` may become false
- **Nested deletions** — `delete data.value.obj.key` records `undefined` in the **Ledger**; **Changed Data** will contain `{ obj: { key: undefined } }`

## Code conventions

- Private/internal fields: underscore prefix (`_store`, `_equals`, `_entries`)
- Public API: descriptive camelCase (`loadData`, `reset`, `isDirty`, `changedData`)
- Vue Composition API: `computed`, `ref`, `customRef`, `markRaw`, `shallowRef`, `triggerRef`
- Generics for type safety: `<Data>`, `<Item>`, `<Meta>`
- `DeepPartial<T>` for partial nested updates
- Use the `CONTEXT.md` glossary in code comments and commit messages (**Ledger**, **Path**, **Baseline**, **Changed Data**, **Equals Predicate**, etc.)

## Common commands

```bash
yarn build   # tsc + esbuild
yarn test    # vitest run
```

## Release workflow

**npm publish is fully automated via GitHub Actions.** Pushing a git tag triggers the CI pipeline which runs tests, builds, and publishes to npm automatically (NPM_TOKEN is a GitHub repo secret). Never run `npm publish` manually.

When asked to commit and there are changes worth adding to CHANGELOG.md, first ask:
> "Will there be any more changes in this version?"

If **yes** — commit normally, update CHANGELOG.md but don't tag yet.

If **no** — do the full release:
1. Update `CHANGELOG.md` with all changes for this version (format: `## [x.y.z] - YYYY-MM-DD`)
2. Bump version in `package.json`
3. Run `yarn build` and `yarn test` to verify
4. Commit: `git commit -m "x.y.z"`
5. Tag: `git tag x.y.z`
6. Push commit **and** tag: `git push && git push --tags`

The tag push triggers GitHub Actions → tests → build → `npm publish`. No manual publish step needed.

Version bumping follows semver: patch for fixes, minor for new features, major for breaking changes.

## Agent skills

### Issue tracker

Issues live as markdown files in `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
