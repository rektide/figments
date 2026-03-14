# Config Model: Raw, Resolved, and Runtime State

This document defines the underlying config model and the API vocabulary we
want to settle for it.

Model layers:

- runtime internals (`state()`)
- raw profile buckets (`data()` concept)
- resolved merged config (`build()`)

Primary implementation reference: [`/src/figment.ts`](/src/figment.ts).

## Why this split exists

The library has two different kinds of information:

1. **Raw, profile-partitioned inputs** (`default`, custom profiles, `global`)
2. **Resolved output** after overlay precedence is applied

It also has **engine internals** (provenance tags, metadata map, pending state, failure state) that are useful for advanced introspection but noisier for day-to-day config use.

These APIs separate those concerns clearly.

## Definitions

### Runtime State (`state()`)

`state()` is the complete live runtime object. It is intended for advanced introspection and tooling.

Current fields (as of now):

- `activeProfiles`
- `providerProfileSelectionMode`
- `pending`
- `values`
- `tags`
- `metadataByTag`
- `failure`
- `nextTag`

This is currently symbol-backed via [`/src/state.ts`](/src/state.ts) and exposed through `state()` in [`/src/figment.ts`](/src/figment.ts).

### Raw Profile Buckets (`data()` concept)

Raw profile buckets are the config map by profile only (no provenance internals):

```ts
{
  default: { ... },
  debug: { ... },
  global: { ... }
}
```

This is the "source buckets" view: what each profile contains before final resolution.

### Resolved Value (`build()`)

Resolved value is the merged config consumers usually want.

Resolution order is:

`default -> selected overlays (in order) -> global`

This is represented by `build(...)` for full materialization.
`extract(...)` is path-oriented flexible resolution.

## Current API status

Current public APIs in [`/src/figment.ts`](/src/figment.ts):

- `state()` exists and returns live runtime internals
- `build(options)` is the full resolved-value materialization API
- `extract(options)` is flexible path resolution (`path` required)
- `explain(options)` is path-level introspection/provenance

`data()` remains a concept, not a method.

Equivalent expressions today:

- `data()` concept -> `figment.state().values`
- resolved full config -> `figment.build(options)`

## What each is for

| Layer/API | Audience | Typical use |
|---|---|---|
| `build(...)` | app/runtime users | "Give me the full config I should run with" |
| `extract(...)` | app/runtime users | "Resolve one path with missing/deser controls" |
| `state().values` (`data()` concept) | advanced users | "Show each profile bucket" |
| `state()` | tooling/debugging | "Show full engine/provenance internals" |

## Relationship between APIs

- `state().values` is the raw profile-bucket content.
- `build(...)` is synthesized from raw profile content + selected profile ordering.
- `extract(...)` is path-oriented synthesis with missing/fallback/deser behavior.
- `state()` includes extra internals that are intentionally not part of raw bucket data.

## Mutation semantics

This project intentionally allows mutable state exposure.

- mutating `state().values` changes later resolved output (`build(...)` and `extract(...)`)
- mutating `state().activeProfiles` changes overlay precedence
- mutating `state().metadataByTag` / `state().tags` changes provenance behavior

Because provider loading is async, callers who need a settled view should wait on:

- `await state().pending`

before treating runtime/raw/resolved views as stable.

## Suggested public contract going forward

Recommended stable surface:

- `state()` -> full internals
- `data()` (or equivalent) -> raw profile buckets only
- `build(options?)` -> resolved merged config materialization
- `extract(options)` -> path/fallback/deser-oriented resolution (`path` required)
- `explain(options?)` -> targeted path-level diagnostics/provenance

If a future `value()` method is introduced, it should alias `build()` semantics,
not replace `extract()`.

## Example usage

```ts
const figment = Figment.new()
  .merge(providers.Serialized.default("app.name", "base"))
  .merge(providers.Serialized.default("app.name", "debug").profile("debug"))
  .selectProfiles(["debug"])

const state = figment.state()
await state.pending

// raw buckets
const rawDebug = state.values.debug

// resolved full view
const full = await figment.build<{ app: { name: string } }>()

// resolved path-level access
const name = await figment.extract<string>({ path: "app.name" })
```

## Notes

- This is a naming and contract clarification doc, not a migration doc.
- Since the library is pre-1.0, API changes to align with this model are acceptable.
