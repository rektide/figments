import { describe, expect, it } from "vitest";

import { makeTag } from "../../src/core/tag.ts";
import { Figment } from "../../src/figment.ts";
import { ManualTaggedProvider } from "../fixtures/provenance-providers.ts";
import { createTaggedAppTokenProvider } from "../fixtures/tagged.ts";

describe("getMetadata", () => {
  it("returns metadata for tags returned by explain()", async () => {
    const figment = Figment.new().merge(createTaggedAppTokenProvider());

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
