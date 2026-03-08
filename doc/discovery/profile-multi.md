# Multi-Priority Profiles

This document proposes a full design for ordered multi-profile extraction in `figmen-ts`.

## Why this exists

Today the TS port follows Rust Figment's single selected profile model:

- selected profile API: [`/src/figment.ts`](/src/figment.ts)
- effective merge logic (`default` + selected + `global`): [`/src/figment.ts`](/src/figment.ts)
- Rust reference behavior: [`lmmx/figment2` `src/figment.rs`](https://github.com/lmmx/figment2/blob/main/src/figment.rs#L453-L467)

That is good parity, but it cannot express "use multiple profiles in a specific order" (for example: `region-eu`, then `tenant-acme`, then `prod-hotfix`).

## Desired capability

Support an ordered profile list for extraction while preserving existing behavior.

Target shape:

- baseline: `default`
- ordered overlays: `p1`, `p2`, `p3`, ...
- final override: `global`

Effective value should be:

`default -> p1 -> p2 -> ... -> pn -> global`

with later layers winning on conflicts.

## Recommended API

Keep `select(profile)` for compatibility, but add explicit multi-select APIs.

```ts
figment
  .select("staging")
  .selectProfiles(["region-eu", "tenant-acme", "staging"])
  .spliceProfiles(2, 0, "incident-override")
  .spliceProfiles(0, 1);
```

### Concrete API proposal

- `select(profile: string): Figment`
  - compatibility sugar for `selectProfiles([profile])`
- `selectProfiles(profiles: string[]): Figment`
  - replace current selected profile set with ordered list
- `spliceProfiles(start: number, deleteCount?: number, ...profiles: string[]): Figment`
  - JS `Array.prototype.splice()` semantics over the selected profile list
  - supports insert, replace, and remove in one API surface
- `selectedProfiles(): string[]`
  - return normalized ordered overlays (custom profiles only)

Examples:

- `spliceProfiles(1, 0, "tenant-acme")` inserts at index 1
- `spliceProfiles(0, 2, "staging")` replaces first two with `staging`
- `spliceProfiles(0)` removes all selected profiles from index 0 onward

## Semantics (important)

### 1) Built-ins stay special

- `default` is always baseline.
- `global` is always final override.
- `selectProfiles()` should only store custom profiles.

If user passes `default`/`global` in `selectProfiles()`, ignore them.

### 2) Stable deduplication

Normalize names first, then dedupe by first occurrence.

Example:

- input: `['STAGING', 'staging', 'tenant-acme']`
- stored: `['staging', 'tenant-acme']`

### 3) Missing profiles are skipped

If a selected profile has no values, it contributes nothing.

### 4) Backward compatibility

- Existing `select("foo")` behavior remains, now as a one-element list.
- Existing default behavior (`default + global`) remains when no custom profiles are selected.

## Internal model changes

In [`/src/figment.ts`](/src/figment.ts):

- replace `activeProfile: string` with `activeProfiles: string[]`
- keep a helper for effective extraction order:
  - `const overlays = activeProfiles.filter(isCustomProfile)`

Current merge implementation in `mergedState()` should become a fold:

1. start with `defaults`
2. merge each selected custom profile in list order
3. merge `globals`

Do this for both:

- values (`coalesceDict(..., "merge")`)
- tags (`coalesceTagDictNode(..., "merge")`)

## Provider interaction

Current provider `selectedProfile()` can affect selected extraction profile indirectly.

For multi-profile support, use this rule:

- provider profile still affects where provider data is emitted (unchanged)
- provider profile no longer implicitly rewrites the full selected overlay list

If compatibility is needed, only apply provider profile as default selection when the list is empty.

## Provenance and errors

Multi-profile must keep deterministic provenance:

- winning metadata should reflect the winning profile in order
- `findMetadata(path)` should continue to return winner metadata
- missing-field errors should include the effective selected overlay list for easier debugging

Suggested error context additions:

- `selectedProfiles: string[]`
- `effectiveProfileOrder: ['default', ...selected, 'global']`

## Test plan (must-have)

Add table-driven tests in [`/test/figment.test.ts`](/test/figment.test.ts):

1. `selectProfiles(['a','b'])` overlays `a` then `b`
2. duplicate normalization and dedupe
3. built-ins ignored in selection list
4. missing profile skip behavior
5. metadata winner correctness across 3+ overlays
6. `select()` compatibility with single profile
7. `spliceProfiles()` insert/replace/remove ordering behavior
8. no-selected case remains `default + global`

## Rollout plan

1. Add APIs (`selectProfiles`, `spliceProfiles`, `selectedProfiles`) and internal list model.
2. Switch `mergedState()` to ordered fold for values and tags.
3. Keep `select()` as compatibility sugar.
4. Add tests for behavior and provenance.
5. Update README and parity docs to mark this as intentional extension beyond Rust parity.

## Recommendation

Implement this as a first-class extension (not hidden behavior). Keep Rust parity as the default mental model (`select()` single profile), and make multi-priority explicit via `selectProfiles()`.

That gives you:

- backward compatibility
- predictable precedence
- richer real-world config composition for tenant/region/environment overlays
- clear docs for a deliberate divergence from Rust Figment.

## Breakdown of work

### Workstream A: API and state model

1. Add `activeProfiles: string[]` to `Figment` and remove single-profile storage.
2. Add `selectProfiles(profiles)` to replace the list (normalize + dedupe + strip built-ins).
3. Add `spliceProfiles(start, deleteCount?, ...profiles)` with JS splice semantics on the selected list.
4. Keep `select(profile)` as sugar for `selectProfiles([profile])`.
5. Add `selectedProfiles()` getter returning a defensive copy.

### Workstream B: effective merge algorithm

1. Refactor `mergedState()` to fold in this order: `default`, selected overlays, `global`.
2. Apply the same ordered fold to both value tree and tag tree.
3. Ensure empty/missing selected profiles are skipped without error.
4. Keep no-selection behavior equivalent to current `default + global`.

### Workstream C: provider interaction rules

1. Preserve provider profile behavior for data emission only.
2. Stop implicit provider-driven rewrite of selected overlay list.
3. If needed for compatibility, only seed selection from provider profile when the selected list is empty.

### Workstream D: provenance and errors

1. Verify winner metadata follows the same ordered profile fold.
2. Add error context fields for `selectedProfiles` and `effectiveProfileOrder`.
3. Ensure missing-field and decoder errors remain deterministic with multi-overlay selection.

### Workstream E: test matrix

1. Add table tests for `selectProfiles` order and dedupe.
2. Add table tests for `spliceProfiles` insert/replace/remove semantics.
3. Add tests for built-in profile stripping (`default`, `global`).
4. Add tests for missing selected profile skip behavior.
5. Add provenance tests across 3+ selected overlays.
6. Add compatibility tests for `select(profile)` behavior.

### Workstream F: docs and migration

1. Update README with multi-profile precedence examples.
2. Document `spliceProfiles()` semantics with examples matching JS splice behavior.
3. Document compatibility: single-profile users can continue to use `select()` unchanged.
4. Update parity notes to call this feature an intentional extension beyond Rust Figment.

### Acceptance gates

- API supports replace/insert/remove via `spliceProfiles()`.
- Effective extraction order is deterministic and test-covered.
- Provenance winner attribution remains correct under multi-overlay selection.
- Existing single-profile code paths remain behaviorally compatible.
