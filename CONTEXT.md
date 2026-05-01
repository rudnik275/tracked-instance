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

## Relationships

- A **Collection** owns many **Collection Items**; each **Collection Item** holds exactly one **Tracked Instance**
- A **Tracked Instance** owns exactly one **Ledger**
- The **Ledger** maps **Paths** to the **Baseline** value at each **Path** (sparse — only changed paths are recorded)
- **Changed Data** is the **Ledger**'s **Paths** projected against the current data
- **Dirty** for a **Tracked Instance** is `Ledger` non-empty; for a **Collection** it aggregates across all **Collection Items** plus the **New** and **Removed** flags

## Example dialogue

> **Dev:** "When the user clears a text field, does that show up in **Changed Data**?"
> **Domain expert:** "Yes — clearing changes the value, so the **Path** lands in the **Ledger** and the field appears in **Changed Data**. But if they clear it and then retype the **Baseline** value, the **Ledger** drops the **Path** and the field disappears from **Changed Data** again."

> **Dev:** "What if I delete a row from a **Collection** and then call `reset()`?"
> **Domain expert:** "If it was a **Soft Remove** on a non-**New Item**, `reset()` just clears `isRemoved` and the **Collection Item** comes back. If it was a **New Item**, it was **Hard Removed** at delete time — there's nothing to bring back, but `reset()` would have dropped it anyway because **New Items** never survive `reset()`."

> **Dev:** "Why doesn't **Collection** expose **Changed Data** like **Tracked Instance** does?"
> **Domain expert:** "Because there's no single right shape for a **Collection** diff — id-only versus full payload, position-aware versus position-free, soft- versus hard-delete semantics. Consumers walk `items` themselves and choose the shape their backend expects. See ADR-0001."

## Flagged ambiguities

- "Original" was used both for the **Baseline** snapshot and for a leaf value stored in the **Ledger**. Resolved: **Baseline** is the whole snapshot at `loadData()`; entries in the **Ledger** are "pre-change values," not "originals."
- "Diff" / "patch" / "delta" all show up informally for **Changed Data**. Resolved: **Changed Data** is the only canonical public term; the others are fine in passing comments but never in the API, docs, or architectural discussion.
- The internal `OriginalDataLedger` class name predates this glossary and remains for now; in conversation and new code, use **Ledger**.
