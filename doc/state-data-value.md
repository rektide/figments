# Config Model: `state()`, `data()`, and `value()`

This document defines the intended model for three related APIs:

- `state()` for full engine internals
- `data()` for raw config buckets
- `value()` for resolved config

Primary implementation reference: [`/src/figment.ts`](/src/figment.ts).

## Why this split exists

The library has two different kinds of information:

1. **Raw, profile-partitioned inputs** (`default`, custom profiles, `global`)
2. **Resolved output** after overlay precedence is applied

It also has **engine internals** (provenance tags, metadata map, pending state, failure state) that are useful for advanced introspection but noisier for day-to-day config use.

These APIs separate those concerns clearly.

## Definitions

### `state()`

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

### `data()`

`data()` is the raw config map by profile only (no provenance internals):

```ts
{
  default: { ... },
  debug: { ... },
  global: { ... }
}
```

This is the "source buckets" view: what each profile currently contains before final resolution.

### `value()`

`value()` is the resolved merged config (the config consumers usually want).

Resolution order is:

`default -> selected overlays (in order) -> global`

This is currently represented by `extract(...)`; `value()` is the clearer semantic name for that resolved view.

## What each is for

| API | Audience | Typical use |
|---|---|---|
| `value()` | app/runtime users | "Give me the config I should run with" |
| `data()` | advanced users | "Show me what each profile bucket contains" |
| `state()` | tooling/debugging | "Show full engine/provenance internals" |

## Relationship between APIs

- `state().values` and `data()` should represent the same raw profile content.
- `value()` is synthesized from raw profile content + selected profile ordering.
- `state()` includes extra internals that are intentionally not part of `data()`.

## Mutation semantics

This project intentionally allows mutable state exposure.

- mutating `state().values` changes later `value()` / `extract()` results
- mutating `state().activeProfiles` changes overlay precedence
- mutating `state().metadataByTag` / `state().tags` changes provenance behavior

Because provider loading is async, callers who need a settled view should wait on:

- `await state().pending`

before treating `state`/`data`/`value` as stable.

## Suggested public contract going forward

Recommended stable surface:

- `state()` -> full internals
- `data()` -> raw profile buckets only
- `value(options?)` -> resolved merged config
- `explain(options?)` -> targeted path-level diagnostics/provenance

If `extract()` remains, it should be treated as `value()` semantics (or alias to it).

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

// resolved view (current API name)
const name = await figment.extract<string>({ path: "app.name" })
```

## Notes

- This is a naming and contract clarification doc, not a migration doc.
- Since the library is pre-1.0, API changes to align with this model are acceptable.
