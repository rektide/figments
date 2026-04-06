import type { DecodeContext, ValueDecoder } from "../figment.ts";

/**
 * Returns a decoder that tries `left` first and falls back to `right` when
 * `left` throws.
 *
 * If both decoders throw, the second error is rethrown.
 */
export function eitherDecoder<A, B, V = unknown>(
  left: ValueDecoder<A, V>,
  right: ValueDecoder<B, V>,
): ValueDecoder<A | B, V> {
  return (value: V, context?: DecodeContext) => {
    try {
      return decodeWith(left, value, context);
    } catch {
      return decodeWith(right, value, context);
    }
  };
}

function decodeWith<T, V>(decoder: ValueDecoder<T, V>, value: V, context?: DecodeContext): T {
  if (typeof decoder === "function") {
    return decoder(value, context);
  }

  return decoder.parse(value, context);
}
