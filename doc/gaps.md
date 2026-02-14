# Figment Parity Rundown (TypeScript vs Rust)

You are right to push for a fuller, sharper parity doc. This version is the
canonical rundown of what we have, what we do not, and why it matters.

Legend:

- `Aligned`: behavior is intentionally close to Rust Figment.
- `Partial`: meaningful implementation exists, but parity gaps remain.
- `Missing`: capability not present yet.

## Snapshot summary

- Composition semantics (`join`/`merge`/`adjoin`/`admerge`): `Aligned`
- Metadata and provenance plumbing: `Partial`
- Provider metadata-map contract: `Partial` (Figment-specific, not provider-general)
- Source model parity: `Partial`
- Metadata builder ergonomics: `Missing`
- Error + diagnostic parity: `Partial`
- Value + magic-value parity: `Missing`
- Provider feature parity: `Partial`
- Parity fixture/testing depth: `Partial`

## 1) Composition semantics

Status: `Aligned`

Implemented:

- four strategies with expected conflict behavior
- recursive dict coalescing
- array strategy differences match Figment intent
- profile selection and `default` + `global` overlay behavior

Needs more proof:

- broader edge fixtures for mixed-type nested collisions

## 2) Metadata and provenance core

Status: `Partial`

Implemented:

- first-class tag tree with container-level tags (`dict`, `array`, `scalar`)
- `findMetadata(path)` and `getMetadata(tag)`
- container path metadata support (Figment-like direction)
- collision-safe tag remapping when composing figments
- `provideLocation` captured when adding providers

Still different from Rust:

- Rust tag model embeds profile bits and metadata id in a single opaque tag.
- TS tag is numeric and profile is tracked separately.
- `provideLocation` uses stack parsing in TS; Rust uses `Location::caller()`.

Why this matters:

- correct attribution for "which source won this key"
- reliable provenance under deeply composed figments

## 3) Provider metadata-map contract (explicit callout)

Status: `Partial`

Rust behavior:

- `Provider::__metadata_map()` lets any provider provide a metadata map.
- Figment merges this map before coalescing values/tags.

Current TS behavior:

- metadata-map preservation works when merging `Figment` into `Figment`.
- there is no provider-general metadata-map hook yet.

Gap:

- custom providers cannot currently contribute preserved metadata maps directly.

What to implement:

- add a provider hook (TS equivalent to `__metadata_map()`), for example:
  - `metadataMap?(): Map<Tag, Metadata>`
  - optional companion hook for tag-tree-aware data if needed
- make compose path generic (not `instanceof Figment` special-case)

Acceptance criteria:

- non-Figment providers can preserve metadata maps through composition
- no provenance collapse under provider chains

## 4) Source model parity (explicit callout)

Status: `Partial`

Rust model:

- `Source::File(PathBuf)`
- `Source::Code(Location)`
- `Source::Custom(String)`
- helper methods and display behavior (`file_path`, `code_location`, `custom`)

Current TS model:

- structured source with open `kind` + `value`
- known helpers for file/env/inline
- open source-kind extensibility for external providers

Gaps:

- no typed source helper API parity (`filePath()`, `codeLocation()`, etc.)
- no Rust-like display normalization (for example relative file display)
- no `Code` source modeled as a typed variant separate from `provideLocation`

What to implement:

- promote source to richer discriminated union shape (while keeping extensibility)
- add typed helpers and consistent formatter rules

## 5) Metadata builder ergonomics (explicit callout)

Status: `Missing`

Rust ergonomics:

- `Metadata::named(...)`
- `.source(...)`
- `.interpolater(...)`
- fluent composability on metadata itself

Current TS ergonomics:

- helper constructors (`metadataNamed`, `metadataFromFile`, etc.)
- direct assignment for interpolation overrides in providers

Gap:

- no fluent builder API, less expressive for custom providers

What to implement:

- fluent metadata builders, for example:
  - `MetadataBuilder.named("...").source(...).interpolater(...).build()`
- or immutable chain helpers on metadata objects

## 6) Error and diagnostics parity

Status: `Partial`

Implemented:

- `FigmentError` carries path/profile/tag/metadata + chaining
- source-aware string formatting

Gaps:

- not full Rust-style aggregate behavior (count/iterator/order semantics)
- incomplete deep retag/resolution parity across all decode paths
- less complete typed mismatch diagnostics than serde-backed Rust path

## 7) Value layer and magic values (explicit callout)

Status: `Missing`

Rust capabilities not yet present:

- `Tagged` magic extraction patterns
- `RelativePathBuf` source-aware path behavior
- broader magic-value ecosystem depending on metadata fidelity

Why this matters:

- metadata parity is only fully useful if magic consumers can leverage it

## 8) Provider feature parity

Status: `Partial`

Implemented:

- `Serialized`, `Env`, `Data` (`Json`, `Toml`, `Yaml`)

Gaps:

- no `YamlExtended` parity
- insufficient edge-case fixture coverage for env/data source behavior

## 9) Testing and verification parity

Status: `Partial`

Implemented:

- unit tests for composition + provenance behavior

Gaps:

- no parity fixture suite matching broad Rust examples/docs
- no `Jail`-like isolation harness equivalent
- limited regression fixtures for metadata-map provider-general behavior

## Priority implementation order

1. Provider-general metadata-map contract (close biggest provenance architecture gap).
2. Source model parity upgrades (typed source helpers + display semantics).
3. Metadata builder ergonomics (fluent provider-facing API).
4. Error aggregate and deep retag/resolution parity.
5. Magic-value parity (`Tagged`, source-aware path helpers).
6. `YamlExtended` and provider edge fixtures.
7. Expanded parity fixture matrix.

## Close-parity checklist

- [ ] metadata never collapses across provider/figment composition
- [ ] provider metadata-map hook exists and is used generically
- [ ] source model supports typed helper access and stable formatting rules
- [ ] metadata builder ergonomics are fluent and documented
- [ ] error aggregate behavior is deterministic and rich
- [ ] magic-value features relying on metadata are implemented
- [ ] provider edge behavior is fixture-validated against Rust expectations
- [ ] intentional deviations are explicit and documented
