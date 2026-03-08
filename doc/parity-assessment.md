# Figment Parity Assessment (TypeScript vs Rust figment2)

**Date:** 2026-02-14

Legend:
- `✓ Aligned`: Behavior closely matches Rust figment2
- `◐ Partial`: Meaningful implementation exists, but gaps remain
- `✗ Missing`: Capability not present yet

## Executive Summary

The TypeScript `figments` port has made substantial progress. Core composition semantics, metadata provenance, and the provider interface are well-aligned. The main gaps are in the "magic value" ecosystem, zip coalescing strategies, and rich error diagnostics.

## Detailed Parity Matrix

### 1. Tag System

| Feature | Rust | TypeScript | Status |
|---------|------|------------|--------|
| Opaque unique tag | `Tag(u64)` with embedded profile bits + metadata ID | `Tag { metadataId: number, profile: string }` | ◐ Partial |
| Default tag | `Tag::Default = Tag(0)` | `metadataId: 0, profile: "default"` | ✓ Aligned |
| Tag generation | Atomic counter | Sequential allocation with collision avoidance | ✓ Aligned |
| Profile for tag | 2-bit profile tag embedded | Separate `profile` field | ◐ Design diff |
| Hash/Eq on metadata ID only | Yes | Yes (by comparison) | ✓ Aligned |

**Assessment:** The TS tag system works correctly for provenance tracking. The design differs (struct vs packed u64) but semantics align. Profile is tracked separately rather than bit-packed, which is appropriate for TypeScript.

### 2. Metadata

| Feature | Rust | TypeScript | Status |
|---------|------|------------|--------|
| Name | `Cow<'static, str>` | `string` | ✓ Aligned |
| Source enum | `File(PathBuf) \| Code(Location) \| Custom(String)` | `{ kind: string, value: string }` | ◐ Partial |
| Provide location | `Option<&'static Location<'static>>` via `Location::caller()` | `provideLocation?: string` via stack parsing | ◐ Partial |
| Interpolater | `Box<dyn Interpolator>` | `(profile, keys) => string` | ✓ Aligned |
| Fluent builder | `.named().source().interpolater()` | Helper functions: `metadataNamed()`, `metadataFromFile()` | ◐ Partial |
| Display formatting | Relative path display for files | Basic `formatMetadataSource()` | ◐ Partial |

**Assessment:** Core metadata functionality is present. Missing: fluent builder API and rich source display (relative path normalization).

### 3. Provider Interface

| Feature | Rust | TypeScript | Status |
|---------|------|------------|--------|
| `metadata()` | Required | Required | ✓ Aligned |
| `data()` | `Result<Map<Profile, Dict>, Error>` | `ProfileMap \| Promise<ProfileMap>` | ✓ Aligned |
| `profile()` | Optional profile selection | `selectedProfile()` | ✓ Aligned |
| `__metadata_map()` | Internal for Figment composition | `metadataMap()` + `tagMap()` | ✓ Aligned |

**Assessment:** Provider interface is well-aligned. TS version exposes the metadata-map contract explicitly rather than as a hidden internal method.

### 4. Figment Composition

| Feature | Rust | TypeScript | Status |
|---------|------|------------|--------|
| `join` | Keep existing on conflict | ✓ Implemented | ✓ Aligned |
| `merge` | Use incoming on conflict | ✓ Implemented | ✓ Aligned |
| `adjoin` | Concat arrays, keep existing scalars | ✓ Implemented | ✓ Aligned |
| `admerge` | Concat arrays, use incoming scalars | ✓ Implemented | ✓ Aligned |
| `zipjoin` | Index-wise join arrays | ✗ Missing | ✗ Missing |
| `zipmerge` | Index-wise merge arrays | ✗ Missing | ✗ Missing |
| Profile coalescing | Join keeps, merge uses incoming | ✓ Implemented | ✓ Aligned |
| `focus(path)` | Extract sub-figment | ✓ Implemented | ✓ Aligned |
| `select(profile)` | Set active profile | ✓ Implemented | ✓ Aligned |
| Default/Global overlay | Merged on extract | ✓ Implemented | ✓ Aligned |

**Assessment:** Core 4 strategies implemented. Missing: `zipjoin`/`zipmerge` for index-wise array coalescing.

### 5. Value System

| Feature | Rust | TypeScript | Status |
|---------|------|------------|--------|
| Tagged value variants | `String(Tag, ...)`, `Dict(Tag, ...)` etc. | Separate `ConfigValue` type + `TagTree` | ◐ Partial |
| Num type | Enum with specific sizes (U8, I32, F64, etc.) | `number` (JS number) | ◐ Design diff |
| Empty type | `None \| Unit` | `null` | ◐ Design diff |
| `find(path)` / `find_ref(path)` | Path lookup with array index support | `findValue()`, `findTag()` | ✓ Aligned |
| Lossy conversion | `to_bool_lossy()`, `to_num_lossy()` | `extractLossy()`, `lossyValue()` | ✓ Aligned |
| Serialize/Deserialize | Full serde integration | Direct JSON/TOML/YAML parse | ◐ Design diff |

**Assessment:** Value representation differs due to TypeScript's type system. Provenance tracking via separate tag trees works correctly. No serde equivalent in JS ecosystem.

### 6. Error Handling

| Feature | Rust | TypeScript | Status |
|---------|------|------------|--------|
| Error kind enum | `Message, InvalidType, InvalidValue, ...` | Single `kind: string` | ◐ Partial |
| Actual type enum | `Bool, Unsigned, Signed, Float, Str, Seq, Map, ...` | ✗ Missing | ✗ Missing |
| Path tracking | `Vec<String>` | `string[]` | ✓ Aligned |
| Error chaining | `.chain()` with prev pointer | `.chain()` with previous | ✓ Aligned |
| Iterator over errors | `into_iter()` for multiple errors | No iterator protocol | ◐ Partial |
| `count()` method | Count chained errors | ✗ Missing | ✗ Missing |
| Metadata interpolation in display | Yes | Basic `toString()` | ◐ Partial |
| `retagged()` / `resolved()` | Tag remapping + metadata resolution | `withContext()` | ◐ Partial |

**Assessment:** Basic error chaining works. Missing rich error kinds and the `Actual` enum for type mismatch diagnostics.

### 7. Magic Values

| Feature | Rust | TypeScript | Status |
|---------|------|------------|--------|
| `Tagged<T>` | Wrapper with tag access | ✗ Missing | ✗ Missing |
| `RelativePathBuf` | Path resolved relative to source file | ✗ Missing | ✗ Missing |
| `Either<A, B>` | Magic-aware either type | ✗ Missing | ✗ Missing |
| `Magic` trait | Marker for deserialization hooks | N/A (no serde) | — N/A |

**Assessment:** Magic values require serde integration which doesn't exist in TypeScript. These features are fundamentally tied to Rust's type system.

### 8. Providers

| Provider | Rust | TypeScript | Status |
|----------|------|------------|--------|
| `Serialized` | `Serialized::default(key, value)` | ✓ Implemented | ✓ Aligned |
| `Env` | Full featured with parser, filter, map | ✓ Implemented (uses TOML parser) | ✓ Aligned |
| `Data<T: Format>` | Generic format trait | `Data<F extends Format>` | ✓ Aligned |
| `Json` | Via serde_json | ✓ Via `JSON.parse` | ✓ Aligned |
| `Toml` | Via toml_edit | ✓ Via `@iarna/toml` | ✓ Aligned |
| `Yaml` | Via serde_norway | ✓ Via `yaml` package | ✓ Aligned |
| `YamlExtended` | Merge key support | ✗ Missing | ✗ Missing |

**Assessment:** Core providers implemented. Missing `YamlExtended` for YAML merge key (`<<: *anchor`) support.

### 9. Profile

| Feature | Rust | TypeScript | Status |
|---------|------|------------|--------|
| Case-insensitive | Via `UncasedStr` | Lowercase normalization | ✓ Aligned |
| `Default` / `Global` constants | Yes | Yes | ✓ Aligned |
| `is_custom()` | Yes | `isCustomProfile()` | ✓ Aligned |
| `from_env()` | Case-insensitive env lookup | `profileFromEnv()` | ✓ Aligned |
| `collect(dict)` | Wrap dict in profile map | N/A (handled differently) | — N/A |

**Assessment:** Profile handling is well-aligned.

### 10. Testing Infrastructure

| Feature | Rust | TypeScript | Status |
|---------|------|------------|--------|
| Unit tests | Extensive | Basic coverage | ◐ Partial |
| `Jail` harness | Isolated env/file testing | Manual temp dir cleanup | ◐ Partial |
| Parity fixtures | Examples from Rust docs | Some coverage | ◐ Partial |

## Priority Gap Analysis

### High Priority (Blocking Faithful Port)

1. **Zipjoin/Zipmerge** - Required for index-wise array coalescing. Needed for Env provider's array construction via separate env vars.

2. **Error Kind Enum** - Rich error types improve debugging. Currently just string kinds.

3. **Actual Type Enum** - Required for type mismatch error messages.

### Medium Priority (Ergonomics)

4. **Metadata Fluent Builder** - `Metadata.named("...").source(...).interpolater(...)` pattern is more ergonomic than helper functions.

5. **Source Display Formatting** - Relative path normalization for file sources.

6. **YamlExtended** - YAML merge key support for advanced configs.

### Low Priority (Type System Constraints)

7. **Magic Values** - `Tagged<T>`, `RelativePathBuf` require serde integration that doesn't translate to TypeScript.

8. **Num Size Variants** - JavaScript's number type doesn't distinguish U8 vs U64 vs F32.

9. **Empty None vs Unit** - TypeScript uses `null` and `undefined` which are less precise.

## What's Working Well

- **Tag tree provenance tracking** - Correctly tracks which provider contributed each value
- **Metadata map preservation** - Figment-to-Figment composition preserves metadata
- **Provider metadata-map contract** - Custom providers can supply per-entry tags
- **Four core coalesce strategies** - join/merge/adjoin/admerge work correctly
- **Profile overlay** - Default/Global/Custom profile merging works
- **Focus operation** - Sub-figment extraction preserves provenance
- **Env provider** - Full featured with split, filter, map
- **Data providers** - JSON, TOML, YAML all working

## Recommendations

1. **Implement zipjoin/zipmerge** - Add to `CoalesceOrder` and implement index-wise array coalescing in `coalesce.ts`

2. **Add ErrorKind enum** - Replace `kind: string` with typed enum for better error handling

3. **Add Actual enum** - For type mismatch diagnostics

4. **Add Metadata builder** - Fluent API for constructing metadata

5. **Document intentional deviations** - Where TS design differs from Rust, note why

## Conclusion

The TypeScript port has achieved strong parity on core functionality. The main gaps are:
- **Zip coalescing strategies** (needed for full Env provider compatibility)
- **Rich error types** (ergonomics)
- **Magic values** (fundamentally Rust-specific due to serde)

The tag-based provenance system works correctly and the provider composition model is faithful to the original.

## Intentional Extension Beyond Rust Parity

The TypeScript port now includes an intentional extension for ordered
multi-profile overlays:

- `selectProfiles([...])`
- `spliceProfiles(start, deleteCount?, ...profiles)`

This extends Rust Figment's single selected custom profile model with explicit
ordered priorities while preserving single-profile compatibility through
`select(profile)`.
