# Changelog

All notable changes to this project will be documented in this file.

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