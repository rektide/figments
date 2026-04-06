import { metadataNamed } from "../../src/core/metadata.ts";
import { makeTag, type ProfileTagMap } from "../../src/core/tag.ts";
import type { ProfileMap } from "../../src/core/types.ts";
import type { Provider } from "../../src/provider.ts";
import { appDbReplicasConfig, appHostTokenConfig } from "./config.ts";

export class PlainSecretsProvider implements Provider {
  public metadata() {
    return metadataNamed("PlainSecretsProvider");
  }

  public data(): ProfileMap {
    return {
      default: appDbReplicasConfig(),
    };
  }
}

export class ManualSecretsProvider implements Provider {
  public metadata() {
    return metadataNamed("ManualSecretsProvider");
  }

  public data(): ProfileMap {
    return {
      default: appDbReplicasConfig(),
    };
  }

  public metadataMap() {
    return new Map([
      [1, metadataNamed("BaseConfig")],
      [2, metadataNamed("SecretStore")],
      [3, metadataNamed("ReplicaList")],
      [4, metadataNamed("ReplicaA")],
      [5, metadataNamed("ReplicaB")],
    ]);
  }

  public tagMap(): ProfileTagMap {
    return {
      default: {
        kind: "dict",
        tag: makeTag(1, "default"),
        children: [
          {
            kind: "dict",
            key: "app",
            tag: makeTag(1, "default"),
            children: [
              {
                kind: "scalar",
                key: "host",
                tag: makeTag(1, "default"),
              },
              {
                kind: "dict",
                key: "db",
                tag: makeTag(2, "default"),
                children: [
                  {
                    kind: "scalar",
                    key: "user",
                    tag: makeTag(2, "default"),
                  },
                  {
                    kind: "scalar",
                    key: "password",
                    tag: makeTag(2, "default"),
                  },
                ],
              },
              {
                kind: "array",
                key: "replicas",
                tag: makeTag(3, "default"),
                children: [
                  {
                    kind: "dict",
                    tag: makeTag(4, "default"),
                    children: [
                      {
                        kind: "scalar",
                        key: "host",
                        tag: makeTag(4, "default"),
                      },
                    ],
                  },
                  {
                    kind: "dict",
                    tag: makeTag(5, "default"),
                    children: [
                      {
                        kind: "scalar",
                        key: "host",
                        tag: makeTag(5, "default"),
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
  }
}

export class ManualRuntimeProvider implements Provider {
  public metadata() {
    return metadataNamed("ManualRuntimeProvider");
  }

  public data(): ProfileMap {
    return {
      default: {
        app: {
          runtime: {
            token: "runtime-secret",
          },
        },
      },
    };
  }

  public metadataMap() {
    return new Map([
      [1, metadataNamed("RuntimeBase")],
      [2, metadataNamed("RuntimeSecret")],
    ]);
  }

  public tagMap(): ProfileTagMap {
    return {
      default: {
        kind: "dict",
        tag: makeTag(1, "default"),
        children: [
          {
            kind: "dict",
            key: "app",
            tag: makeTag(1, "default"),
            children: [
              {
                kind: "dict",
                key: "runtime",
                tag: makeTag(1, "default"),
                children: [
                  {
                    kind: "scalar",
                    key: "token",
                    tag: makeTag(2, "default"),
                  },
                ],
              },
            ],
          },
        ],
      },
    };
  }
}

export class ManualTaggedProvider implements Provider {
  public metadata() {
    return metadataNamed("ManualTaggedProvider");
  }

  public data(): ProfileMap {
    return {
      default: appHostTokenConfig(),
    };
  }

  public metadataMap() {
    return new Map([
      [1, metadataNamed("ManualBase")],
      [2, metadataNamed("ManualToken")],
    ]);
  }

  public tagMap(): ProfileTagMap {
    return {
      default: {
        kind: "dict",
        tag: makeTag(1, "default"),
        children: [
          {
            kind: "dict",
            key: "app",
            tag: makeTag(1, "default"),
            children: [
              { kind: "scalar", key: "host", tag: makeTag(1, "default") },
              { kind: "scalar", key: "token", tag: makeTag(2, "default") },
            ],
          },
        ],
      },
    };
  }
}
