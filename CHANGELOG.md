# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed

- Bumped dev/runtime dependencies to latest: `typescript` 5 → 6, `vitest` + `@vitest/ui` 3 → 4, `vue` 3.5.13 → 3.5.33, `lodash-es` 4.17.21 → 4.18.1.
- Declared `esbuild` as an explicit `devDependency` (was previously resolved transitively via Vitest 3 → Vite; Vitest 4 no longer pulls it in).
- Added explicit `rootDir: "./src"` to `tsconfig.json` (required by TypeScript 6 when emitting declarations).

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