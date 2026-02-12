# FigmenTS

TypeScript port of the rust `figment` library

## Included

- `Figment` combiner with `join`, `adjoin`, `merge`, `admerge`
- profile selection with `default`/`global` semantics
- path lookup (`extractInner`, `findValue`, `focus`, `contains`)
- providers:
  - `Serialized`
  - `Env`
  - `Data` (`Json`, `Toml`, `Yaml`)

## Notes

- This port keeps the conflict-resolution and provider-composition model, but is intentionally lighter than Rust `figment`.
- APIs that load files are asynchronous.
- Type extraction returns plain typed values, optionally with a decode function.

## Example

```ts
import { Figment, providers } from "./src/index.ts"

const figment = Figment.new()
	.merge(providers.Toml.file("Config.toml"))
	.merge(providers.Env.prefixed("APP_").split("_"))
	.join(providers.Json.file("Config.json"))

const config = await figment.extract<{ app: { name: string } }>()
```
