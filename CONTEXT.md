# Tracked Instance

A Vue 3 library for tracking field-level modifications to form data and collections, so backends can be sent only the diff (**Changed Data**) instead of full payloads.

## Language

**Tracked Instance**:
A reactive wrapper around a single value or object that records every field-level modification relative to a **Baseline**.
_Avoid_: store, model, form, entity

**Collection**:
A reactive ordered list of **Tracked Instances** that additionally tracks insertions and removals against a **Baseline**.
_Avoid_: list, array, set, repository

**Collection Item**:
One entry in a **Collection** — a **Tracked Instance** plus per-item flags (**New**, **Removed**) and optional **Item Meta**.
_Avoid_: row, element, record, member

**Baseline**:
The snapshot of the data taken on the most recent `loadData()` call. All change tracking is measured against this.
_Avoid_: original, initial, snapshot, source

**Changed Data**:
A sparse `DeepPartial` of the current data containing only the leaf fields that still differ from the **Baseline**.
_Avoid_: diff, patch, delta, payload

**Dirty**:
The boolean state of having any **Changed Data** — or, for a **Collection**, any **Collection Item** that is itself **Dirty**, **New**, or **Removed**.
_Avoid_: modified, touched, pending, changed

**Ledger**:
The sparse internal store of pre-change values keyed by **Path**; the source of truth that drives **Changed Data**, `reset()`, and **Dirty**.
_Avoid_: history, log, journal, originalData

**Path**:
The sequence of property names locating a node inside the **Tracked Instance**'s data tree. Used as the key in the **Ledger**.

**Soft Remove**:
The default removal mode in a **Collection**: the **Collection Item** stays in `items` but its `isRemoved` flag is set, so consumers can distinguish "delete this on save" from "drop entirely."
_Avoid_: hide, mark-deleted, tombstone

**Hard Remove**:
The opposite of **Soft Remove**: the **Collection Item** is spliced from `items` immediately. Always used for **New Items** because there is nothing on the backend to delete.

**New Item**:
A **Collection Item** added after the last `loadData()`. Identified by `isNew = true`.

**Removed Item**:
A **Collection Item** that has been **Soft Removed**. Identified by `isRemoved = true`.

**Item Meta**:
Per-**Collection-Item** user data produced by `CollectionOptions.createItemMeta`. Lives alongside the **Tracked Instance** but is not tracked and does not contribute to **Dirty**.

**Equals Predicate**:
A user-supplied function replacing strict equality (`===`) at primitive leaf comparisons inside the **Ledger**. Lets, e.g., `null` and `''` be considered equal so they don't make a **Tracked Instance** **Dirty**.
