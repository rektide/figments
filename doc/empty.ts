/**
 * # EMPTY sentinel design
 *
 * This document describes why figments uses an EMPTY sentinel symbol and how
 * it flows through the pipeline.
 *
 * ## Problem statement
 *
 * JavaScript has two different notions of "not present":
 * - an object key can be absent
 * - an object key can exist with value `undefined`
 *
 * Figment needs to preserve "explicitly unset" through provider merge/coalesce
 * without leaking that internal marker to extraction/build callers.
 *
 * ## Core design
 *
 * 1. Represent internal emptiness with a unique symbol (`EMPTY`).
 *    - Defined in `src/core/const.ts`.
 * 2. Allow the sentinel in internal config values.
 *    - `ConfigValue` includes `EmptySentinel` in `src/core/types.ts`.
 * 3. Teach coalescing rules to treat EMPTY as lower-priority than concrete
 *    values on either side.
 *    - Implemented in `src/core/coalesce.ts`.
 * 4. Resolve EMPTY back to `undefined` at read boundaries.
 *    - Implemented in `src/figment.ts` for `extract()`, `explain()`, and
 *      `build()` output cloning.
 *
 * ## Producer behavior
 *
 * Serialized provider maps input `undefined` to EMPTY.
 *
 * Example:
 * - input: `{ app: { port: undefined } }`
 * - internal provider data: `{ app: { port: EMPTY } }`
 *
 * ## Coalesce behavior
 *
 * In `coalesceValue(current, incoming, order)`:
 * - EMPTY + concrete => concrete
 * - concrete + EMPTY => concrete
 * - EMPTY + EMPTY => EMPTY
 *
 * This keeps EMPTY as an internal "fill me if possible" marker during merges.
 *
 * ## Read behavior
 *
 * Before returning data to users:
 * - `extract()` treats EMPTY as missing (`undefined`) and then applies missing
 *   policy (`throw`/`undefined`/`null`/`default`).
 * - `explain()` follows the same missing-resolution behavior.
 * - `build()` recursively converts EMPTY leaves to `undefined`.
 *
 * As a result, EMPTY is an implementation detail; API consumers do not need to
 * branch on symbol values.
 *
 * ## Invariants
 *
 * - Providers may produce EMPTY for explicit undefined-like semantics.
 * - Coalescing must never let EMPTY override a concrete value.
 * - Public outputs should not expose EMPTY as the final resolved value.
 */
