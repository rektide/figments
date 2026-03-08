# Figmen-TS / figments

TypeScript port of the rust `figment` library

## Included

- `Figment` combiner with `join`, `adjoin`, `zipjoin`, `merge`, `admerge`, `zipmerge`
- profile selection with ordered overlays and `default`/`global` semantics
- path lookup (`extractInner`, `findValue`, `focus`, `contains`) including array indices
- providers:
  - `Serialized`
  - `Env`
  - `Data` (`Json`, `Toml`, `Yaml`)

## Notes

- This port keeps the conflict-resolution and provider-composition model, but is intentionally lighter than Rust `figment`.
- Figment and provider builder methods are immutable: chaining returns new instances.
- APIs that load files are asynchronous.
- Multi-profile extraction supports ordered overlays via `selectProfiles()` and `spliceProfiles()`.
- Type extraction returns plain typed values; strict decode paths are available via `extractWith`, `extractLossyWith`, `extractInnerWith`, and `extractInnerLossyWith`.

## Example

```ts
import { Figment, providers } from "./src/index.ts"

const figment = Figment.new()
	.merge(providers.Toml.file("Config.toml"))
	.merge(providers.Env.prefixed("APP_").split("_"))
	.join(providers.Json.file("Config.json"))

const config = await figment.extract<{ app: { name: string } }>()
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

const level = await selected.extractInner<string>("level")
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

const source = await figment.findMetadata("server.host")
// source?.name -> "Serialized"
```
