import { describe, expect, it } from "vitest";

import { metadataNamed } from "../../src/core/metadata.ts";
import { Figment } from "../../src/figment.ts";
import { taggedProvider } from "../../src/providers/tagged.ts";
import { Serialized } from "../../src/providers/serialized.ts";
import { winnerMetadataName } from "../helpers.ts";

describe("extractTagged", () => {
  it("returns value with winner tag and metadata", async () => {
    const figment = Figment.new().merge(
      taggedProvider({
        name: "TaggedApp",
        data: {
          default: {
            app: {
              host: "localhost",
              token: "secret",
            },
          },
        },
        rules: [{ path: "app.token", metadata: metadataNamed("TokenSource"), mode: "node" }],
      }),
    );

    const result = await figment.extractTagged({ path: "app.token" });
    expect(result.exists).toBe(true);
    expect(result.value).toBe("secret");
    expect(result.tag).toBeDefined();
    expect(result.metadata?.name).toBe("TokenSource");
  });

  it("supports deserializers while preserving metadata context", async () => {
    const figment = Figment.new().merge(
      taggedProvider({
        name: "TaggedPort",
        data: {
          default: {
            app: {
              port: "8080",
            },
          },
        },
        rules: [{ path: "app.port", metadata: metadataNamed("PortSource"), mode: "node" }],
      }),
    );

    const result = await figment.extractTagged<number>({
      path: "app.port",
      deser: (value) => {
        if (typeof value !== "string") {
          throw new Error("port must be a string");
        }

        return Number.parseInt(value, 10);
      },
    });

    expect(result.value).toBe(8080);
    expect(result.metadata?.name).toBe("PortSource");
  });

  it("respects missing policy and returns undefined metadata for missing paths", async () => {
    const figment = Figment.new().merge(Serialized.defaults({ app: { host: "localhost" } }));
    const missing = await figment.extractTagged({ path: "app.token", missing: "undefined" });

    expect(missing.exists).toBe(false);
    expect(missing.value).toBeUndefined();
    expect(missing.tag).toBeUndefined();
    expect(missing.metadata).toBeUndefined();
    expect(await winnerMetadataName(figment, "app.token")).toBeUndefined();
  });
});
