import { describe, expect, it } from "vitest";

import { metadataNamed } from "../../src/core/metadata.ts";
import { makeTag, type ProfileTagMap } from "../../src/core/tag.ts";
import { Figment } from "../../src/figment.ts";
import type { Provider } from "../../src/provider.ts";
import { taggedProvider } from "../../src/providers/tagged.ts";
import type { ProfileMap } from "../../src/core/types.ts";
import { allMetadataNames, winnerMetadataName } from "../helpers.ts";

class PlainSecretsProvider implements Provider {
  public metadata() {
    return metadataNamed("PlainSecretsProvider");
  }

  public data(): ProfileMap {
    return {
      default: {
        app: {
          host: "localhost",
          db: {
            user: "app",
            password: "secret",
          },
          replicas: [{ host: "r1.local" }, { host: "r2.local" }],
        },
      },
    };
  }
}

class ManualSecretsProvider implements Provider {
  public metadata() {
    return metadataNamed("ManualSecretsProvider");
  }

  public data(): ProfileMap {
    return {
      default: {
        app: {
          host: "localhost",
          db: {
            user: "app",
            password: "secret",
          },
          replicas: [{ host: "r1.local" }, { host: "r2.local" }],
        },
      },
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

class ManualRuntimeProvider implements Provider {
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

describe("B12 manual metadata-map provider hooks", () => {
  it("plain providers attribute all paths to provider metadata", async () => {
    const figment = Figment.new().merge(new PlainSecretsProvider());

    expect(await winnerMetadataName(figment, "app")).toBe("PlainSecretsProvider");
    expect(await winnerMetadataName(figment, "app.host")).toBe("PlainSecretsProvider");
    expect(await winnerMetadataName(figment, "app.db.password")).toBe("PlainSecretsProvider");
    expect(await winnerMetadataName(figment, "app.replicas.0.host")).toBe("PlainSecretsProvider");
  });

  it("manual metadataMap/tagMap enables fine-grained provenance", async () => {
    const figment = Figment.new().merge(new ManualSecretsProvider());

    expect(await winnerMetadataName(figment, "app")).toBe("BaseConfig");
    expect(await winnerMetadataName(figment, "app.host")).toBe("BaseConfig");
    expect(await winnerMetadataName(figment, "app.db")).toBe("SecretStore");
    expect(await winnerMetadataName(figment, "app.db.password")).toBe("SecretStore");
    expect(await winnerMetadataName(figment, "app.replicas")).toBe("ReplicaList");
    expect(await winnerMetadataName(figment, "app.replicas.0.host")).toBe("ReplicaA");
    expect(await winnerMetadataName(figment, "app.replicas.1.host")).toBe("ReplicaB");
  });

  it("collects all contributors for a subtree deterministically", async () => {
    const figment = Figment.new().merge(new ManualSecretsProvider());

    expect(await allMetadataNames(figment, "app")).toEqual([
      "BaseConfig",
      "SecretStore",
      "ReplicaList",
      "ReplicaA",
      "ReplicaB",
    ]);
    expect(await allMetadataNames(figment, "app.db")).toEqual(["SecretStore"]);
    expect(await allMetadataNames(figment, "app.replicas")).toEqual([
      "ReplicaList",
      "ReplicaA",
      "ReplicaB",
    ]);
  });

  it("remaps colliding metadata ids across providers safely", async () => {
    const figment = Figment.new()
      .merge(new ManualSecretsProvider())
      .merge(new ManualRuntimeProvider());

    expect(await winnerMetadataName(figment, "app.db.password")).toBe("SecretStore");
    expect(await winnerMetadataName(figment, "app.runtime.token")).toBe("RuntimeSecret");
    expect(await allMetadataNames(figment, "app")).toEqual([
      "RuntimeBase",
      "BaseConfig",
      "SecretStore",
      "ReplicaList",
      "ReplicaA",
      "ReplicaB",
      "RuntimeSecret",
    ]);
  });
});

describe("B12.5 taggedProvider helper", () => {
  it("reproduces manual fine-grained provenance without manual id bookkeeping", async () => {
    const provider = taggedProvider({
      name: "TaggedHelper",
      data: {
        default: {
          app: {
            host: "localhost",
            db: {
              user: "app",
              password: "secret",
            },
            replicas: [{ host: "r1.local" }, { host: "r2.local" }],
          },
        },
      },
      rules: [
        {
          path: "app.db",
          metadata: metadataNamed("SecretStore"),
          mode: "subtree",
        },
        {
          path: "app.replicas",
          metadata: metadataNamed("ReplicaList"),
          mode: "node",
        },
        {
          path: "app.replicas.0",
          metadata: metadataNamed("ReplicaA"),
          mode: "subtree",
        },
        {
          path: "app.replicas.1",
          metadata: metadataNamed("ReplicaB"),
          mode: "subtree",
        },
      ],
    });

    const figment = Figment.new().merge(provider);
    expect(await winnerMetadataName(figment, "app.host")).toBe("TaggedHelper");
    expect(await winnerMetadataName(figment, "app.db.password")).toBe("SecretStore");
    expect(await winnerMetadataName(figment, "app.replicas")).toBe("ReplicaList");
    expect(await winnerMetadataName(figment, "app.replicas.0.host")).toBe("ReplicaA");
    expect(await winnerMetadataName(figment, "app.replicas.1.host")).toBe("ReplicaB");
  });
});
