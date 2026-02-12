# Parity Gaps vs Rust Figment

This document expands on the statement:

> "I can next tighten parity with Rust Figment around richer metadata/tag provenance and multi-error chaining behavior."

## What exists now in this TypeScript port

- Providers expose a `metadata()` object (`name`, optional `source`, `interpolate`).
- `Figment` stores provider metadata entries and tracks a single failure chain.
- Basic `FigmentError.chain()` behavior exists for stacking provider failures.
- `extract`, `extractInner`, and `findValue` raise typed errors for missing paths.

This is enough for practical use, but still less precise than Rust Figment.

## Gap 1: Metadata/tag provenance

Rust Figment tags every collected value with provenance that can be traced back to:

- the exact provider metadata,
- the profile context,
- and where the provider was introduced into the figment.

In this TS port, metadata is tracked at provider level, not per final value node.
That means we currently cannot always answer:

- Which provider produced this exact nested value?
- Was this value replaced during `merge` or retained during `join`?
- Which source path should be interpolated for this particular failing leaf?

### Why this matters

- Better error attribution (specific key + source + provider context).
- Better debugging for layered config (file + env + serialized + profile overrides).
- Better feature parity for "magic" value behaviors that depend on origin.

### Tightening plan

1. Introduce a `Tag` model and attach tags to all `ConfigValue` nodes.
2. Preserve/transform tags during `join`/`merge`/`adjoin`/`admerge` coalescing.
3. Store tag-to-metadata map in `Figment` and expose metadata lookups.
4. Add APIs analogous to Rust behavior:
   - `findMetadata(path)`
   - `getMetadata(tag)`
5. Update path lookup and extraction to preserve error-to-tag linkage.

## Gap 2: Multi-error chaining behavior

Rust Figment can accumulate and retain multiple provider/extraction errors while
preserving ordering and context for each error.

Current TS behavior chains errors, but in a simplified way:

- chaining semantics are present,
- ordering and context fidelity are limited,
- and display formatting is less structured than Rust Figment.

### Why this matters

- Real config stacks fail in multiple places; users need complete diagnostics.
- Provider parse failures should not hide earlier failures.
- Rich error display reduces iteration cycles during config debugging.

### Tightening plan

1. Rework `FigmentError` into a first-class aggregate that supports:
   - deterministic ordering,
   - count/introspection helpers,
   - iterable traversal of chained errors.
2. Preserve per-error context fields:
   - path,
   - profile,
   - metadata,
   - tag.
3. Ensure provider failures and extraction failures both join the same chain.
4. Align message formatting with Rust Figment style:
   - kind,
   - interpolated key,
   - source/provider suffix,
   - newline-separated chained entries.

## Suggested implementation slices

- **Slice A:** Add tag plumbing in core value/coalesce/path modules.
- **Slice B:** Add metadata lookup API surfaces and tests.
- **Slice C:** Upgrade error aggregation model and formatter.
- **Slice D:** Add parity tests based on Rust Figment semantics for merge/join
  precedence, per-key attribution, and multi-error output.

## Acceptance criteria for parity tightening

- Conflicting keys report source metadata from the value that actually wins.
- `findMetadata(path)` returns stable metadata for nested paths.
- Multiple provider failures are retained and enumerable in order.
- Error output includes key path interpolation and source/provider context.
- Existing merge/join/admerge/adjoin tests remain green.
