# Changelog

All notable changes to this project will be documented in this file.

## [2.0.9] - 2026-06-10

### Fixed

- `Collection.remove()` no longer throws `TypeError` on an invalid or stale index: a second `item.remove()` on the same item, `remove()` on an out-of-range index, or `remove()` on an item reference that survived a `loadData()` are now safe no-ops.
- Nested proxy identity is now stable: repeated reads of the same nested object/array return the same Proxy (`data.value.obj === data.value.obj`), so identity-based operations work — `includes`/`indexOf` on arrays of objects, Map/Set keys, memoization by reference. Also removes per-access Proxy allocation on reads.
- **Changed Data** no longer turns a plain object keyed by numeric strings (`{0: 'a'}`) into an array. Missing intermediate containers in `projectDiff`/`applyReverse` are now created by the recorded `LedgerNode.kind` instead of guessing from key shape; `reset()` likewise restores the correct container type after a type-change mutation on such objects.
- `isObject` no longer throws `ReferenceError` in runtimes without the `File` global (Node < 20 / some SSR environments).
- Symbol-keyed writes no longer half-track: they bypass the **Ledger** entirely (previously they flipped `isDirty` while being invisible in `changedData`).

### Changed

- Internal projections (`changedData`, `reset()`) now read the raw live data instead of going through the tracking Proxy — every walk previously paid Proxy-trap cost and allocated throwaway nested proxies; reactivity is unchanged (the ledger ref covers invalidation).
- `TrackedInstance.isDirty` / `changedData` are now typed `ComputedRef` (they always were read-only computeds); `ComputedRef` is assignable to `Ref`, so no consumer change needed.
- Added ESLint (flat config) with `yarn lint`; `isObject` is now a TS type predicate, removing manual casts in the engine.
- Documented limitations (pinned by tests): `delete` of a key whose value is `undefined` is not tracked; symbol-keyed properties are exempt from tracking.
- Docs refreshed: CLAUDE.md/ADR-0003 now describe the single kind-tagged `LedgerNode` (classes collapsed in 2.0.8), README's `useCollection` signature matches the actual single-options-object API.

## [2.0.8] - 2026-05-29

### Changed

- Internal refactor of the **Ledger** engine (`tracked-data.ts`), no behavior change:
  - Collapsed `LedgerObjectNode` and `LedgerArrayNode` — which had byte-identical bodies — into a single `LedgerNode` class tagged by `kind`, with the array-only Baseline `length` as an optional field. `isLedgerNode` is now a single `instanceof` check.
  - Merged the near-identical `_recordObjectMutation` and `_recordArrayMutation` into one `_recordContainerMutation`; the only object-vs-array difference (the key list) is computed inline.
  - `record()` now resolves the value-in-**Ledger** and old live value once and threads them into the helpers, so each mutation walks the store once instead of several times. `getInLedger` + `hasInLedger` collapsed into a single-walk `lookupInLedger`.
  - Inlined the `_unsetAndPrune` one-line wrapper, made missing-key detection linear (was O(n²)), and documented the load-bearing `oldValue || value` Baseline-fallback so it is not "simplified" into a behavior change.
- Net −57 lines; one fewer class concept and two fewer methods to maintain.

Public API unchanged.

---

## [2.0.7] - 2026-05-02

### Fixed

- `reset()` now correctly restores an array field after a type-change mutation (e.g. `hobbies: string[]` set to `'none'`). Previously `applyReverse` would produce a plain object with numeric string keys instead of the original array; now a fresh array of the correct length is created at the path before child indices are populated.

### Changed

- Added `@vitest/coverage-v8` as a dev dependency for coverage reporting.
- Added four missing tests covering: wholesale array replacement with a shorter array, wholesale array replacement with a longer array, direct `length` increase on an array, and type-change from array to primitive (the scenario that revealed the `reset()` bug above).

Public API unchanged.

---

## [2.0.6] - 2026-05-02

### Changed

- Internal refactor: folded the four mutation-recording helpers (`recordChange`, `setOriginalDataValue`, `unsetAndPrune`, and the `markRemovedFieldsAsUndefined` inner closure) onto `OriginalDataLedger` as private methods. The **Equals Predicate** is now read from `this._equals` instead of being threaded as a function argument.
- Internal refactor: replaced `ArrayInOriginalData` plus the plain-object store with a typed `LedgerNode` protocol (`LedgerObjectNode` + `LedgerArrayNode`). The five `instanceof ArrayInOriginalData` sites collapsed into a single `isLedgerNode` helper. The store is now a tree of `LedgerNode` containers with disjoint container/leaf slots — see `docs/adr/0003-ledger-store-container-leaf-disjoint.md` for the `captureAsLedgerNode` invariant.
- Internal refactor: unified `walkLedgerForDiff` and `walkLedgerForReverse` behind a single `walkLedger(visitor)` traversal. `projectDiff` and `applyReverse` are now visitor implementations; the parent-before-children ordering that `applyReverse` depends on for array `length` restoration is preserved by the traversal structure.
- Refreshed `CLAUDE.md` to describe the current engine shape (LedgerNode protocol, single-callback recording, visitor projection) and added ADR-0003 documenting the store's container/leaf disjointness invariant.

Public API unchanged.

---

## [2.0.5] - 2026-05-02

### Changed

- Internal refactor: dropped the unused `receiver` field from the Proxy's path items and unified `NestedProxyPathItem` with `LedgerPathItem` into a single internal `LedgerPath` type.
- Internal refactor: collapsed the Proxy's two-call mutation protocol (`ledger.record(...)` + `onMutate()`) into a single `onMutation(path, value)` callback. `createTrackedProxy` no longer references `OriginalDataLedger`; the `triggerRef` wiring stays inside `createTrackedData` as a closure over `bumpLedger`.
- Removed dead second pruning pass from `unsetAndPrune` after case analysis confirmed the existing loop already covers every reachable path-shape.

Public API unchanged.

---

## [2.0.4] - 2026-05-01

### Changed

- Internal refactor: collapsed `ledger.ts` and `tracked-proxy.ts` into a single private `tracked-data.ts` module that owns Vue reactivity (`shallowRef` + `triggerRef`) alongside the proxy that triggers it. The bump-after-record obligation that previously lived in `useTrackedInstance` is gone — `tracked-data.ts` exposes a single `createTrackedData` factory and `useTrackedInstance` shrinks to the `{ root: Data }` wrapper plus the public surface. See `docs/adr/0002-merged-tracked-data-module.md`.
- Inlined `path-ops` helpers (`getAtPath` / `hasAtPath` / `setAtPath` / `unsetAtPath`) into `tracked-data.ts` as private functions; `src/path-ops.ts` deleted.
- Removed `tests/clone-deep.spec.ts` and `tests/path-ops.spec.ts` — both tested past the public composable interface. Behaviors not already covered by `tests/tracked-instance.spec.ts` (Map/Set passthrough, Date timestamp identity, File reference identity) were added as composable-level tests.
- Added `CONTEXT.md` at the repo root with the project's domain glossary.

Public API unchanged.

---

## [2.0.3] - 2026-04-30

### Changed

- Removed `lodash-es` runtime dependency. Replaced `get`/`set`/`has`/`unset` with a small internal `path-ops` module and `cloneDeepWith` with a purpose-built `cloneDeep` in `utils.ts`. Consumers no longer pull lodash transitively.
- Inlined `iterateObject` directly into `ledger.ts` as private `walkLedgerForDiff` / `walkLedgerForReverse` generators specialized to the ledger's storage shape.
- Folded `createNestedRef` (generic `customRef` factory in `utils.ts`) and the path-aware `set` / `deleteProperty` handler from `useTrackedInstance` into a single private `tracked-proxy` module. `useTrackedInstance` now reads as wiring (ledger creation, `{root}` wrap, `data` / `isDirty` / `changedData`, `loadData` / `reset`) with no Proxy mechanics.
- `NestedProxyPathItem` is no longer exported from `utils.ts`.
- Bumped dev/runtime dependencies to latest: `typescript` 5 → 6, `vitest` + `@vitest/ui` 3 → 4, `vue` 3.5.13 → 3.5.33.
- Declared `esbuild` as an explicit `devDependency` (was previously resolved transitively via Vitest 3 → Vite; Vitest 4 no longer pulls it in).
- Added explicit `rootDir: "./src"` to `tsconfig.json` (required by TypeScript 6 when emitting declarations).
- Build now passes `--minify` to esbuild.

Public API unchanged.

---

## [2.0.2] - 2026-04-30

### Changed

- Internal refactor: extracted original-data tracking into a dedicated `OriginalDataLedger` module with no Vue dependency. Public API unchanged.

---

## [2.0.0] - 2026-04-03

### Breaking Changes

- `useCollection` now accepts a single options object instead of two positional arguments.

  **Before:**
  ```ts
  useCollection(createItemMeta, { equals })
  useCollection(undefined, { equals })
  ```

  **After:**
  ```ts
  useCollection({ createItemMeta, equals })
  useCollection({ equals })
  ```

### Added

- `CollectionOptions<Item, Meta>` type is now exported from the package.
- Added `equals` option to `useCollection` (previously it could only be passed to `useTrackedInstance`).

### Changed

- Added professional JSDoc comments throughout the codebase for all public types and non-obvious internal logic.

---

## [1.0.23] - 2024

### Fixed
- Fixed `reset()` corrupting `Date` and `File` objects (replaced `JSON.parse/stringify` with `cloneDeep`)

### Changed
- Renamed `afterIndex` parameter to `index` in `Collection.add()` interface for clarity
- Added `exports` field to `package.json` for proper ESM resolution

---

*Versions prior to 1.0.23 were not tracked in this changelog.*