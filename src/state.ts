export const FIGMENTS_STATE = Symbol.for("figments.state");

export interface Stateful<T> {
  [FIGMENTS_STATE](): T;
}
