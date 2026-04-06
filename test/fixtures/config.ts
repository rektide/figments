import type { ConfigDict, ProfileMap } from "../../src/core/types.ts";

export function appHostTokenConfig(): ConfigDict {
  return {
    app: {
      host: "localhost",
      token: "secret",
    },
  };
}

export function appDbReplicasConfig(): ConfigDict {
  return {
    app: {
      host: "localhost",
      db: {
        user: "app",
        password: "secret",
      },
      replicas: [{ host: "r1.local" }, { host: "r2.local" }],
    },
  };
}

export function appHostByProfile(): ProfileMap {
  return {
    default: {
      app: {
        host: "default.example",
      },
    },
    debug: {
      app: {
        host: "debug.example",
      },
    },
  };
}
