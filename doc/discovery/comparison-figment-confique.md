# Figment vs confique for logging-library architecture

## Scope and method

This document compares:

- `SergioBenitez/Figment` (Rust crate `figment`)
- `LukasKalbertodt/confique` (Rust crate `confique`)

with an explicit focus on what matters when designing a new logging library configuration subsystem.

All code links point to pinned commits and include line numbers:

- Figment commit: `12dd1bc96bdd69417803bc794b6953d89c3a1af1`
- confique commit: `63afcdcf341471acd82a33b302f582c4ab1820ff`


## Executive contrast

At a high level:

- **Figment is a dynamic configuration aggregation engine** centered on a tagged runtime value tree and a provider abstraction ([`Provider` trait](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/provider.rs#L83-L102), [`Figment` state](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/figment.rs#L100-L104)).
- **confique is a schema-first, derive-driven layer system** centered on generated partial layer structs merged by fallback and finalized into a typed config ([`Config` and `Layer` traits](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/lib.rs#L571-L697), [derive macro entry](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/macro/src/lib.rs#L10-L16)).

For logging libraries specifically:

- Choose **Figment-style** when you need pluggable sources, rich provenance, profile-aware overrides, and deep runtime composition.
- Choose **confique-style** when you want strict schema ergonomics, predictable layered semantics, and compile-time generated boilerplate.


## Shared foundations (where they are similar)

Despite different architecture, both share important principles:

1. **Serde-based typed extraction**
   - Figment extracts any `Deserialize` type from combined values ([`extract`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/figment.rs#L483-L486)).
   - confique materializes your final strongly typed struct from a merged layer ([`Config::from_layer`](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/lib.rs#L589-L594)).

2. **Layered sources with precedence**
   - Figment merges/join sources in explicit order ([`join`/`merge` APIs](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/figment.rs#L209-L334)).
   - confique builder loads sources in order, earlier ones higher priority ([`Builder::load`](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/builder.rs#L49-L68)).

3. **Environment + file source support**
   - Figment: built-in env provider + format providers ([`Env`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/providers/env.rs#L15-L103), [`Data`/`Format`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/providers/data.rs#L10-L58)).
   - confique: env loading via generated layer logic + file source abstraction ([`Layer::from_env`](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/lib.rs#L674-L683), [`File`](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/file.rs#L6-L50)).

4. **Feature-gated format integrations**
   - Figment features (`toml`, `json`, `yaml`) in crate manifest ([features section](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/Cargo.toml#L17-L24)).
   - confique features (`toml`, `yaml`, `json5`) similarly gated ([features section](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/Cargo.toml#L41-L44)).


## Core architecture differences

### 1) Data model: dynamic value graph vs generated partial structs

**Figment**

- Internally stores a map of profiles to dictionaries: `Result<Map<Profile, Dict>>` ([state field](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/figment.rs#L100-L104)).
- Uses a custom runtime value algebra: `Value::{String, Bool, Num, Dict, Array, ...}` ([value enum](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/value/value.rs#L27-L42)).
- Tags every value with source/profile identity via `Tag` ([`Tag` design](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/value/tag.rs#L25-L67)).

**confique**

- Core abstraction is generated `Layer` type (all fields optional or nested layer) plus final typed config ([`Config::Layer` docs](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/lib.rs#L572-L580)).
- Derive macro generates layer struct and merge/default/env logic ([layer generation](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/macro/src/gen/mod.rs#L76-L163)).
- No universal dynamic value type exposed as central architecture; serde output maps directly into generated layer structs.

**Implication for logging lib**

- If you need runtime introspection, dynamic per-sink key spaces, and plugin-provided keys, Figment's model is a stronger fit.
- If your logging config is mostly stable schema (`sinks`, `levels`, `formats`, `rotation`) and you value compile-time structure, confique's model is simpler to reason about.


### 2) Composition semantics: multi-strategy coalescing vs single fallback law

**Figment** offers four conflict strategies:

- `join` (keep existing)
- `merge` (prefer incoming)
- `adjoin` / `admerge` (array concatenation variants)

Defined in public API and coalescing logic ([strategy docs](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/figment.rs#L22-L41), [implementation rules](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/coalesce.rs#L26-L50)).

**confique** has one canonical merge law:

- `self.with_fallback(fallback)` where self wins and fallback fills gaps ([trait contract](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/lib.rs#L684-L687), [builder usage](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/builder.rs#L55-L67)).

Macro-generated leaf merge uses `Option::or` semantics ([generated fallback expression](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/macro/src/gen/mod.rs#L335-L337)).

**Implication for logging lib**

- If your users need "append sink list" or "replace sink list" toggles per source, Figment's strategy richness maps better.
- If you want one predictable policy (first non-empty wins), confique's model lowers cognitive load.


### 3) Profiles and environments-of-config

**Figment** has first-class profiles:

- Built-in `default` and `global` profiles plus custom profiles ([profile constants](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/profile.rs#L60-L67)).
- Selected profile affects extraction ([`select`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/figment.rs#L346-L349), [merged default/global/profile behavior](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/figment.rs#L351-L363)).
- Providers can nest top-level keys as profiles ([`Data::nested`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/providers/data.rs#L164-L212)).

**confique** has no equivalent profile subsystem in core architecture; layering is source precedence + defaults.

**Implication for logging lib**

- If you need per-profile logging configs (`dev`, `prod`, `audit`) with global overlays, Figment gives this natively.
- With confique-style architecture, profile behavior would need to be modeled in your own schema (for example `profiles: HashMap<String, ProfileConfig>`) and custom selection logic.


### 4) Source provenance and attribution depth

**Figment provenance is unusually deep**:

- Metadata contains source name, source location, interpolation, provider callsite ([`Metadata` fields](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/metadata.rs#L72-L81)).
- Provider callsite captured in `Figment::provide` via `Location::caller` ([callsite assignment](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/figment.rs#L151-L156)).
- Tags associate values/errors with metadata/profile ([tag mapping](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/figment.rs#L161-L167), [error resolution](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/error.rs#L157-L168)).
- Errors include interpolated key + source in display output ([error display logic](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/error.rs#L479-L503)).

**confique provenance is simpler**:

- Errors identify missing field path, env key/field, file path/source, validation messages ([error variants](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/error.rs#L34-L91), [display rendering](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/error.rs#L111-L184)).
- No generic per-value metadata map retained after load.

**Implication for logging lib**

- For operational debugging ("why is sink X level WARN?"), Figment-style metadata is a major advantage.
- For standard app config ergonomics where "which key failed" is enough, confique error model is usually sufficient.


## Provider/source model and extensibility

### Figment: open provider trait ecosystem

- Pluggability is explicit via `Provider` trait ([trait definition](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/provider.rs#L83-L102)).
- Any provider returns `Map<Profile, Dict>` and metadata, so all sources become composable in one graph.
- `Format` trait lets data-format providers be implemented compactly ([`Format` trait](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/providers/data.rs#L438-L485)).

### confique: schema-driven source orchestration

- Extensibility is centered on how layers are obtained, not on runtime provider polymorphism.
- Builder supports `env`, `file`, and `preloaded(layer)` ([builder sources](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/builder.rs#L37-L47), [source enum](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/builder.rs#L71-L76)).
- You can load any serde source yourself into `Config::Layer`, then merge via `with_fallback` ([layer-based loading flow](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/lib.rs#L116-L127)).

**Architectural takeaway**

- Figment extensibility is **runtime-source polymorphism**.
- confique extensibility is **compile-time-schema + external deserializer composition**.


## Environment variable behavior

### Parsing and key mapping

**Figment Env provider**

- Can parse structured env values (`[]`, `{k=v}`, booleans, numbers, quoted strings) via `Value` parser ([provider docs](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/providers/env.rs#L21-L32), [parse implementation](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/value/parse.rs#L146-L176)).
- Rich key filtering/mapping (`prefixed`, `filter`, `map`, `split`, `only`, `ignore`) ([API cluster](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/providers/env.rs#L174-L485)).
- Case-insensitive key handling by default and optional lowercasing ([`lowercase`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/providers/env.rs#L339-L373)).

**confique env loading**

- Env vars are field-attached with `#[config(env = "KEY")]` and loaded into generated layer fields ([derive docs](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/lib.rs#L346-L368), [macro-generated env loading path](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/macro/src/gen/mod.rs#L359-L374)).
- Default env deserializer handles bool and scalar parsing ([env deserializer](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/env/mod.rs#L84-L113)).
- Complex env parsing is explicit per field via `parse_env` functions ([parse helpers](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/env/parse.rs#L31-L57)).

### Empty string semantics

- confique treats empty env string as unset *if deserialization/validation fails* ([`from_env` logic](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/internal.rs#L73-L85), tests in [`tests/env.rs`](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/tests/env.rs#L35-L106)).
- Figment has no equivalent field-level empty-as-unset policy; env values are just data in provider output ([`Env::data`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/providers/env.rs#L633-L644)).

**Implication for logging lib**

- confique-style is excellent for explicit, per-field env contracts.
- Figment-style is excellent for bulk env ingestion and dynamic key namespaces (for example `LOG_SINKS_FILE__LEVEL`).


## File handling behavior

### Figment

- `Data::file` can search parent directories for relative paths by default ([search behavior](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/providers/data.rs#L78-L83), [`resolve`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/providers/data.rs#L335-L354)).
- Missing file is empty source unless `required(true)` ([required semantics](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/providers/data.rs#L214-L220), [error path](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/providers/data.rs#L378-L383)).

### confique

- `File::new` infers format by extension and errors on unknown/missing extension ([format inference](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/file.rs#L18-L29), [`FileFormat::from_extension`](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/file.rs#L110-L126)).
- Missing file returns empty layer unless required ([load behavior](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/file.rs#L51-L61), [`required`](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/file.rs#L41-L47)).

**Notable difference**

- Figment has built-in parent-directory upward search; confique does not.


## Defaults, requiredness, and validation

### confique has first-class default/required/validation schema semantics

- Requiredness derives from non-`Option` fields and checked in generated `Config::from_layer` ([required unwrap generation](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/macro/src/gen/mod.rs#L40-L47)).
- Default values from attributes become generated `Layer::default_values` code ([default generation](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/macro/src/gen/mod.rs#L342-L356)).
- Field validators execute during deserialization path; struct validators execute after merge ([validate helpers](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/internal.rs#L34-L50), [macro wiring](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/macro/src/gen/mod.rs#L235-L279)).

### Figment delegates required/default behavior mostly to serde + user model

- You generally encode defaults via serde defaults or by merging explicit default provider values ([library guidance in docs](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/lib.rs#L460-L488)).
- Missing keys surface as extraction errors (`MissingField`) ([missing key handling](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/figment.rs#L741-L745)).

**Implication for logging lib**

- If you want declarative validation attributes and schema-driven errors out of the box, confique architecture leads.
- If validation will be custom policy engine anyway (for example sink graph consistency), Figment's generic model may be enough.


## Metadata and introspection features

This is one of the largest strategic gaps.

### Figment introspection capabilities

- Query raw values by path: [`find_value`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/figment.rs#L741-L745).
- Query if path exists: [`contains`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/figment.rs#L786-L788).
- Query metadata for path/tag: [`find_metadata`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/figment.rs#L818-L820), [`get_metadata`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/figment.rs#L851-L853).
- Preserve source tags into deserialized types via magic wrapper: [`Tagged<T>`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/value/magic.rs#L529-L563).
- Path-relative semantics from source file metadata: [`RelativePathBuf`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/value/magic.rs#L25-L32).

### confique introspection capabilities

- Static schema metadata (`Config::META`) with docs, env keys, defaults represented as AST-like expression tree ([meta types](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/meta.rs#L10-L61)).
- Template generation across TOML/YAML/JSON5 from schema metadata ([template core](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/template.rs#L144-L160), [toml template](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/toml.rs#L94-L98)).
- No runtime per-value provenance map analogous to Figment tags/metadata.

**Implication for logging lib**

- For runtime explainability (effective config provenance), Figment is stronger.
- For human-facing config docs/templates, confique is stronger.


## Error model and diagnostics

### Figment

- Error kind taxonomy modeled after serde errors + unsupported/key-specific variants ([`Kind`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/error.rs#L103-L141)).
- Error chaining supports multiple source failures ([`chain` and iteration](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/error.rs#L236-L296)).
- Display can include interpolated key and source metadata ([display impl](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/error.rs#L479-L503)).

### confique

- Focused domain errors: missing value, env parse/deser, file format issues, validation failures ([`ErrorInner`](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/error.rs#L34-L91)).
- Simpler and user-friendly display text; source chain available through standard `Error::source` ([source impl](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/error.rs#L93-L109)).

**Tradeoff**

- Figment: richer diagnostics, higher internal complexity.
- confique: narrower diagnostics, lower conceptual overhead.


## Macro and compile-time machinery

### Figment

- No derive macro at core architecture level; focuses on runtime composition engine.

### confique

- Heavy macro-driven codegen is fundamental:
  - Parse derive input and config attributes ([parser](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/macro/src/parse.rs#L15-L40)).
  - Build IR of field kinds/defaults/env/validation ([IR definitions](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/macro/src/ir.rs#L28-L59)).
  - Generate layer struct, merge/default/env methods, helper validators ([generator](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/macro/src/gen/mod.rs#L113-L163)).
  - Generate static schema metadata constants ([meta generator](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/macro/src/gen/meta.rs#L67-L73)).

**Implication for logging lib**

- Macro-heavy design buys ergonomics but increases maintenance complexity and compile-time coupling.
- Runtime-engine design keeps API flexible for ecosystem extensions.


## Testing strategy signals

- Figment ships a specialized `Jail` for deterministic env/filesystem test isolation ([`Jail` behavior](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/jail.rs#L15-L27)).
- confique validates derive behavior extensively via tests around env/default/validation edge cases ([env tests](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/tests/env.rs#L9-L20), [validation tests](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/tests/validation.rs#L42-L163)).

**Design signal**

- Figment prioritizes runtime source-composition correctness and provenance.
- confique prioritizes schema/macro contract correctness.


## Practical design guidance for a new logging library

### What to copy from Figment

1. **Per-value provenance tagging** for explainability and supportability.
2. **Pluggable provider abstraction** for future sources (remote config, sidecars, dynamic control plane).
3. **Multiple merge strategies** for list-like logging config fields (`sinks`, `filters`).
4. **Key-path querying/introspection APIs** to power diagnostics commands.

Relevant references: [`Tag` model](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/value/tag.rs#L25-L67), [`provide`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/figment.rs#L142-L167), [`find_value`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/figment.rs#L741-L745).

### What to copy from confique

1. **Schema-first user ergonomics** via derive + attributes.
2. **First-class defaults and validation in schema**.
3. **Config template generation from metadata** for operator onboarding.
4. **Simple fallback precedence mental model** as default mode.

Relevant references: [`Config` trait flow](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/lib.rs#L595-L600), [macro default/validate generation](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/macro/src/gen/mod.rs#L342-L356), [template formatter core](https://github.com/LukasKalbertodt/confique/blob/63afcdcf341471acd82a33b302f582c4ab1820ff/src/template.rs#L163-L227).


## Suggested hybrid architecture for logging

The strongest architecture for a new logging library is likely hybrid:

1. **Schema layer (confique-like)**
   - Derive-driven typed config structs.
   - Field-level env binding and validation.
   - Static metadata for docs/templates.

2. **Runtime aggregation core (figment-like)**
   - Normalize all sources into tagged value tree.
   - Merge with configurable strategies (especially list semantics).
   - Keep provenance graph for explainability.

3. **Finalization bridge**
   - Deserialize tagged merged tree into typed schema.
   - Preserve side-channel provenance map keyed by config path or stable field IDs.

4. **Operator UX features**
   - `--print-effective-config`
   - `--explain-config-key <path>` (show source, merge path, profile)
   - `--generate-config-template <format>`


## Decision matrix (for your project)

- If your top risk is **misconfiguration debugging in production**, bias toward Figment mechanisms.
- If your top risk is **config API complexity for users**, bias toward confique mechanisms.
- If you need both (common for logging), implement the hybrid split: compile-time schema + runtime provenance core.


## Bottom line

Figment and confique are not just two implementations of the same idea; they optimize for different architectural centers of gravity:

- Figment optimizes **runtime composability, provenance, and expressive merge semantics**.
- confique optimizes **schema ergonomics, compile-time generation, and low-friction layered loading**.

For a modern logging library, where both operability and usability matter, the best-informed path is to borrow confique's schema ergonomics and template metadata, while adopting Figment's provenance and source-composition model for runtime behavior and diagnostics.


## Appendix A: Figment profiles explained

If profiles in Figment have felt confusing, the shortest accurate mental model is:

- A Figment stores config as **multiple dictionaries keyed by profile name**.
- At extraction time, Figment computes an **effective dictionary** by combining:
  1. `default` profile
  2. selected profile (if custom)
  3. `global` profile
- Then it deserializes that effective dictionary into your target type.

Core references:

- Profile concepts in crate docs: [top-level profile docs](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/lib.rs#L195-L212)
- Built-in profile constants: [`Profile::Default` / `Profile::Global`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/profile.rs#L60-L67)
- Selection API: [`Figment::select`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/figment.rs#L346-L349)
- Effective merge algorithm: [`Figment::merged`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/figment.rs#L351-L363)


### A.1 The three profile categories

1. **`default`**
   - Baseline values used for all extractions.
   - If nothing else is selected, this is what you get.

2. **Custom profile** (for example `debug`, `staging`, `prod`)
   - Selected via `figment.select("debug")`.
   - Overrides `default` where it has values.

3. **`global`**
   - Cross-cutting override layer.
   - Applied last in effective merge, so it supersedes both `default` and selected custom profile.

The exact order is visible in code:

- custom selected: `def.merge(selected).merge(global)`
- otherwise: `def.merge(global)`

See: [`merged()` implementation](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/figment.rs#L357-L360).


### A.2 Where profiles come from

Providers always produce `Map<Profile, Dict>` ([`Provider::data`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/provider.rs#L88-L90)).

In practice, profile emission usually happens in one of two modes:

- **Unnested mode**: all parsed values go to a single profile (commonly `default`).
- **Nested mode**: top-level keys are interpreted as profile names.

For file providers (`Toml`, `Json`, `Yaml` via `Data<F>`):

- `nested()` switches to top-level-as-profile behavior ([`Data::nested`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/providers/data.rs#L164-L212)).
- Without `nested()`, data is emitted to one profile (default unless changed) ([profile field behavior](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/providers/data.rs#L61-L64), [`profile()` setter](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/providers/data.rs#L313-L333)).

For env provider:

- Values go to one profile (`default` by default), configurable with `.profile(...)` or `.global()` ([env profile field](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/providers/env.rs#L106-L108), [setters](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/providers/env.rs#L552-L571)).


### A.3 What `select()` actually does (and does not do)

- `select("debug")` sets the profile used during extraction; it does **not** mutate stored provider data ([`select`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/figment.rs#L346-L349)).
- The selected profile is read in `merged()` when assembling the effective map ([`merged`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/figment.rs#L357-L360)).

This means you can build one Figment and extract multiple profile views:

- `figment.extract::<T>()` -> default/global view
- `figment.select("staging").extract::<T>()` -> staging/global/default-combined view


### A.4 Concrete precedence walkthrough

Suppose nested TOML defines:

- `default.level = "info"`
- `debug.level = "debug"`
- `global.level = "warn"`

Effective result:

- selected `default` -> `warn`
- selected `debug` -> `warn`

Why? Because `global` is merged last.

This behavior is explicitly demonstrated in Figment docs example showing global overrides ([example assertions](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/lib.rs#L266-L285)).


### A.5 Relationship between profile semantics and merge/join order

There are two orthogonal layers of precedence:

1. **Provider combination order and strategy** (`merge` vs `join` etc.) decides what each profile dictionary contains after source aggregation ([provider integration](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/figment.rs#L142-L167)).
2. **Profile finalization** (`default` + selected + `global`) decides what extraction sees ([`merged`](https://github.com/SergioBenitez/Figment/blob/12dd1bc96bdd69417803bc794b6953d89c3a1af1/src/figment.rs#L351-L363)).

This is a common source of confusion: changing `merge`/`join` may not produce expected extraction if `global` later overrides the same key.


### A.6 Practical logging patterns with profiles

Good profile uses for a logging library:

- Put safe defaults in `default` (for example `level=info`, console sink enabled).
- Put environment-specific changes in custom profiles (`dev`, `prod`, `audit`).
- Use `global` sparingly for true forced overrides (for example emergency rate-limit or hard-disable noisy sink).

Anti-pattern:

- Treating `global` as "shared defaults". It is not that; it is a high-precedence override layer.


### A.7 A quick rule-of-thumb summary

- `default` = baseline
- custom selected profile = environment overlay
- `global` = force override

And if you forget everything else, remember this extraction equation:

- `effective = default (+ selected custom, if any) + global`

where later `+` means "wins on conflicts" under normal merge semantics.
