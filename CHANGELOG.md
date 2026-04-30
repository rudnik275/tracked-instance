# Changelog

All notable changes to this project will be documented in this file.

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