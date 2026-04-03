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

## Code conventions

- Private/internal fields: underscore prefix (`_originalData`, `_data`, `_changedData`)
- Public API: descriptive camelCase (`loadData`, `reset`, `isDirty`, `changedData`)
- Vue Composition API: `computed`, `ref`, `customRef`, `markRaw`
- Generics for type safety: `<Data>`, `<Item>`, `<Meta>`
- `DeepPartial<T>` for partial nested updates

## Key implementation details

- Deep change tracking via Proxy (`createNestedRef()` in `utils.ts`)
- `ArrayInOriginalData` class tracks array length changes separately
- Custom `cloneDeep()` preserves `Date` and `File` objects
- `markRaw` on collection items avoids unnecessary Vue reactivity overhead
- Soft deletes via `isRemoved` ref; hard deletes remove from array entirely
- Generator function `iterateObject()` for efficient nested traversal

## Common commands

```bash
yarn build   # tsc + esbuild
yarn test    # vitest run
```

## Release

Push a git tag → GitHub Actions publishes to npm (`NODE_AUTH_TOKEN` required).