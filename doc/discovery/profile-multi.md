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
  .appendProfiles(["incident-override"])
  .clearSelectedProfiles();
```

### Concrete API proposal

- `select(profile: string): Figment`
  - compatibility sugar for `selectProfiles([profile])`
- `selectProfiles(profiles: string[]): Figment`
  - replace current selected profile set with ordered list
- `appendProfiles(profiles: string[]): Figment`
  - append overlays after current list
- `prependProfiles(profiles: string[]): Figment`
  - prepend overlays before current list
- `selectedProfiles(): string[]`
  - return normalized ordered overlays (custom profiles only)
- `clearSelectedProfiles(): Figment`
  - reset to no selected custom profiles

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
7. `appendProfiles()` and `prependProfiles()` ordering
8. no-selected case remains `default + global`

## Rollout plan

1. Add APIs and internal list model.
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
