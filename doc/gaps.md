# Parity Gaps vs Rust Figment

This document tracks what is implemented in the TypeScript port, what is still
missing relative to Rust `figment`, and what "complete port" means in concrete
terms.

## Scope and goal

- Goal: behavioral parity with Rust `figment` for provider composition,
  provenance, extraction semantics, and diagnostics.
- Non-goal: reproducing Rust internals exactly where JS/TS runtime constraints
  differ.
- Current state: core composition works, but several high-value parity areas
  are still partial.

## Parity status by area

## 1) Provider composition semantics

Implemented:

- `join`, `adjoin`, `merge`, `admerge`
- profile selection with `default` and `global` precedence
- built-in providers: `Serialized`, `Env`, `Data` (`Json`, `Toml`, `Yaml`)

Gaps:

- Full edge-case parity for mixed-type collisions across nested structures.
- Exact precedence rules for all array/dict replacement scenarios.
- Full provider surface parity vs Rust docs and examples.

## 2) Metadata and tag provenance

Implemented:

- Per-provider metadata (`name`, optional `source`, interpolator).
- Tag plumbing exists and coalesces through merges.
- Metadata lookup APIs (`findMetadata(path)`, `getMetadata(tag)`).

Gaps:

- Not all extraction/error paths are guaranteed to carry winning leaf tag.
- No Rust-equivalent "provider added at call site" location metadata.
- Provenance shape is simpler than Rust `Tag` + `Metadata` model.
- No complete public tagged-value API analogous to Rust value APIs.

Why it matters:

- Precise "which source won this key" answers.
- Better diagnostics for layered config stacks.
- Required for magic-value parity.

## 3) Error model and multi-error chaining

Implemented:

- `FigmentError` kind/message/path plus chaining support.
- Missing-field and generic provider failure reporting.

Gaps:

- No full Rust-style aggregate error iteration/count semantics.
- Chain ordering and formatting are still simplified.
- Partial context attachment (`tag`, `profile`, `metadata`) in all failure paths.
- No complete equivalence for serde-like type mismatch diagnostics.

## 4) Value system parity (`src/value/*` in Rust)

Implemented:

- Generic TS value tree (`ConfigValue`, `ConfigDict`) and path traversal.

Gaps:

- Missing Rust value model richness (`Value`, numeric distinctions, parse/escape
  helpers, dedicated serializers/deserializers).
- No equivalent for Rust "magic" value behaviors:
  - `Tagged`
  - `RelativePathBuf`
  - other provenance-aware value helpers

## 5) Extraction semantics

Implemented:

- `extract`, `extractLossy`, `extractInner`, `extractInnerLossy`
- optional decode callback

Gaps:

- Not serde-equivalent typed extraction behavior.
- No deep typed diagnostics comparable to Rust deserialization errors.
- Lossy conversion rules are pragmatic, not parity-validated against Rust.

## 6) Provider feature parity

Implemented:

- `Env` with prefix/filter/map/split/only/ignore
- `Data` for JSON/TOML/YAML strings/files
- nested profile parsing for `Data`

Gaps:

- No `YamlExtended` merge-key behavior parity.
- Potential behavior differences in environment parsing edge cases.
- File search and metadata source behavior not fully parity-tested vs Rust.

## 7) Developer/test infrastructure parity

Implemented:

- `vitest` tests for core semantics
- lint/type/build scripts

Gaps:

- No Rust `Jail` equivalent test harness.
- No parity fixture suite copied from Rust examples/docs.
- No systematic "Rust behavior snapshot" cross-check tests.

## Why the port is currently lighter

- The first cut prioritized working composition APIs over full internal parity.
- Rust serde/value internals do not map directly to TS without deliberate
  adapter layers.
- Error/provenance completeness needs broader infrastructure than the initial
  implementation pass.

## What "more complete port" means (acceptance criteria)

## Provenance

- Winning value at any key has deterministic, queryable source metadata.
- All extraction failures include stable path + profile + source attribution.
- Tag lineage survives all coalesce operations and nested lookups.

## Errors

- Multi-error chains are iterable and countable with deterministic order.
- Formatting includes interpolated key, source, and provider context.
- Provider and extraction failures compose into a single coherent error view.

## Values and extraction

- Public value API includes tagged/provenance-aware access patterns.
- Extraction behavior is documented and parity-tested against Rust examples.
- Lossy conversions are explicit, test-covered, and predictable.

## Providers

- `YamlExtended` behavior exists and is tested.
- Env and Data edge cases match Rust behavior for representative fixtures.
- Nested profile parsing and file-source metadata parity are verified.

## Test parity

- A parity test suite mirrors key Rust behaviors (merge/join precedence,
  profiles, env parsing, metadata attribution, chained errors).

## Workstreams to close the gaps

- Workstream A: finalize provenance propagation and tagged lookups across all
  extraction/error paths.
- Workstream B: upgrade error aggregate model and formatter to Rust-like output.
- Workstream C: implement value-layer APIs needed for magic/tagged semantics.
- Workstream D: complete provider parity (`YamlExtended`, env/file edge cases).
- Workstream E: add parity fixtures/tests derived from Rust docs and behavior.
