# Inventory: Derive-Driven Typed Config Systems

This document inventories derive-driven configuration systems for informing the typed config architecture of this logging library project.

---

## Journal - Research Process

### Journal - Initial Context Review

**Investigated:**
- Existing discovery docs in [`/doc/discovery/`](.)
- [`bending-ts.md`](./bending-ts.md) - Architectural options for Figment adaptation
- [`metadata.md`](./metadata.md) - Current metadata/provenance implementation

**Key Findings:**
- Project is a TypeScript port of Rust's Figment philosophy
- Already has core provider system, coalescing, and metadata tracking
- Existing docs explore policy-native merging, typed overlays, dual-plane config, explainability, and context dimensions
- Metadata gap analysis shows multi-source introspection, public tag lookup, and provenance debug surface needed

**Open Questions:**
- Should typed projection use TypeScript decorators or a different approach?
- How to implement derive-like capabilities in TypeScript without Rust's proc-macros?

---

### Journal - Confique Analysis

**Source:** [`/home/rektide/archive/LukasKalbertodt/confique`](file:///home/rektide/archive/LukasKalbertodt/confique)

**Investigated:**
- [`README.md`](file:///home/rektide/archive/LukasKalbertodt/confique/README.md) - Overview and features
- [`src/lib.rs`](file:///home/rektide/archive/LukasKalbertodt/confique/src/lib.rs) - Core trait definitions and derive macro docs
- [`macro/src/lib.rs`](file:///home/rektide/archive/LukasKalbertodt/confique/macro/src/lib.rs) - Derive macro entry point
- [`macro/src/gen/mod.rs`](file:///home/rektide/archive/LukasKalbertodt/confique/macro/src/gen/mod.rs) - Code generation logic
- [`src/meta.rs`](file:///home/rektide/archive/LukasKalbertodt/confique/src/meta.rs) - Runtime metadata representation
- [`src/template.rs`](file:///home/rektide/archive/LukasKalbertodt/confique/src/template.rs) - Config template generation
- [`src/env/mod.rs`](file:///home/rektide/archive/LukasKalbertodt/confique/src/env/mod.rs) - Environment variable deserializer
- [`examples/clap.rs`](file:///home/rektide/archive/LukasKalbertodt/confique/examples/clap.rs) - CLI integration pattern

**Key Findings:**
- **Layer-based architecture**: Generates a parallel `Layer` struct with all `Option<T>` fields for partial configs
- **Compile-time schema**: `Config::META` constant provides runtime introspection
- **Derive attributes**: `default`, `env`, `parse_env`, `deserialize_with`, `validate`, `nested`
- **Template generation**: Auto-generates config file templates with docs, defaults, and env keys
- **Clap integration**: Uses `layer_attr(derive(clap::Args))` to derive CLI args from config layer

**Notable Code Patterns:**
```rust
// Layer struct generation - all fields become Option<T>
#[derive(serde::Deserialize)]
struct ConfLayer {
    color: Option<String>,
    #[serde(default = "confique::Layer::empty")]
    http: <HttpConf as confique::Config>::Layer,
}
```

**Open Questions:**
- How to replicate layer generation in TypeScript?
- Can TypeScript mapped types create the equivalent of `Layer` types?

---

### Journal - Figment2 Analysis

**Source:** [`/home/rektide/archive/lmmx/figment2`](file:///home/rektide/archive/lmmx/figment2)

**Investigated:**
- [`README.md`](file:///home/rektide/archive/lmmx/figment2/README.md) - Quick start
- [`src/lib.rs`](file:///home/rektide/archive/lmmx/figment2/src/lib.rs) - Full API documentation
- [`src/coalesce.rs`](file:///home/rektide/archive/lmmx/figment2/src/coalesce.rs) - Merge strategies
- [`src/metadata.rs`](file:///home/rektide/archive/lmmx/figment2/src/metadata.rs) - Provenance tracking
- [`src/provider.rs`](file:///home/rektide/archive/lmmx/figment2/src/provider.rs) - Provider trait
- [`src/providers/env.rs`](file:///home/rektide/archive/lmmx/figment2/src/providers/env.rs) - Env provider implementation
- [`src/value/magic.rs`](file:///home/rektide/archive/lmmx/figment2/src/value/magic.rs) - Magic values (RelativePathBuf, Tagged)

**Key Findings:**
- **Semi-hierarchical**: Profiles (default, global, custom) with layered resolution
- **Six merge orders**: `Merge`, `Join`, `Adjoin`, `Admerge`, `Zipjoin`, `Zipmerge`
- **Rich provenance**: Every value tagged with metadata including source file, code location
- **Magic values**: `RelativePathBuf` resolves relative to config file; `Tagged<T>` preserves tag
- **No derive macro**: Uses serde's `Deserialize` directly; no config-specific derive

**Merge Strategies (from [`coalesce.rs:5-12`](file:///home/rektide/archive/lmmx/figment2/src/coalesce.rs#L5-L12)):**
```rust
pub enum Order {
    Merge,     // incoming wins
    Join,      // current wins
    Adjoin,    // append arrays, current dict wins
    Admerge,   // append arrays, incoming dict wins
    Zipjoin,   // zip arrays, current wins for scalars
    Zipmerge,  // zip arrays, incoming wins for scalars
}
```

**Open Questions:**
- Should figment-js adopt all six merge orders or simplify?
- How to implement "magic values" in TypeScript?

---

### Journal - TypeScript/JavaScript Config Ecosystem

**Investigated:**
- Web search for TypeScript typed configuration libraries
- Zod schema validation approach

**Key Findings:**
- **Zod**: TypeScript-first schema validation with type inference
- **Decorator-based validation**: class-validator, fastest-validator-decorators
- **No direct equivalent** to Rust's derive-driven config with layering

**TypeScript Approaches:**
1. **Zod schemas**: `z.object({ port: z.number().default(8080) })`
2. **Decorators**: `@DefaultValue(8080) @EnvVar("PORT") port: number`
3. **Mapped types**: `type PartialConfig<T> = { [K in keyof T]?: T[K] }`

**Open Questions:**
- Decorators vs. schema-based approach for TypeScript?
- Can TypeScript 5.x decorator metadata help?

---

## System Inventory

### 1. Confique (Rust)

**Repository:** [LukasKalbertodt/confique](https://github.com/LukasKalbertodt/confique)  
**Local:** [`/home/rektide/archive/LukasKalbertodt/confique`](file:///home/rektide/archive/LukasKalbertodt/confique)

**Core Philosophy:**
Type-safe, layered configuration via derive macro. Generates a parallel `Layer` type for partial configs that merge with fallback semantics.

**Key Features:**

| Feature | Support | Notes |
|---------|---------|-------|
| Env binding | ✅ | `#[config(env = "KEY")]` with custom parsers |
| Defaults | ✅ | `#[config(default = value)]` - supports arrays, maps, primitives |
| Validation | ✅ | `#[config(validate = fn)]` or `#[config(validate(expr, "msg"))]` |
| Nested configs | ✅ | `#[config(nested)]` for hierarchical structures |
| File formats | ✅ | TOML, YAML, JSON5 (feature-gated) |
| Template generation | ✅ | Auto-generates example configs with docs |
| Runtime metadata | ✅ | `Config::META` constant for introspection |
| CLI integration | ✅ | Via `layer_attr(derive(clap::Args))` |

**Derive Macro Attributes:**

```rust
#[derive(Config)]
struct Conf {
    #[config(default = 8080, env = "PORT")]
    port: u16,

    #[config(env = "BIND", default = "127.0.0.1")]
    bind: IpAddr,

    #[config(nested)]
    log: LogConf,

    #[config(validate(!path.is_empty(), "path required"))]
    path: Option<String>,

    #[config(deserialize_with = parse_duration)]
    timeout: Duration,
}
```

**Layering/Precedence:**
- Higher-priority sources listed first in builder
- Final merge always includes `default_values()` layer
- `Layer::with_fallback(self, fallback)` uses `Option::or` semantics

**Error Handling:**
- Missing required fields: path-aware error with field name
- Validation failures: custom error message from validator
- Environment parse errors: type-specific error messages

**Metadata/Introspection:**
```rust
const META: Meta = Meta {
    name: "Conf",
    doc: &["struct doc comment"],
    fields: &[
        Field {
            name: "port",
            doc: &["Port to listen on"],
            kind: FieldKind::Leaf {
                env: Some("PORT"),
                kind: LeafKind::Required { default: Some(Expr::Integer(8080)) },
            },
        },
    ],
};
```

**References:**
- [`src/lib.rs:226-556`](file:///home/rektide/archive/LukasKalbertodt/confique/src/lib.rs#L226-L556) - Derive macro documentation
- [`src/meta.rs`](file:///home/rektide/archive/LukasKalbertodt/confique/src/meta.rs) - Metadata types
- [`src/template.rs`](file:///home/rektide/archive/LukasKalbertodt/confique/src/template.rs) - Template generation

---

### 2. Figment2 (Rust)

**Repository:** [lmmx/figment2](https://github.com/lmmx/figment2) (maintained fork of SergioBenitez/Figment)  
**Local:** [`/home/rektide/archive/lmmx/figment2`](file:///home/rektide/archive/lmmx/figment2)

**Core Philosophy:**
Semi-hierarchical, provider-based configuration with comprehensive value provenance tracking. No derive macro - uses serde's `Deserialize` directly.

**Key Features:**

| Feature | Support | Notes |
|---------|---------|-------|
| Env binding | ✅ | `Env::prefixed("APP_")` with filtering, mapping, splitting |
| Defaults | ✅ | Via `Serialized::defaults(config)` provider |
| Validation | ⚠️ | Via serde or post-extraction |
| Nested configs | ✅ | Natural via serde |
| File formats | ✅ | TOML, JSON, YAML (feature-gated) |
| Template generation | ❌ | No built-in support |
| Runtime metadata | ✅ | Every value tagged with `Metadata` |
| Magic values | ✅ | `RelativePathBuf`, `Tagged<T>`, `Either<A,B>` |
| Profiles | ✅ | Default, Global, custom profiles with nested sources |

**Provider Trait:**
```rust
pub trait Provider {
    fn metadata(&self) -> Metadata;
    fn data(&self) -> Result<Map<Profile, Dict>, Error>;
    fn profile(&self) -> Option<Profile> { None }
}
```

**Merge Strategies (Order enum):**

| Strategy | Dicts | Arrays | Scalars |
|----------|-------|--------|---------|
| `Merge` | incoming wins | incoming wins | incoming wins |
| `Join` | current wins | current wins | current wins |
| `Adjoin` | current wins | append | current wins |
| `Admerge` | incoming wins | append | incoming wins |
| `Zipjoin` | merge recursively | zip, current wins | current wins |
| `Zipmerge` | merge recursively | zip, incoming wins | incoming wins |

**Provenance/Metadata:**
```rust
pub struct Metadata {
    pub name: Cow<'static, str>,           // "TOML file", "env vars"
    pub source: Option<Source>,            // File, Code, Custom
    pub provide_location: Option<&'static Location>,  // Callsite
    interpolater: Box<dyn Interpolator>,   // Key path formatting
}
```

**Magic Values:**
- `RelativePathBuf`: Path resolved relative to config file location
- `Tagged<T>`: Wraps value with its provenance tag
- `Either<A, B>`: Deserialize as magic value A or regular value B

**References:**
- [`src/coalesce.rs:5-65`](file:///home/rektide/archive/lmmx/figment2/src/coalesce.rs#L5-L65) - Merge strategies
- [`src/metadata.rs`](file:///home/rektide/archive/lmmx/figment2/src/metadata.rs) - Metadata structure
- [`src/value/magic.rs:25-96`](file:///home/rektide/archive/lmmx/figment2/src/value/magic.rs#L25-L96) - RelativePathBuf

---

### 3. config-rs (Rust)

**Repository:** [rust-cli/config-rs](https://github.com/rust-cli/config-rs)

**Core Philosophy:**
Loosely-typed, hierarchical configuration with format-agnostic merging. Access values via string paths.

**Key Features:**

| Feature | Support | Notes |
|---------|---------|-------|
| Env binding | ✅ | Via `Environment` source |
| Defaults | ⚠️ | Set programmatically, not declarative |
| Validation | ❌ | Manual after extraction |
| Nested configs | ⚠️ | Via path strings (`"database.port"`) |
| File formats | ✅ | JSON, YAML, TOML, INI, JSON5 |
| Template generation | ❌ | No support |
| Runtime metadata | ❌ | No provenance tracking |
| Type safety | ❌ | `get::<T>("path")` at call site |

**Limitations:**
- No derive macro or schema definition
- Stringly-typed access prone to typos
- No "config template" without repeating code

**References:**
- [GitHub Issue #339](https://github.com/rust-cli/config-rs/issues/339) - Discussion of derive-macro possibilities

---

### 4. clap (Rust)

**Repository:** [clap-rs/clap](https://github.com/clap-rs/clap)

**Core Philosophy:**
Command-line argument parsing via derive macro. Can be combined with config libraries.

**Key Features:**

| Feature | Support | Notes |
|---------|---------|-------|
| Derive macro | ✅ | `#[derive(Parser)]` |
| Env binding | ✅ | `#[arg(env)]` |
| Defaults | ✅ | `#[arg(default_value_t = 80)]` |
| Validation | ⚠️ | Via `value_parser` |
| Nested/subcommands | ✅ | `#[command(subcommand)]` |
| Help generation | ✅ | Automatic |

**Integration with Config:**
Confique's [`examples/clap.rs`](file:///home/rektide/archive/LukasKalbertodt/confique/examples/clap.rs) shows pattern:
```rust
#[derive(Config)]
#[config(layer_attr(derive(clap::Args)))]
struct Conf {
    #[config(default = 8080)]
    #[config(layer_attr(arg(short, long)))]
    port: u16,
}

#[derive(Parser)]
struct Cli {
    #[command(flatten)]
    cli_config: <Conf as Config>::Layer,
}
```

---

### 5. serde (Rust)

**Repository:** [serde-rs/serde](https://github.com/serde-rs/serde)

**Core Philosophy:**
General-purpose serialization framework. Config libraries build on serde's `Deserialize`.

**Key Features:**

| Feature | Support | Notes |
|---------|---------|-------|
| Derive macro | ✅ | `#[derive(Deserialize)]` |
| Defaults | ✅ | `#[serde(default = "fn")]` |
| Validation | ❌ | Use garde or custom |
| Nested configs | ✅ | Natural |
| Renaming | ✅ | `#[serde(rename = "name")]` |
| Flatten | ✅ | `#[serde(flatten)]` - but [breaks error attribution](https://github.com/SergioBenitez/Figment/issues/80) |

**Limitations for Config:**
- No environment variable binding
- No layering/merging
- No template generation
- No provenance

---

### 6. Zod (TypeScript)

**Repository:** [colinhacks/zod](https://github.com/colinhacks/zod)

**Core Philosophy:**
TypeScript-first schema validation with type inference.

**Key Features:**

| Feature | Support | Notes |
|---------|---------|-------|
| Type inference | ✅ | `z.infer<typeof schema>` |
| Defaults | ✅ | `.default(value)` |
| Optional | ✅ | `.optional()` |
| Transformations | ✅ | `.transform()` |
| Composition | ✅ | `.merge()`, `.extend()` |
| Env binding | ❌ | Manual |
| Layering | ❌ | Manual |

**Example:**
```typescript
const ConfigSchema = z.object({
  port: z.number().default(8080),
  host: z.string().default("localhost"),
  log: z.object({
    level: z.enum(["debug", "info", "warn", "error"]).default("info"),
  }).default({ level: "info" }),
});

type Config = z.infer<typeof ConfigSchema>;
```

---

### 7. TypeScript Decorators

**Core Philosophy:**
Use Stage 3 decorators for metadata-rich class definitions.

**Example Pattern:**
```typescript
function EnvVar(key: string) {
  return (target: unknown, propertyKey: string) => {
    // Store metadata
    Reflect.defineMetadata("env:key", key, target, propertyKey);
  };
}

function Default<T>(value: T) {
  return (target: unknown, propertyKey: string) => {
    Reflect.defineMetadata("default", value, target, propertyKey);
  };
}

class Config {
  @EnvVar("PORT")
  @Default(8080)
  port!: number;
}
```

**Limitations:**
- Requires `experimentalDecorators` or TS 5.x
- No built-in validation
- No layering
- Metadata requires `reflect-metadata`

---

## Comparison Table

| Feature | Confique | Figment2 | config-rs | clap | serde | Zod |
|---------|----------|----------|-----------|------|-------|-----|
| **Type Safety** | ✅ Full | ✅ Full | ❌ Loose | ✅ Full | ✅ Full | ✅ Full |
| **Derive Macro** | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ (schema) |
| **Env Binding** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Defaults** | ✅ Declarative | ⚠️ Provider | ⚠️ Programmatic | ✅ | ✅ | ✅ |
| **Validation** | ✅ Built-in | ⚠️ Manual | ❌ | ⚠️ Parser | ❌ | ✅ |
| **Nested Configs** | ✅ | ✅ | ⚠️ Strings | ✅ | ✅ | ✅ |
| **Layering** | ✅ Layers | ✅ Profiles | ✅ Sources | ❌ | ❌ | ❌ |
| **Provenance** | ❌ | ✅ Rich | ❌ | ❌ | ❌ | ❌ |
| **Template Gen** | ✅ | ❌ | ❌ | ✅ Help | ❌ | ❌ |
| **Runtime Metadata** | ✅ META | ✅ Tags | ❌ | ❌ | ❌ | ⚠️ Schema |
| **Magic Values** | ❌ | ✅ | ❌ | ❌ | ❌ | ⚠️ Transforms |
| **Merge Policies** | 1 (fallback) | 6 | 1 | N/A | N/A | ⚠️ Manual |
| **Language** | Rust | Rust | Rust | Rust | Rust | TypeScript |

---

## Implementation Status: figment-js

### Current Capabilities

Based on [`/home/rektide/src/figment-js/src`](file:///home/rektide/src/figment-js/src):

| Capability | Status | Location |
|------------|--------|----------|
| Provider abstraction | ✅ | [`provider.ts`](file:///home/rektide/src/figment-js/src/provider.ts) |
| Figment core | ✅ | [`figment.ts`](file:///home/rektide/src/figment-js/src/figment.ts) |
| Coalesce/merge | ✅ | [`core/coalesce.ts`](file:///home/rektide/src/figment-js/src/core/coalesce.ts) |
| Tag tracking | ✅ | [`core/tag.ts`](file:///home/rektide/src/figment-js/src/core/tag.ts) |
| Metadata | ✅ | [`core/metadata.ts`](file:///home/rektide/src/figment-js/src/core/metadata.ts) |
| Env provider | ✅ | [`providers/env.ts`](file:///home/rektide/src/figment-js/src/providers/env.ts) |
| File/data providers | ✅ | [`providers/data.ts`](file:///home/rektide/src/figment-js/src/providers/data.ts), [`serialized.ts`](file:///home/rektide/src/figment-js/src/providers/serialized.ts) |
| Profile support | ✅ | [`profile.ts`](file:///home/rektide/src/figment-js/src/profile.ts) |
| Error handling | ✅ | [`core/error.ts`](file:///home/rektide/src/figment-js/src/core/error.ts) |

### Current Merge Orders (4 vs Figment's 6)

From [`core/coalesce.ts:13`](file:///home/rektide/src/figment-js/src/core/coalesce.ts#L13):
```typescript
export type CoalesceOrder = "join" | "adjoin" | "merge" | "admerge";
```

Missing: `Zipjoin`, `Zipmerge`

### Gaps vs Rust Figment

| Gap | Priority | Notes |
|-----|----------|-------|
| Magic values | Medium | No `RelativePathBuf` equivalent |
| All 6 merge orders | Low | 4/6 implemented |
| Code location tracking | Low | JS stack traces differ |
| Schema/derive equivalent | High | No typed projection layer |
| Template generation | Medium | No config template output |
| Validation | High | No built-in validation |

### Needed for Logging Library

| Need | Current | Required |
|------|---------|----------|
| Typed config struct | ❌ | ✅ |
| Field-level defaults | ❌ | ✅ |
| Field-level validation | ❌ | ✅ |
| Per-path merge policies | ❌ | ✅ (from [bending-ts.md](./bending-ts.md)) |
| Schema introspection | ❌ | ✅ |
| Config templates | ❌ | ✅ |

---

## Discussion Questions

1. **TypeScript Approach**
   - Decorators (Stage 3) vs. Zod schemas vs. custom DSL?
   - How to get derive-like ergonomics without proc macros?

2. **Layer Generation**
   - Can TypeScript mapped types create `Partial<T>` equivalents with preserved metadata?
   - Should we generate runtime schema objects?

3. **Merge Policy Granularity**
   - Per-field policies (confique-style) or per-provider (figment-style)?
   - Policy DSL complexity vs. expressiveness?

4. **Provenance Scope**
   - Full event log (expensive) or winning-value-only (lighter)?
   - Is `Tagged<T>` equivalent needed?

5. **Integration Boundaries**
   - CLI integration pattern (like confique's clap example)?
   - Schema export for IDE/tooling support?

---

## Decision Points

### Decision 1: Typed Projection Approach

**Options:**
1. **Zod schemas** - Declarative, inferred types, validation built-in
2. **Decorators** - Class-based, metadata-rich, familiar to OOP devs
3. **Function DSL** - `defineConfig({ port: { default: 8080, env: "PORT" } })`
4. **Hybrid** - Zod schemas with decorator wrapper

**Recommendation:** Start with function DSL for explicitness, consider decorator wrapper for ergonomics.

### Decision 2: Layer Type Generation

**Options:**
1. **Mapped types** - `type ConfigLayer<T> = { [K in keyof T]?: ... }`
2. **Runtime objects** - Generate layer objects with metadata
3. **Separate definition** - Users define both full and layer types

**Recommendation:** Mapped types for type safety + runtime schema for introspection.

### Decision 3: Merge Policy System

**Options:**
1. **Global only** - Keep figment's provider-level policies
2. **Path-based** - Add confique-style field policies
3. **Hybrid** - Global default with per-field overrides

**Recommendation:** Hybrid - matches logging library's heterogeneous field semantics (from [bending-ts.md](./bending-ts.md)).

---

## Recommendations

### Short-term (MVP)

1. **Implement typed projection** with function DSL:
   ```typescript
   const LoggingConfig = defineConfig({
     level: { type: "string", default: "info", env: "LOG_LEVEL" },
     sinks: { type: "array", default: [], merge: "append" },
   });
   ```

2. **Add per-field merge policies** via schema definition

3. **Implement validation hooks** in extraction

### Medium-term

1. **Add decorator wrapper** for class-based config:
   ```typescript
   @config
   class LoggingConfig {
     @field({ default: "info", env: "LOG_LEVEL" })
     level!: string;
   }
   ```

2. **Implement template generation** from schema

3. **Add magic value equivalents** (Tagged, paths relative to config file)

### Long-term

1. **Schema versioning** with migrations
2. **IDE plugin** for config completion
3. **Remote config provider** support

---

## References

### Rust Libraries
- [Confique](https://docs.rs/confique) - Derive-based, layered config
- [Figment2](https://docs.rs/figment2) - Provider-based with provenance
- [config-rs](https://docs.rs/config) - Loosely-typed hierarchical
- [clap](https://docs.rs/clap) - CLI argument derive

### TypeScript Libraries
- [Zod](https://github.com/colinhacks/zod) - Schema validation
- [class-validator](https://github.com/typestack/class-validator) - Decorator validation

### Local Files
- [`bending-ts.md`](./bending-ts.md) - Architecture options
- [`metadata.md`](./metadata.md) - Current metadata implementation
- [`/home/rektide/archive/LukasKalbertodt/confique`](file:///home/rektide/archive/LukasKalbertodt/confique) - Confique checkout
- [`/home/rektide/archive/lmmx/figment2`](file:///home/rektide/archive/lmmx/figment2) - Figment2 checkout
