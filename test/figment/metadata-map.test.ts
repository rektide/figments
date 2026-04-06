import { describe, expect, it } from "vitest";

import { metadataNamed } from "../../src/core/metadata.ts";
import { Figment } from "../../src/figment.ts";
import { taggedProvider } from "../../src/providers/tagged.ts";
import { appDbReplicasConfig } from "../fixtures/config.ts";
import {
  ManualRuntimeProvider,
  ManualSecretsProvider,
  PlainSecretsProvider,
} from "../fixtures/provenance-providers.ts";
import { allMetadataNames, winnerMetadataName } from "../helpers.ts";

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
        default: appDbReplicasConfig(),
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
