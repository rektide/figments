# Figmen-TS / figments

TypeScript port of the rust `figment` library

## Included

- `Figment` combiner with `join`, `adjoin`, `zipjoin`, `merge`, `admerge`, `zipmerge`
- profile selection with ordered overlays and `default`/`global` semantics
- path lookup via `extract({ path })` and `explain({ path })`, including array indices
- providers:
  - `Serialized`
  - `Env`
  - `Data` (`Json`, `Toml`, `Yaml`)

## Notes

- This port keeps the conflict-resolution and provider-composition model, but is intentionally lighter than Rust `figment`.
- Figment and provider builder methods are immutable: chaining returns new instances.
- APIs that load files are asynchronous.
- Multi-profile extraction supports ordered overlays via `selectProfiles()` and `spliceProfiles()`.
- Provider profile influence on selection is configurable via `providerProfileSelection()` (default: `"seedWhenEmpty"`).
- Path extraction is options-driven via `extract({ path, deser, interpret, missing, fallback, profiles })` (`path` is required).
- Full resolved materialization is `build({ deser, interpret, profiles })`.
- Provenance/introspection is available via `explain({ path, includeMetadata })`, where `includeMetadata` is `"none" | "winner" | "all"`.

## Example

```ts
import { Figment, providers } from "./src/index.ts"

const figment = Figment.new()
	.merge(providers.Toml.file("Config.toml"))
	.merge(providers.Env.prefixed("APP_").split("_"))
	.join(providers.Json.file("Config.json"))

const config = await figment.build<{ app: { name: string } }>()
```

## Multi-Profile Precedence

`select()` remains single-profile sugar, while `selectProfiles()` and
`spliceProfiles()` manage ordered overlays.

```ts
import { Figment, providers } from "./src/index.ts"

const base = Figment.new()
  .merge(providers.Serialized.default("level", "default"))
  .merge(providers.Serialized.default("level", "region").profile("region-eu"))
  .merge(providers.Serialized.default("level", "tenant").profile("tenant-acme"))
  .merge(providers.Serialized.global("level", "global"))

const selected = base
  .selectProfiles(["region-eu", "tenant-acme"])
  .spliceProfiles(1, 0, "incident-override")

const level = await selected.extract<string>({ path: "level" })
// effective order: default -> region-eu -> incident-override -> tenant-acme -> global
```

`spliceProfiles()` follows JS `Array.prototype.splice()` conventions on the
selected overlay list:

- insert: `spliceProfiles(1, 0, "tenant-acme")`
- replace: `spliceProfiles(0, 2, "staging")`
- remove to end: `spliceProfiles(0)`

Compatibility note: existing single-profile usage can stay on `select("name")`.

## Provenance Lookup

```ts
import { Figment, providers } from "./src/index.ts"

const figment = Figment.new()
	.join(providers.Serialized.default("server.host", "base.example"))
	.merge(providers.Serialized.default("server.host", "incoming.example"))

const source = (await figment.explain({ path: "server.host", includeMetadata: "winner" })).metadata
// source?.name -> "Serialized"
```

## Error Handling

Decoders that throw `FigmentError` preserve structured context:

```ts
import { Figment, FigmentError } from "./src/index.ts"

const figment = Figment.new().merge(providers.Serialized.default("app.port", "oops"))

try {
  await figment.extract({ path: "app.port", deser: (value) => {
    if (typeof value !== "number") throw FigmentError.invalidType("number", value)
    return value
  } })
} catch (error) {
  if (error instanceof FigmentError) {
    error.kind    // "InvalidType"
    error.path    // ["app", "port"]
    error.profile // "default"
    String(error) // "invalid type (expected number, found string) for key 'app.port' in Serialized"
  }
}
```

Multiple decoder failures aggregate into a single `FigmentAggregateError`:

```ts
import { FigmentAggregateError, FigmentError } from "./src/index.ts"

const aggregate = FigmentError.decode("config", {
  issues: [
    { code: "invalid_type", message: "expected number", expected: "number", received: "oops", path: ["app", "port"] },
    { code: "unrecognized_keys", message: "unrecognized key(s)", keys: ["extra"], path: ["app"] },
  ],
})

aggregate.count()          // 2
aggregate.missing()        // false
[...aggregate].map(e => e.kind) // ["InvalidType", "UnknownField"]
String(aggregate)
// failed to decode config with 2 issues
// invalid type (expected number, found string) for key 'app.port'
// unknown field ('extra' expected one of: extra) for key 'app'
```
