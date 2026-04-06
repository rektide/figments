import { describe, expect, it } from "vitest";

import { metadataNamed } from "../../src/core/metadata.ts";
import { makeTag, type ProfileTagMap } from "../../src/core/tag.ts";
import type { ProfileMap } from "../../src/core/types.ts";
import { Figment } from "../../src/figment.ts";
import type { Provider } from "../../src/provider.ts";
import { taggedProvider } from "../../src/providers/tagged.ts";

class ManualTaggedProvider implements Provider {
  public metadata() {
    return metadataNamed("ManualTaggedProvider");
  }

  public data(): ProfileMap {
    return {
      default: {
        app: {
          host: "localhost",
          token: "secret",
        },
      },
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

describe("getMetadata", () => {
  it("returns metadata for tags returned by explain()", async () => {
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

    const host = await figment.explain({ path: "app.host" });
    const token = await figment.explain({ path: "app.token" });

    expect((await figment.getMetadata(host.tag))?.name).toBe("TaggedApp");
    expect((await figment.getMetadata(token.tag))?.name).toBe("TokenSource");
  });

  it("returns metadata for tags from manual metadataMap/tagMap providers", async () => {
    const figment = Figment.new().merge(new ManualTaggedProvider());

    const host = await figment.explain({ path: "app.host" });
    const token = await figment.explain({ path: "app.token" });

    expect((await figment.getMetadata(host.tag))?.name).toBe("ManualBase");
    expect((await figment.getMetadata(token.tag))?.name).toBe("ManualToken");
  });

  it("returns undefined for undefined or unknown tags", async () => {
    const figment = Figment.new();

    expect(await figment.getMetadata(undefined)).toBeUndefined();
    expect(await figment.getMetadata(makeTag(999_999, "default"))).toBeUndefined();
  });
});
