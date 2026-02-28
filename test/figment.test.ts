import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { Figment } from "../src/figment.ts";
import { Env } from "../src/providers/env.ts";
import { Serialized } from "../src/providers/serialized.ts";
import { Toml } from "../src/providers/data.ts";
import type { Provider } from "../src/provider.ts";
import { makeTag, type ProfileTagMap } from "../src/core/tag.ts";
import type { ConfigDict } from "../src/core/types.ts";
import { metadataNamed } from "../src/core/metadata.ts";

class NamedProvider implements Provider {
  public constructor(
    private readonly providerName: string,
    private readonly payload: ConfigDict,
  ) {}

  public metadata() {
    return metadataNamed(this.providerName);
  }

  public data() {
    return { default: this.payload };
  }
}

class TaggedEntryProvider implements Provider {
  public metadata() {
    return metadataNamed("TaggedEntryProvider");
  }

  public data() {
    return {
      default: {
        alpha: "from-alpha",
        beta: "from-beta",
      },
    };
  }

  public metadataMap() {
    return new Map<number, ReturnType<typeof metadataNamed>>([
      [41, metadataNamed("AlphaSource")],
      [42, metadataNamed("BetaSource")],
    ]);
  }

  public tagMap(): ProfileTagMap {
    return {
      default: {
        kind: "dict",
        tag: makeTag(41, "default"),
        children: [
          { kind: "scalar", key: "alpha", tag: makeTag(41, "default") },
          { kind: "scalar", key: "beta", tag: makeTag(42, "default") },
        ],
      },
    };
  }
}

describe("figment merge behavior", () => {
  it("merge prefers incoming values while join keeps existing", async () => {
    const merged = Figment.new()
      .join(Serialized.default("name", "base"))
      .join(Serialized.default("items", ["a"]))
      .merge(Serialized.default("name", "incoming"));
    expect(await merged.extractInner<string>("name")).toBe("incoming");

    const joined = Figment.new()
      .join(Serialized.default("name", "base"))
      .join(Serialized.default("name", "ignored"));

    expect(await joined.extractInner<string>("name")).toBe("base");
  });

  it("admerge concatenates arrays", async () => {
    const figment = Figment.new()
      .join(Serialized.default("items", ["a"]))
      .admerge(Serialized.default("items", ["b"]));

    expect(await figment.extractInner<string[]>("items")).toEqual(["a", "b"]);
  });

  it("zipjoin and zipmerge coalesce arrays by index", async () => {
    const base = new NamedProvider("BaseProvider", { items: [1, 2] });
    const incoming = new NamedProvider("IncomingProvider", { items: [2, 3, 4] });

    const joined = Figment.new().join(base).zipjoin(incoming);
    expect(await joined.extractInner<number[]>("items")).toEqual([1, 2, 4]);
    expect((await joined.findMetadata("items"))?.name).toBe("BaseProvider");
    expect((await joined.findMetadata("items.0"))?.name).toBe("BaseProvider");
    expect((await joined.findMetadata("items.1"))?.name).toBe("BaseProvider");
    expect((await joined.findMetadata("items.2"))?.name).toBe("IncomingProvider");

    const merged = Figment.new().join(base).zipmerge(incoming);
    expect(await merged.extractInner<number[]>("items")).toEqual([2, 3, 4]);
    expect((await merged.findMetadata("items"))?.name).toBe("IncomingProvider");
    expect((await merged.findMetadata("items.0"))?.name).toBe("IncomingProvider");
    expect((await merged.findMetadata("items.1"))?.name).toBe("IncomingProvider");
    expect((await merged.findMetadata("items.2"))?.name).toBe("IncomingProvider");
  });

  it("tracks metadata provenance for winning values", async () => {
    const base = new NamedProvider("BaseProvider", { name: "base" });
    const incoming = new NamedProvider("IncomingProvider", { name: "incoming" });

    const merged = Figment.new().join(base).merge(incoming);
    const mergedMetadata = await merged.findMetadata("name");
    expect(mergedMetadata?.name).toBe("IncomingProvider");

    const joined = Figment.new().join(base).join(incoming);
    const joinedMetadata = await joined.findMetadata("name");
    expect(joinedMetadata?.name).toBe("BaseProvider");

    expect(joined.getMetadata(makeTag(99_999, "default"))).toBeUndefined();
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
    expect((await merged.findMetadata("server.host"))?.name).toBe("IncomingProvider");
    expect((await merged.findMetadata("server.nested.mode"))?.name).toBe("BaseProvider");
  });

  it("returns container metadata for array paths", async () => {
    const base = new NamedProvider("BaseProvider", {
      items: ["base"],
    });

    const incoming = new NamedProvider("IncomingProvider", {
      items: ["incoming"],
    });

    const joined = Figment.new().join(base).join(incoming);
    expect(await joined.extractInner<string[]>("items")).toEqual(["base"]);
    expect((await joined.findMetadata("items"))?.name).toBe("BaseProvider");

    const merged = Figment.new().join(base).merge(incoming);
    expect(await merged.extractInner<string[]>("items")).toEqual(["incoming"]);
    expect((await merged.findMetadata("items"))?.name).toBe("IncomingProvider");

    const admerged = Figment.new().join(base).admerge(incoming);
    expect(await admerged.extractInner<string[]>("items")).toEqual(["base", "incoming"]);
    expect((await admerged.findMetadata("items"))?.name).toBe("IncomingProvider");
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
    expect(await focused.extractInner<string>("server.host")).toBe("incoming");
    expect((await focused.findMetadata("server.host"))?.name).toBe("IncomingProvider");
    expect((await focused.findMetadata("server.port"))?.name).toBe("IncomingProvider");
  });

  it("supports array indices in key paths", async () => {
    const figment = Figment.new().merge(
      Serialized.default("servers", [
        { host: "a", ports: [80, 443] },
        { host: "b", ports: [8080] },
      ]),
    );

    expect(await figment.extractInner<string>("servers.1.host")).toBe("b");
    expect(await figment.extractInner<number>("servers.0.ports.1")).toBe(443);
    expect(await figment.contains("servers.0.ports.2")).toBe(false);
    expect((await figment.findMetadata("servers.0.ports.1"))?.name).toBe("Serialized");
  });

  it("returns undefined metadata for missing paths", async () => {
    const figment = Figment.new().join(new NamedProvider("BaseProvider", { name: "base" }));
    expect(await figment.findMetadata("missing.key")).toBeUndefined();
  });

  it("preserves inner figment metadata when merging figments", async () => {
    const outer = Figment.new().join(new NamedProvider("OuterProvider", { outer: "value" }));
    const inner = Figment.new().join(new NamedProvider("InnerProvider", { inner: "value" }));

    const merged = outer.merge(inner);
    expect((await merged.findMetadata("outer"))?.name).toBe("OuterProvider");
    expect((await merged.findMetadata("inner"))?.name).toBe("InnerProvider");
  });

  it("records provideLocation when providers are merged", async () => {
    const figment = Figment.new().merge(new NamedProvider("BaseProvider", { name: "base" }));
    const metadata = await figment.findMetadata("name");
    expect(metadata?.provideLocation).toContain("figment.test.ts");
  });

  it("supports provider-supplied metadata map and per-entry tags", async () => {
    const figment = Figment.new().merge(new TaggedEntryProvider());
    expect((await figment.findMetadata("alpha"))?.name).toBe("AlphaSource");
    expect((await figment.findMetadata("beta"))?.name).toBe("BetaSource");
  });

  it("figment chaining methods are immutable", async () => {
    const base = Figment.new().merge(Serialized.default("name", "default"));
    const withDebugProfile = base.merge(Serialized.default("name", "debug").profile("debug"));

    const selectedDefault = withDebugProfile.select("default");
    const selectedDebug = withDebugProfile.select("debug");
    const extended = base.merge(Serialized.default("extra", true));

    expect(await base.extractInner<string>("name")).toBe("default");
    expect(await withDebugProfile.extractInner<string>("name")).toBe("debug");
    expect(await selectedDefault.extractInner<string>("name")).toBe("default");
    expect(await selectedDebug.extractInner<string>("name")).toBe("debug");
    expect(await base.contains("extra")).toBe(false);
    expect(await extended.contains("extra")).toBe(true);
  });
});

describe("provider behavior", () => {
  it("parses environment values and supports split", async () => {
    const env = Env.raw().split("_");
    const iter = env.iter({ APP_NAME: '"demo"', APP_DEBUG: "true" });
    expect(iter).toEqual([
      ["app.name", '"demo"'],
      ["app.debug", "true"],
    ]);

    process.env.TEST_FIGMENT_APP_NAME = '"demo"';
    process.env.TEST_FIGMENT_APP_DEBUG = "true";
    process.env.TEST_FIGMENT_ARRAY_0 = "4";
    process.env.TEST_FIGMENT_ARRAY_2 = "6";
    process.env.TEST_FIGMENT_ARRAY_1 = "5";
    try {
      const figment = Figment.new().merge(Env.prefixed("TEST_FIGMENT_").split("_"));
      const config = await figment.extractLossy<{
        app: { name: string; debug: boolean };
        array: number[];
      }>();
      expect(config.app.name).toBe("demo");
      expect(config.app.debug).toBe(true);
      expect(config.array).toEqual([4, 5, 6]);
    } finally {
      delete process.env.TEST_FIGMENT_APP_NAME;
      delete process.env.TEST_FIGMENT_APP_DEBUG;
      delete process.env.TEST_FIGMENT_ARRAY_0;
      delete process.env.TEST_FIGMENT_ARRAY_2;
      delete process.env.TEST_FIGMENT_ARRAY_1;
    }
  });

  it("loads toml from file", async () => {
    const temp = await mkdtemp(join(tmpdir(), "figment-ts-"));
    const path = join(temp, "Config.toml");
    await writeFile(path, 'name = "demo"\ncount = 12\n', "utf8");

    try {
      const figment = Figment.new().merge(Toml.file(path));
      const config = await figment.extract<{ name: string; count: number }>();
      expect(config).toEqual({ name: "demo", count: 12 });
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("provider builder methods are immutable", async () => {
    const serialized = Serialized.default("name", "demo");
    const debugSerialized = serialized.profile("debug");
    expect(serialized.selectedProfile()).toBe("default");
    expect(debugSerialized.selectedProfile()).toBe("debug");

    const temp = await mkdtemp(join(tmpdir(), "figment-ts-"));
    const missing = join(temp, "Missing.toml");

    try {
      const optional = Toml.file(missing);
      const required = optional.required(true);

      expect(await Figment.new().merge(optional).extract()).toEqual({});
      await expect(Figment.new().merge(required).extract()).rejects.toThrow("required file");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});
