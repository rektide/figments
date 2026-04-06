export const EMPTY = Symbol("figment:empty");

export type EmptySentinel = typeof EMPTY;

export function isEmpty(value: unknown): value is EmptySentinel {
  return value === EMPTY;
}
