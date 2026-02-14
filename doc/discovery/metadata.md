# Metadata Discovery

This document describes metadata/provenance in the current TypeScript port,
compares it with Rust Figment, and lays out the next improvement plan.

## Metadata in this project today

Current metadata shape (`src/core/metadata.ts`):

- `name: string`
- `source?: string`
- `interpolate(profile, keys): string`

Metadata is currently created by providers and registered by `Figment` during
`join`/`merge` operations. The core provenance flow is:

1. Provider is added to `Figment`.
2. `Figment` assigns a numeric tag to that provider's produced values.
3. `Figment` stores `tag -> metadata` in `metadataByTag`.
4. Value and tag trees are coalesced in parallel.
5. `findMetadata(path)` resolves winning metadata via winning tag at path.

Related APIs:

- `getMetadata(tag)`
- `findMetadata(path)`

## What is already good

- Metadata is now tied to tags, not just provider list ordering.
- Coalescing has parallel value/tag logic for `join`, `merge`, `adjoin`, `admerge`.
- Nested leaf provenance is test-covered for merge/join winner behavior.
- Missing path metadata lookup returns `undefined` rather than stale fallback.
- `focus(path)` carries tag trees for focused subtrees.

## Where this differs from Rust Figment

Rust Figment has a richer provenance model and error integration. Current gaps:

- No code-location provenance for where a provider was added (Rust tracks this).
- Metadata model is smaller than Rust `Metadata` + `Source` capabilities.
- Container path lookups use descendant fallback to align with Rust Figment-style
  behavior (container paths can still return metadata).
- Multi-source container attribution is still simplified (single resolved result,
  not full candidate set).
- Error model is not yet fully integrated with provenance at parity level.
- No full "magic values" story that depends on origin metadata.

## Design choice in current lookup behavior

`findMetadata(path)` now follows Rust Figment's practical direction: it can
return metadata for container paths by resolving a descendant tag
deterministically.

Current behavior:

- if `path` resolves to a leaf, returns leaf metadata
- if `path` resolves to a container, returns a deterministic descendant-derived
  metadata result
- missing paths return `undefined`

Tradeoff:

- container metadata can still be ambiguous when multiple providers contributed
  different descendants

## Recommended metadata improvements

These are the next provenance improvements, including items discussed so far.

## 1) Multi-source container introspection

Keep Rust-like container lookup, and add APIs that expose ambiguity explicitly.

Suggested API options:

- `findMetadataAll(path)` for transparent multi-source containers
- optional `findTagAll(path)` for advanced consumers

Suggested rules:

- `findMetadata(path)` remains deterministic and Rust-aligned
- `findMetadataAll(path)` returns all descendant sources in deterministic order
- if multiple child sources exist, `findMetadataAll(path)` should expose all of
  them in deterministic order

## 2) Public tag lookup API

Expose canonical tag retrieval directly:

- `findTag(path): Tag | undefined`

Why:

- metadata is derived from tag
- advanced consumers may want direct tag handling/caching

## 3) Source-focused helper API

Add source-oriented helper:

- `findSource(path)` (or equivalent)

Why:

- many consumers need source path/name, not full metadata object

## 4) Full provenance attachment to errors

Ensure extraction and provider errors carry provenance context consistently:

- tag
- profile
- metadata
- path

Scenarios to verify:

- missing field
- provider parse/read failures
- decode/type mismatch failures

## 5) Profile overlay provenance verification

Add parity tests for provenance under profile layering:

- default/global/custom overlays
- winning metadata under selected custom profiles
- global override provenance attribution

## 6) Focus + further merges provenance stability

Verify stability of tags/metadata after:

- `focus(path)`
- then additional `join`/`merge`

Goal:

- no tag drift or stale metadata in focused FigmenTs

## 7) Provider-specific provenance fixtures

Add provenance fixtures for each provider behavior edge:

- `Env`: `prefixed`, `split`, `map`, `filterMap`, `only`, `ignore`
- `Data`: `search`, `required`, nested profile behavior, resolved file source
- `Serialized`: keyed/unkeyed value paths

## 8) Provenance debug/explain surface

Add an introspection helper for development/debugging, e.g.:

- `explain(path?) -> { value, tag, metadata, profile }`

This can remain non-core/diagnostic but improves observability significantly.

## 9) Metadata model enrichment

Expand metadata model toward Rust parity where feasible:

- richer `source` representation (file/code/custom distinctions)
- provider interpolation semantics validation
- optional provider-add callsite info (if practical in TS runtime)

## 10) Documentation and parity contract

Document expected semantics explicitly:

- deterministic single-result lookup vs multi-source introspection behavior
- deterministic ordering guarantees for fallback-all APIs
- intentional non-parity behavior (if any)

## Acceptance checklist for metadata parity phase

- [ ] `findMetadata(path)` remains deterministic for leaf and container paths
- [ ] `findMetadataAll(path)` (or equivalent) handles multi-source containers
- [ ] public `findTag(path)` exists and is tested
- [ ] error paths include provenance context consistently
- [ ] profile overlay provenance scenarios are fixture-tested
- [ ] focus + subsequent merges preserve provenance invariants
- [ ] provider-specific provenance fixtures are in place
- [ ] docs include usage examples for deterministic and multi-source lookup modes
