import { describe, expect, it } from "vitest";

import { Figment } from "../../src/figment.ts";
import { NamedProvider, TaggedEntryProvider, winnerMetadataName } from "../helpers.ts";

describe("figment provenance", () => {
  it("tracks metadata provenance for winning values", async () => {
    const base = new NamedProvider("BaseProvider", { name: "base" });
    const incoming = new NamedProvider("IncomingProvider", { name: "incoming" });

    const merged = Figment.new().join(base).merge(incoming);
    expect(await winnerMetadataName(merged, "name")).toBe("IncomingProvider");

    const joined = Figment.new().join(base).join(incoming);
    expect(await winnerMetadataName(joined, "name")).toBe("BaseProvider");

    expect(joined.state().metadataByTag.get(99_999)).toBeUndefined();
  });

  it("tracks nested winning leaf provenance", async () => {
    const base = new NamedProvider("BaseProvider", {
      server: {
        host: "base.example",
        nested: { mode: "safe" },
      },
    });

    const incoming = new NamedProvider("IncomingProvider", {
      server: {
        host: "incoming.example",
      },
    });

    const merged = Figment.new().join(base).merge(incoming);
    expect(await winnerMetadataName(merged, "server.host")).toBe("IncomingProvider");
    expect(await winnerMetadataName(merged, "server.nested.mode")).toBe("BaseProvider");
  });

  it("returns container metadata for array paths", async () => {
    const base = new NamedProvider("BaseProvider", {
      items: ["base"],
    });

    const incoming = new NamedProvider("IncomingProvider", {
      items: ["incoming"],
    });

    const joined = Figment.new().join(base).join(incoming);
    expect(await joined.extract<string[]>({ path: "items" })).toEqual(["base"]);
    expect(await winnerMetadataName(joined, "items")).toBe("BaseProvider");

    const merged = Figment.new().join(base).merge(incoming);
    expect(await merged.extract<string[]>({ path: "items" })).toEqual(["incoming"]);
    expect(await winnerMetadataName(merged, "items")).toBe("IncomingProvider");

    const admerged = Figment.new().join(base).admerge(incoming);
    expect(await admerged.extract<string[]>({ path: "items" })).toEqual(["base", "incoming"]);
    expect(await winnerMetadataName(admerged, "items")).toBe("IncomingProvider");
  });

  it("focus keeps subtree metadata provenance", async () => {
    const base = new NamedProvider("BaseProvider", {
      app: {
        server: {
          host: "base",
        },
      },
    });

    const incoming = new NamedProvider("IncomingProvider", {
      app: {
        server: {
          host: "incoming",
          port: 8080,
        },
      },
    });

    const focused = Figment.new().join(base).merge(incoming).focus("app");
    expect(await focused.extract<string>({ path: "server.host" })).toBe("incoming");
    expect(await winnerMetadataName(focused, "server.host")).toBe("IncomingProvider");
    expect(await winnerMetadataName(focused, "server.port")).toBe("IncomingProvider");
  });

  it("returns undefined metadata for missing paths", async () => {
    const figment = Figment.new().join(new NamedProvider("BaseProvider", { name: "base" }));
    expect(await winnerMetadataName(figment, "missing.key")).toBeUndefined();
  });

  it("preserves inner figment metadata when merging figments", async () => {
    const outer = Figment.new().join(new NamedProvider("OuterProvider", { outer: "value" }));
    const inner = Figment.new().join(new NamedProvider("InnerProvider", { inner: "value" }));

    const merged = outer.merge(inner);
    expect(await winnerMetadataName(merged, "outer")).toBe("OuterProvider");
    expect(await winnerMetadataName(merged, "inner")).toBe("InnerProvider");
  });

  it("records provideLocation when providers are merged", async () => {
    const figment = Figment.new().merge(new NamedProvider("BaseProvider", { name: "base" }));
    const metadata = (await figment.explain({ path: "name", includeMetadata: "winner" })).metadata;
    expect(metadata?.provideLocation).toContain("provenance.test.ts");
  });

  it("supports provider-supplied metadata map and per-entry tags", async () => {
    const figment = Figment.new().merge(new TaggedEntryProvider());
    expect(await winnerMetadataName(figment, "alpha")).toBe("AlphaSource");
    expect(await winnerMetadataName(figment, "beta")).toBe("BetaSource");
  });
});
