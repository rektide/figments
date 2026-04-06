import type { DecodeContext, ValueDecoder } from "../figment.ts";

export type EitherLeft<L> = {
  kind: "left";
  value: L;
};

export type EitherRight<R> = {
  kind: "right";
  value: R;
};

export type Either<L, R> = EitherLeft<L> | EitherRight<R>;

export const Either = {
  left<L>(value: L): EitherLeft<L> {
    return { kind: "left", value };
  },
  right<R>(value: R): EitherRight<R> {
    return { kind: "right", value };
  },
  isLeft<L, R>(value: Either<L, R>): value is EitherLeft<L> {
    return value.kind === "left";
  },
  isRight<L, R>(value: Either<L, R>): value is EitherRight<R> {
    return value.kind === "right";
  },
} as const;

/**
 * Decodes a value into `Either<L, R>` by trying the left decoder first and
 * falling back to the right decoder.
 *
 * If both branches fail, an error containing both branch failures is thrown.
 */
export function decodeEither<L, R, V = unknown>(
  leftDecoder: ValueDecoder<L, V>,
  rightDecoder: ValueDecoder<R, V>,
): ValueDecoder<Either<L, R>, V> {
  return (value: V, context?: DecodeContext) => {
    try {
      return Either.left(decodeWith(leftDecoder, value, context));
    } catch (leftError) {
      try {
        return Either.right(decodeWith(rightDecoder, value, context));
      } catch (rightError) {
        throw new Error(
          `failed to decode either: left=${errorMessage(leftError)}; right=${errorMessage(rightError)}`,
        );
      }
    }
  };
}

function decodeWith<T, V>(decoder: ValueDecoder<T, V>, value: V, context?: DecodeContext): T {
  if (typeof decoder === "function") {
    return decoder(value, context);
  }

  return decoder.parse(value, context);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
