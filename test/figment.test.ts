import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { Figment } from "../src/figment.ts";
import { FigmentError } from "../src/core/error.ts";
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

class ProfileNamedProvider implements Provider {
  public constructor(
    private readonly providerName: string,
    private readonly profileName: string,
    private readonly payload: ConfigDict,
  ) {}

  public metadata() {
    return metadataNamed(this.providerName);
  }

  public data() {
    return { [this.profileName]: this.payload };
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

describe("decoder behavior", () => {
  it("extractWith supports parse-style decoders", async () => {
    const figment = Figment.new().merge(Serialized.defaults({ port: "8080" }));
    const config = await figment.extractWith({
      parse(value) {
        const raw = value.port;
        if (typeof raw !== "string") {
          throw new Error("port must be a string");
        }

        const parsed = Number.parseInt(raw, 10);
        if (Number.isNaN(parsed)) {
          throw new Error("port must be an integer string");
        }

        return { port: parsed };
      },
    });

    expect(config).toEqual({ port: 8080 });
  });

  it("extractInnerWith decodes path values", async () => {
    const figment = Figment.new().merge(Serialized.default("count", "42"));
    const count = await figment.extractInnerWith("count", (value) => {
      if (typeof value !== "string") {
        throw new Error("count must be a string");
      }

      const parsed = Number.parseInt(value, 10);
      if (Number.isNaN(parsed)) {
        throw new Error("count must be an integer string");
      }

      return parsed;
    });

    expect(count).toBe(42);
  });

  it("wraps decoder failures as FigmentError", async () => {
    const figment = Figment.new().merge(Serialized.defaults({ port: "not-a-number" }));

    await expect(
      figment.extractWith({
        parse(value) {
          const raw = value.port;
          if (typeof raw !== "string") {
            throw new Error("port must be a string");
          }

          const parsed = Number.parseInt(raw, 10);
          if (Number.isNaN(parsed)) {
            throw new Error("port must be an integer string");
          }

          return { port: parsed };
        },
      }),
    ).rejects.toThrow("failed to decode config: port must be an integer string");
  });

  it("preserves structured decoder errors with typed mismatch details", async () => {
    const figment = Figment.new().merge(Serialized.default("count", "42"));

    await expect(
      figment.extractInnerWith("count", (value) => {
        if (typeof value !== "number") {
          throw FigmentError.invalidType("number", value);
        }

        return value;
      }),
    ).rejects.toMatchObject({
      kind: "InvalidType",
      expected: "number",
      actual: "string",
      path: ["count"],
      profile: "default",
    });
  });

  it("includes provider interpolation in decoder errors", async () => {
    expect.assertions(1);
    const figment = Figment.new().merge(Serialized.default("app.count", "oops"));

    try {
      await figment.extractInnerWith("app.count", (value) => {
        if (typeof value !== "number") {
          throw FigmentError.invalidType("number", value);
        }

        return value;
      });
    } catch (error) {
      expect(String(error)).toContain("provider key 'default.app.count'");
    }
  });
});

describe("multi-profile behavior", () => {
  it("selectProfiles overlays profiles in list order", async () => {
    const figment = Figment.new()
      .merge(new ProfileNamedProvider("DefaultSource", "default", { level: "default" }))
      .merge(new ProfileNamedProvider("ProfileA", "a", { level: "a" }))
      .merge(new ProfileNamedProvider("ProfileB", "b", { level: "b" }))
      .selectProfiles(["a", "b"]);

    expect(figment.selectedProfiles()).toEqual(["a", "b"]);
    expect(await figment.extractInner<string>("level")).toBe("b");
  });

  it("normalizes, dedupes, and strips built-in profile names", async () => {
    const figment = Figment.new().selectProfiles(["A", "a", "default", "GLOBAL", "b"]);

    expect(figment.selectedProfiles()).toEqual(["a", "b"]);
    expect(figment.profile()).toBe("a");
  });

  it("spliceProfiles supports insert, replace, and remove", () => {
    const selected = Figment.new()
      .selectProfiles(["a", "c"])
      .spliceProfiles(1, 0, "b")
      .spliceProfiles(0, 1, "x")
      .spliceProfiles(1);

    expect(selected.selectedProfiles()).toEqual(["x"]);
  });

  it("skips missing selected profiles during extraction", async () => {
    const figment = Figment.new()
      .merge(new ProfileNamedProvider("DefaultSource", "default", { name: "default" }))
      .merge(new ProfileNamedProvider("ProfileA", "a", { name: "from-a" }))
      .selectProfiles(["missing", "a"]);

    expect(await figment.extractInner<string>("name")).toBe("from-a");
  });

  it("tracks winning metadata across multiple selected overlays", async () => {
    const figment = Figment.new()
      .merge(new ProfileNamedProvider("DefaultSource", "default", { mode: "default" }))
      .merge(new ProfileNamedProvider("ProfileA", "a", { mode: "a" }))
      .merge(new ProfileNamedProvider("ProfileB", "b", { mode: "b" }))
      .merge(new ProfileNamedProvider("ProfileC", "c", { mode: "c" }));

    const selectedABC = figment.selectProfiles(["a", "b", "c"]);
    expect(await selectedABC.extractInner<string>("mode")).toBe("c");
    expect((await selectedABC.findMetadata("mode"))?.name).toBe("ProfileC");

    const selectedBA = figment.selectProfiles(["b", "a"]);
    expect(await selectedBA.extractInner<string>("mode")).toBe("a");
    expect((await selectedBA.findMetadata("mode"))?.name).toBe("ProfileA");
  });

  it("keeps select(profile) compatibility as single-overlay sugar", async () => {
    const figment = Figment.new()
      .merge(new ProfileNamedProvider("DefaultSource", "default", { value: "default" }))
      .merge(new ProfileNamedProvider("ProfileA", "a", { value: "a" }))
      .select("a");

    expect(figment.selectedProfiles()).toEqual(["a"]);
    expect(figment.profile()).toBe("a");
    expect(await figment.extractInner<string>("value")).toBe("a");
  });

  it("falls back to default and global when no overlays are selected", async () => {
    const figment = Figment.new()
      .merge(new ProfileNamedProvider("DefaultSource", "default", { value: "default" }))
      .merge(new ProfileNamedProvider("GlobalSource", "global", { value: "global" }))
      .selectProfiles(["default", "global"]);

    expect(figment.selectedProfiles()).toEqual([]);
    expect(await figment.extractInner<string>("value")).toBe("global");
  });
});
