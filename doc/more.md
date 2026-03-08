# What To Do Before 1.0

This document captures the highest-value remaining technical work for `figments` before a potential `1.0`.

It is meant to be a living execution guide, not just a snapshot. Each section includes:

- why the work matters
- a strong recommendation
- viable alternatives
- acceptance criteria to know when we are done

## Current Position

The project is now in a strong pre-1.0 state:

- core merge orders (`join`, `merge`, `adjoin`, `admerge`, `zipjoin`, `zipmerge`) are implemented in [`/src/core/coalesce.ts`](/src/core/coalesce.ts)
- path traversal supports arrays in [`/src/core/path.ts`](/src/core/path.ts)
- profile overlays support ordered multi-priority selection in [`/src/figment.ts`](/src/figment.ts)
- Env has parser and empty-value controls in [`/src/providers/env.ts`](/src/providers/env.ts)
- error taxonomy and structured detail are significantly improved in [`/src/core/error.ts`](/src/core/error.ts)

The remaining work is mostly about API hardening, consistency, and making intentional parity/divergence decisions explicit.

## How To Use This Document

When picking up work:

1. Choose one workstream.
2. Implement the recommendation (or explicitly choose an alternative).
3. Satisfy the acceptance criteria.
4. Update docs/tests in the same change.

Avoid mixing many workstreams in one commit unless the changes are deeply coupled.

## Workstream 1: Extraction Safety Contract

### Why this matters

`extract<T>()` can return a cast when no decoder is provided. This is ergonomic, but can hide runtime shape mismatches.

Relevant API: [`/src/figment.ts`](/src/figment.ts)

### Strong recommendation

Make strict decode the default for 1.0 and keep cast-based extraction as explicitly unsafe.

- Keep `extractWith()` as the strict path.
- Keep cast extraction, but rename to something explicit like `extractUnchecked<T>()`.
- Optionally keep `extract<T>()` as strict alias to `extractWith()` in 1.0.

### Other viable options

- Keep current behavior and rely on docs only.
  - lowest migration cost
  - highest long-term bug risk
- Deprecate cast extraction entirely.
  - safest
  - may be too disruptive for existing users

### Acceptance criteria

- strict-vs-unsafe extraction behavior is unambiguous in API names
- README and examples use strict decode by default
- tests cover strict failure and unchecked behavior separately

## Workstream 2: Lock Multi-Profile Semantics

### Why this matters

Multi-profile overlays are implemented, but 1.0 needs explicit behavioral guarantees (ordering, dedupe, built-in handling, and interaction with `profile()`).

Relevant API: [`/src/figment.ts`](/src/figment.ts)

### Strong recommendation

Freeze this contract and document it as normative:

- effective order is always `default -> selected overlays -> global`
- `selectProfiles()` and `spliceProfiles()` normalize and dedupe custom profiles
- built-ins (`default`, `global`) are not stored in selected overlays
- `profile()` returns first selected custom profile or `default`

### Other viable options

- allow `default`/`global` inside selected overlays
  - more flexible surface
  - harder to reason about and easier to misuse
- remove `profile()` from public API to avoid ambiguity
  - cleaner model
  - breaks parity expectations for single-profile users

### Acceptance criteria

- behavior documented in [`/README.md`](/README.md)
- table-driven tests cover ordering/normalization/edge cases
- no open ambiguity in API docs around `profile()`

## Workstream 3: Complete Error Ergonomics

### Why this matters

Taxonomy is stronger now, but users still need easier handling/iteration for chained errors and adapters from decoder ecosystems.

Relevant code: [`/src/core/error.ts`](/src/core/error.ts)

### Strong recommendation

Add two small but high-impact capabilities:

1. chain iteration helper (`errors()` generator or `toArray()`)
2. adapter helpers for common decoder failures into `FigmentErrorKind`

This keeps error handling structured without overgrowing the core.

### Other viable options

- keep `count()` + `previous` only
  - simple, but awkward to consume
- build full serde-like parity (`UnknownVariant`, `UnknownField`, etc. everywhere)
  - high fidelity
  - larger implementation surface than needed in TS

### Acceptance criteria

- ergonomic chain traversal exists and is tested
- decoder integration examples produce typed `FigmentError` consistently
- `toString()` remains readable and deterministic

## Workstream 4: Public Provenance Introspection Surface

### Why this matters

Current provenance lookup is strong for winner metadata, but container ambiguity and debugging still require more introspection.

Relevant APIs: [`/src/figment.ts`](/src/figment.ts), [`/src/core/path.ts`](/src/core/path.ts)

### Strong recommendation

Add focused public introspection APIs:

- `findTag(path)` for advanced provenance consumers
- `findMetadataAll(path)` for container/multi-source views
- `explain(path)` returning `{ value, tag, metadata, profile }` for diagnostics

Start with `findTag(path)` + `explain(path)` if scope needs to stay small.

### Other viable options

- keep only `findMetadata(path)`
  - minimal API
  - reduced observability for debugging and tooling
- expose internal maps directly
  - maximum flexibility
  - weak encapsulation and stability risk

### Acceptance criteria

- at least one new introspection API lands and is documented
- behavior for container paths is deterministic and test-covered
- no leakage of mutable internal structures

## Workstream 5: Metadata Source Model Tightening

### Why this matters

`MetadataSource.kind` is currently open-ended (`string`), which weakens type safety and formatting consistency.

Relevant code: [`/src/core/metadata.ts`](/src/core/metadata.ts)

### Strong recommendation

Move to a discriminated union source model for 1.0, for example:

- `{ kind: 'file', path: string }`
- `{ kind: 'env', selector: string }`
- `{ kind: 'inline', descriptor: string }`
- `{ kind: 'code', location: string }`
- `{ kind: 'custom', value: string }`

Keep helper constructors and centralize formatting logic.

### Other viable options

- keep current flat model
  - low migration effort
  - less safe and less expressive
- add a builder without changing source shape
  - ergonomic improvement
  - limited type-level gains

### Acceptance criteria

- source typing prevents invalid `kind` strings at compile time
- all providers emit typed source variants
- source formatting remains backward-compatible in user-visible output

## Workstream 6: Data Provider Parity Additions

### Why this matters

Core data providers are good, but some parity edges remain (notably extended YAML behavior).

Relevant code: [`/src/providers/data.ts`](/src/providers/data.ts), [`/src/providers/index.ts`](/src/providers/index.ts)

### Strong recommendation

Add `YamlExtended` (or equivalent) with explicit semantics and tests.

If extended YAML merge keys are intentionally unsupported, document that clearly and keep plain `Yaml` only.

### Other viable options

- defer `YamlExtended` until post-1.0
  - reduces scope now
  - may surprise users expecting figment2 feature parity

### Acceptance criteria

- either `YamlExtended` exists with tests, or explicit non-parity documentation exists
- provider exports/docs are synchronized

## Workstream 7: Magic-Value Strategy (Parity Decision)

### Why this matters

Rust figment2 has magic-value patterns (`Tagged<T>`, `RelativePathBuf`) that are not naturally portable to TS.

### Strong recommendation

Do not force direct parity. Instead define TS-native equivalents:

- `extractTagged(path)` returning value + metadata/tag
- source-relative path helper from metadata for file-based providers

Treat these as convenience APIs, not type-system magic.

### Other viable options

- full parity attempt with heavy abstractions
  - likely over-engineered in TS runtime
- no equivalent APIs
  - simpler core
  - loses useful provenance ergonomics

### Acceptance criteria

- explicit decision documented: implement equivalents or declare intentional non-parity
- if implemented, examples show practical usage

## Workstream 8: Provider Profile Contract Clarification

### Why this matters

Providers expose `selectedProfile?()` while Figment now has multi-overlay extraction selection. This relationship must stay clear.

Relevant interface: [`/src/provider.ts`](/src/provider.ts)

### Strong recommendation

Document and enforce this rule:

- provider profile chooses destination profile for emitted data
- provider profile does not rewrite selected overlay list (except optional seed behavior when empty)

Keep current implementation behavior and codify it as contract.

### Other viable options

- remove provider-selected profile from interface
  - cleaner separation
  - bigger migration and parity change

### Acceptance criteria

- provider contract documented in API docs
- tests cover seed/no-rewrite semantics

## Workstream 9: Parity Fixtures and Regression Matrix

### Why this matters

Without fixture parity, subtle behavior drift is likely as API evolves.

### Strong recommendation

Create parity fixtures mirroring critical figment2 cases:

- env split + numeric zip assembly
- profile overlay winner precedence
- provenance winner for nested/container paths
- decode and missing-field error formatting

Prefer table-driven tests for compactness and readability.

### Other viable options

- rely on ad hoc tests only
  - less upfront effort
  - weaker regression protection

### Acceptance criteria

- high-risk behaviors are covered by fixture tests
- tests are easy to extend with new parity cases

## Workstream 10: Documentation/Parity Contract Cleanup

### Why this matters

Some project docs still describe old gap states; this can mislead contributors and users.

Relevant docs: [`/doc/parity-assessment.md`](/doc/parity-assessment.md), [`/doc/gaps.md`](/doc/gaps.md), [`/README.md`](/README.md)

### Strong recommendation

Do one dedicated documentation reconciliation pass and keep a short "intentional divergences" section.

Document clearly:

- what is now parity
- what is intentionally different
- what is deferred post-1.0

### Other viable options

- update docs opportunistically
  - low immediate cost
  - tends to leave long-lived drift

### Acceptance criteria

- parity docs reflect current implementation reality
- intentional non-parity list is concise and explicit
- README examples match actual API exactly

## Suggested Execution Order

Recommended sequence for minimal churn and maximum stability:

1. extraction safety contract
2. lock multi-profile semantics
3. provider profile contract docs/tests
4. metadata source model tightening
5. provenance introspection APIs
6. error ergonomics completion
7. data provider parity additions
8. magic-value strategy decision
9. parity fixture matrix
10. documentation reconciliation pass

## 1.0 Readiness Checklist

- [ ] extraction strictness contract is finalized
- [ ] multi-profile semantics are frozen and documented
- [ ] provider profile contract is explicit and tested
- [ ] metadata source model is typed and stable
- [ ] provenance introspection is sufficient for debugging
- [ ] error ergonomics are complete for practical handling
- [ ] parity-critical fixtures protect against regressions
- [ ] parity docs and README are up-to-date

## Final Guidance

For this project, the best 1.0 outcome is not strict line-by-line parity with Rust figment2. The best outcome is:

- parity where behavior is core to composition/provenance correctness
- explicit and well-documented divergence where TS runtime realities differ
- stable API contracts that users can trust

When in doubt, optimize for deterministic behavior, testability, and clear public contracts.
