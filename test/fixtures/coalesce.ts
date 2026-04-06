import type { ConfigValue } from "../../src/core/types.ts";

export type FourWayCoalesceOrder = "join" | "merge" | "adjoin" | "admerge";

export type CoalesceConflictFixture = {
  readonly name: string;
  readonly current: ConfigValue;
  readonly incoming: ConfigValue;
  readonly expected: Record<FourWayCoalesceOrder, ConfigValue>;
};

export function coalesceConflictFixtures(): CoalesceConflictFixture[] {
  return [
    {
      name: "scalar conflict",
      current: "base",
      incoming: "incoming",
      expected: {
        join: "base",
        merge: "incoming",
        adjoin: "base",
        admerge: "incoming",
      },
    },
    {
      name: "array conflict",
      current: ["a"],
      incoming: ["b"],
      expected: {
        join: ["a"],
        merge: ["b"],
        adjoin: ["a", "b"],
        admerge: ["a", "b"],
      },
    },
    {
      name: "dict conflict",
      current: {
        app: {
          host: "base",
          retries: 1,
        },
      },
      incoming: {
        app: {
          host: "incoming",
          enabled: true,
        },
      },
      expected: {
        join: {
          app: {
            host: "base",
            retries: 1,
            enabled: true,
          },
        },
        merge: {
          app: {
            host: "incoming",
            retries: 1,
            enabled: true,
          },
        },
        adjoin: {
          app: {
            host: "base",
            retries: 1,
            enabled: true,
          },
        },
        admerge: {
          app: {
            host: "incoming",
            retries: 1,
            enabled: true,
          },
        },
      },
    },
  ];
}
