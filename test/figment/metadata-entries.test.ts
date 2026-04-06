import { describe, expect, it } from "vitest";

import { metadataFromEnv, metadataNamed } from "../../src/core/metadata.ts";
import { Figment } from "../../src/figment.ts";
import { taggedProvider } from "../../src/providers/tagged.ts";
import { Serialized } from "../../src/providers/serialized.ts";
import { Tuple } from "../../src/providers/tuple.ts";
import { createTaggedAppTokenProvider } from "../fixtures/tagged.ts";
import { NamedProvider } from "../helpers.ts";

describe("metadataEntries", () => {
  it("lists metadata for mixed provider kinds in insertion order", async () => {
    const figment = Figment.new()
      .merge(new NamedProvider("TomlConfig", { app: { host: "base" } }))
      .join(Serialized.default("app.port", 8080))
      .merge(Tuple.from(["app.region", "us-east-1"]));

    const entries = await figment.metadataEntries();
    expect(entries.map((metadata) => metadata.name)).toEqual(["TomlConfig", "Serialized", "Tuple"]);
  });

  it("includes helper-generated per-path metadata entries", async () => {
    const figment = Figment.new().merge(
      createTaggedAppTokenProvider({
        name: "TaggedRuntime",
        tokenMetadata: metadataFromEnv("TokenFromEnv", "APP_TOKEN"),
      }),
    );

    const entries = await figment.metadataEntries();
    expect(entries.map((metadata) => metadata.name)).toEqual(["TaggedRuntime", "TokenFromEnv"]);
    expect(entries[1]?.source).toEqual({ kind: "env", selector: "APP_TOKEN" });
  });

  it("contains winner metadata for extracted paths", async () => {
    const figment = Figment.new().merge(
      taggedProvider({
        name: "AppConfig",
        data: {
          default: {
            app: {
              host: "localhost",
              secrets: {
                apiKey: "abc",
              },
            },
          },
        },
        rules: [{ path: "app.secrets", metadata: metadataNamed("SecretStore"), mode: "subtree" }],
      }),
    );

    const entries = await figment.metadataEntries();
    const names = new Set(entries.map((metadata) => metadata.name));

    const hostMetadata = (await figment.explain({ path: "app.host" })).metadata;
    const keyMetadata = (await figment.explain({ path: "app.secrets.apiKey" })).metadata;

    expect(names.has(hostMetadata?.name ?? "")).toBe(true);
    expect(names.has(keyMetadata?.name ?? "")).toBe(true);
    expect(hostMetadata?.name).toBe("AppConfig");
    expect(keyMetadata?.name).toBe("SecretStore");
  });
});
