# Changelog

All notable changes to this project will be documented in this file.

## [1.0.23] - 2024

### Fixed
- Fixed `reset()` corrupting `Date` and `File` objects (replaced `JSON.parse/stringify` with `cloneDeep`)

### Changed
- Renamed `afterIndex` parameter to `index` in `Collection.add()` interface for clarity
- Added `exports` field to `package.json` for proper ESM resolution

---

*Versions prior to 1.0.23 were not tracked in this changelog.*