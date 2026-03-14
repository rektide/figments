import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { Figment } from "../src/figment.ts";
import { FigmentAggregateError, FigmentError } from "../src/core/error.ts";
import { FIGMENTS_STATE } from "../src/state.ts";
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

async function winnerMetadataName(figment: Figment, path: string): Promise<string | undefined> {
  return (await figment.explain({ path, includeMetadata: "winner" })).metadata?.name;
}

async function allMetadataNames(figment: Figment, path: string): Promise<string[]> {
  return ((await figment.explain({ path, includeMetadata: "all" })).metadataAll ?? []).map(
    (metadata) => metadata.name,
  );
}

describe("figment merge behavior", () => {
  it("build materializes the full resolved config object", async () => {
    const figment = Figment.new()
      .merge(Serialized.defaults({ app: { host: "base", enabled: "yes" } }))
      .merge(Serialized.default("app.host", "incoming"));

    const built = await figment.build<{ app: { host: string; enabled: boolean } }>({
      interpret: "lossy",
      deser: {
        parse(value) {
          return value as { app: { host: string; enabled: boolean } };
        },
      },
    });

    expect(built).toEqual({ app: { host: "incoming", enabled: true } });
  });

  it("merge prefers incoming values while join keeps existing", async () => {
    const merged = Figment.new()
      .join(Serialized.default("name", "base"))
      .join(Serialized.default("items", ["a"]))
      .merge(Serialized.default("name", "incoming"));
    expect(await merged.extract<string>({ path: "name" })).toBe("incoming");

    const joined = Figment.new()
      .join(Serialized.default("name", "base"))
      .join(Serialized.default("name", "ignored"));

    expect(await joined.extract<string>({ path: "name" })).toBe("base");
  });

  it("admerge concatenates arrays", async () => {
    const figment = Figment.new()
      .join(Serialized.default("items", ["a"]))
      .admerge(Serialized.default("items", ["b"]));

    expect(await figment.extract<string[]>({ path: "items" })).toEqual(["a", "b"]);
  });

  it("zipjoin and zipmerge coalesce arrays by index", async () => {
    const base = new NamedProvider("BaseProvider", { items: [1, 2] });
    const incoming = new NamedProvider("IncomingProvider", { items: [2, 3, 4] });

    const joined = Figment.new().join(base).zipjoin(incoming);
    expect(await joined.extract<number[]>({ path: "items" })).toEqual([1, 2, 4]);
    expect(await winnerMetadataName(joined, "items")).toBe("BaseProvider");
    expect(await winnerMetadataName(joined, "items.0")).toBe("BaseProvider");
    expect(await winnerMetadataName(joined, "items.1")).toBe("BaseProvider");
    expect(await winnerMetadataName(joined, "items.2")).toBe("IncomingProvider");

    const merged = Figment.new().join(base).zipmerge(incoming);
    expect(await merged.extract<number[]>({ path: "items" })).toEqual([2, 3, 4]);
    expect(await winnerMetadataName(merged, "items")).toBe("IncomingProvider");
    expect(await winnerMetadataName(merged, "items.0")).toBe("IncomingProvider");
    expect(await winnerMetadataName(merged, "items.1")).toBe("IncomingProvider");
    expect(await winnerMetadataName(merged, "items.2")).toBe("IncomingProvider");
  });

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

  it("supports array indices in key paths", async () => {
    const figment = Figment.new().merge(
      Serialized.default("servers", [
        { host: "a", ports: [80, 443] },
        { host: "b", ports: [8080] },
      ]),
    );

    expect(await figment.extract<string>({ path: "servers.1.host" })).toBe("b");
    expect(await figment.extract<number>({ path: "servers.0.ports.1" })).toBe(443);
    expect(await figment.contains("servers.0.ports.2")).toBe(false);
    expect(await winnerMetadataName(figment, "servers.0.ports.1")).toBe("Serialized");
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
    expect(metadata?.provideLocation).toContain("figment.test.ts");
  });

  it("supports provider-supplied metadata map and per-entry tags", async () => {
    const figment = Figment.new().merge(new TaggedEntryProvider());
    expect(await winnerMetadataName(figment, "alpha")).toBe("AlphaSource");
    expect(await winnerMetadataName(figment, "beta")).toBe("BetaSource");
  });

  it("figment chaining methods are immutable", async () => {
    const base = Figment.new().merge(Serialized.default("name", "default"));
    const withDebugProfile = base.merge(Serialized.default("name", "debug").profile("debug"));

    const selectedDefault = withDebugProfile.select("default");
    const selectedDebug = withDebugProfile.select("debug");
    const extended = base.merge(Serialized.default("extra", true));

    expect(await base.extract<string>({ path: "name" })).toBe("default");
    expect(await withDebugProfile.extract<string>({ path: "name" })).toBe("debug");
    expect(await selectedDefault.extract<string>({ path: "name" })).toBe("default");
    expect(await selectedDebug.extract<string>({ path: "name" })).toBe("debug");
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
      const config = await figment.extract<{
        app: { name: string; debug: boolean };
        array: number[];
      }>({ interpret: "lossy" });
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

  it("supports custom env value parser", async () => {
    process.env.TEST_FIGMENT_ENVFIX_LIST = "[1,2,3]";
    process.env.TEST_FIGMENT_ENVFIX_COUNT = "7";

    try {
      const figment = Figment.new().merge(
        Env.prefixed("TEST_FIGMENT_ENVFIX_").parser((value) => {
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        }),
      );

      const config = await figment.extract<{ list: number[]; count: number }>();
      expect(config.list).toEqual([1, 2, 3]);
      expect(config.count).toBe(7);
    } finally {
      delete process.env.TEST_FIGMENT_ENVFIX_LIST;
      delete process.env.TEST_FIGMENT_ENVFIX_COUNT;
    }
  });

  it("supports ignoring empty env values", async () => {
    process.env.TEST_FIGMENT_ENVFIX_EMPTY = "";
    process.env.TEST_FIGMENT_ENVFIX_SET = "present";

    try {
      const withEmpty = Figment.new().merge(Env.prefixed("TEST_FIGMENT_ENVFIX_"));
      expect(await withEmpty.extract<string>({ path: "empty" })).toBe("");

      const ignoreEmpty = Figment.new().merge(
        Env.prefixed("TEST_FIGMENT_ENVFIX_").ignoreEmpty(true),
      );
      expect(await ignoreEmpty.contains("empty")).toBe(false);
      expect(await ignoreEmpty.extract<string>({ path: "set" })).toBe("present");
    } finally {
      delete process.env.TEST_FIGMENT_ENVFIX_EMPTY;
      delete process.env.TEST_FIGMENT_ENVFIX_SET;
    }
  });
});

describe("decoder behavior", () => {
  it("extract supports parse-style deserializers", async () => {
    const figment = Figment.new().merge(Serialized.defaults({ port: "8080" }));
    const config = await figment.extract({
      deser: {
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
      },
    });

    expect(config).toEqual({ port: 8080 });
  });

  it("extract decodes path values", async () => {
    const figment = Figment.new().merge(Serialized.default("count", "42"));
    const count = await figment.extract({ path: "count", deser: (value) => {
      if (typeof value !== "string") {
        throw new Error("count must be a string");
      }

      const parsed = Number.parseInt(value, 10);
      if (Number.isNaN(parsed)) {
        throw new Error("count must be an integer string");
      }

      return parsed;
    } });

    expect(count).toBe(42);
  });

  it("wraps decoder failures as FigmentError", async () => {
    const figment = Figment.new().merge(Serialized.defaults({ port: "not-a-number" }));

    await expect(
      figment.extract({
        deser: {
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
        },
      }),
    ).rejects.toThrow("failed to decode config: port must be an integer string");
  });

  it("preserves structured decoder errors with typed mismatch details", async () => {
    const figment = Figment.new().merge(Serialized.default("count", "42"));

    await expect(
      figment.extract({ path: "count", deser: (value) => {
        if (typeof value !== "number") {
          throw FigmentError.invalidType("number", value);
        }

        return value;
      } }),
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
      await figment.extract({ path: "app.count", deser: (value) => {
        if (typeof value !== "number") {
          throw FigmentError.invalidType("number", value);
        }

        return value;
      } });
    } catch (error) {
      expect(String(error)).toContain("provider key 'default.app.count'");
    }
  });
});

describe("error taxonomy", () => {
  it("supports expanded structured error kinds", () => {
    const invalidLength = FigmentError.invalidLength(4, "length 2");
    expect(invalidLength.kind).toBe("InvalidLength");
    expect(String(invalidLength)).toContain("length 4");

    const unknownField = FigmentError.unknownField("typo", ["type", "top"]);
    expect(unknownField.kind).toBe("UnknownField");
    expect(String(unknownField)).toContain("expected one of: type, top");

    const unknownVariant = FigmentError.unknownVariant("teal", ["red", "green", "blue"]);
    expect(unknownVariant.kind).toBe("UnknownVariant");
    expect(String(unknownVariant)).toContain("expected one of: red, green, blue");

    const duplicateField = FigmentError.duplicateField("name");
    expect(duplicateField.kind).toBe("DuplicateField");
    expect(String(duplicateField)).toContain("'name'");

    const unsupported = FigmentError.unsupported(Symbol("x"));
    expect(unsupported.kind).toBe("Unsupported");

    const unsupportedKey = FigmentError.unsupportedKey(true, "string key");
    expect(unsupportedKey.kind).toBe("UnsupportedKey");
    expect(String(unsupportedKey)).toContain("need string key");
  });

  it("keeps missing helper and aggregate count", () => {
    const missing = FigmentError.missingField("a.b");
    const aggregate = new FigmentAggregateError([FigmentError.message("second"), missing]);

    expect(missing.missing()).toBe(true);
    expect(aggregate.missing()).toBe(true);
    expect(aggregate.count()).toBe(2);
  });

  it("provides iterable aggregate traversal helpers", () => {
    const aggregate = new FigmentAggregateError([
      FigmentError.message("one"),
      FigmentError.message("two"),
      FigmentError.message("three"),
    ]);

    expect(aggregate.toArray().map((error) => error.message)).toEqual(["one", "two", "three"]);
    expect([...aggregate].map((error) => error.message)).toEqual(["one", "two", "three"]);
  });

  it("maps decoder issue arrays into aggregate figment errors", () => {
    const mapped = FigmentError.decode("config", {
      issues: [
        {
          code: "invalid_type",
          message: "expected number, received string",
          expected: "number",
          received: "oops",
          path: ["app", "port"],
        },
        {
          code: "unrecognized_keys",
          message: "unrecognized key(s): extra",
          keys: ["extra"],
          path: ["app"],
        },
      ],
    });

    expect(mapped).toBeInstanceOf(FigmentAggregateError);
    if (mapped instanceof FigmentAggregateError) {
      expect(mapped.count()).toBe(2);
      expect(mapped.errors[0].kind).toBe("InvalidType");
      expect(mapped.errors[0].path).toEqual(["app", "port"]);
      expect(mapped.errors[1].kind).toBe("UnknownField");
      expect(mapped.errors[1].path).toEqual(["app"]);
    }
  });
});

describe("path introspection", () => {
  it("extract with missing policy returns optional values without throwing", async () => {
    const figment = Figment.new().merge(Serialized.default("app.port", 8080));

    expect(await figment.extract({ path: "app.port", missing: "undefined" })).toBe(8080);
    expect(await figment.extract({ path: "app.missing", missing: "undefined" })).toBeUndefined();
  });

  it("explain returns value, metadata, and profile context", async () => {
    const figment = Figment.new()
      .merge(new ProfileNamedProvider("DefaultSource", "default", { app: { name: "base" } }))
      .merge(new ProfileNamedProvider("DebugSource", "debug", { app: { name: "debug" } }))
      .selectProfiles(["debug"]);

    const resolved = await figment.explain({ path: "app.name" });
    expect(resolved.exists).toBe(true);
    expect(resolved.value).toBe("debug");
    expect(resolved.metadata?.name).toBe("DebugSource");
    expect(resolved.tag?.profile).toBe("debug");
    expect(resolved.selectedProfiles).toEqual(["debug"]);
    expect(resolved.effectiveProfileOrder).toEqual(["default", "debug", "global"]);

    const missing = await figment.explain({ path: "app.missing" });
    expect(missing.exists).toBe(false);
    expect(missing.value).toBeUndefined();
    expect(missing.metadata).toBeUndefined();
  });

  it("explain(includeMetadata='all') returns deterministic unique contributor metadata", async () => {
    const figment = Figment.new()
      .merge(
        new NamedProvider("BaseProvider", {
          app: {
            name: "base",
            ports: [80, 443],
          },
        }),
      )
      .merge(
        new NamedProvider("IncomingProvider", {
          app: {
            ports: [81],
          },
        }),
      );

    expect(await allMetadataNames(figment, "app")).toEqual(["IncomingProvider", "BaseProvider"]);
    expect(await allMetadataNames(figment, "app.ports")).toEqual(["IncomingProvider"]);
    expect(await allMetadataNames(figment, "app.name")).toEqual(["BaseProvider"]);
    expect(await allMetadataNames(figment, "app.missing")).toEqual([]);
  });
});

describe("state exposure", () => {
  it("state returns live mutable figment internals", async () => {
    const figment = Figment.new().merge(Serialized.default("name", "base"));

    const state = figment.state();
    await state.pending;
    expect(state.pending).toBeInstanceOf(Promise);

    const latest = figment.state();
    expect(latest.activeProfiles).toEqual([]);
    expect(latest.providerProfileSelectionMode).toBe("seedWhenEmpty");
    expect(latest.metadataByTag.size).toBeGreaterThan(0);

    latest.activeProfiles.push("debug");
    expect(figment.selectedProfiles()).toEqual(["debug"]);

    const defaults = latest.values.default;
    expect(defaults).toBeDefined();
    if (defaults) {
      defaults.name = "mutated";
    }

    expect(await figment.extract<string>({ path: "name" })).toBe("mutated");

    const symbolState = figment[FIGMENTS_STATE]();
    expect(symbolState.values).toBe(latest.values);
    expect(symbolState.metadataByTag).toBe(latest.metadataByTag);
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
    expect(await figment.extract<string>({ path: "level" })).toBe("b");
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

    expect(await figment.extract<string>({ path: "name" })).toBe("from-a");
  });

  it("tracks winning metadata across multiple selected overlays", async () => {
    const figment = Figment.new()
      .merge(new ProfileNamedProvider("DefaultSource", "default", { mode: "default" }))
      .merge(new ProfileNamedProvider("ProfileA", "a", { mode: "a" }))
      .merge(new ProfileNamedProvider("ProfileB", "b", { mode: "b" }))
      .merge(new ProfileNamedProvider("ProfileC", "c", { mode: "c" }));

    const selectedABC = figment.selectProfiles(["a", "b", "c"]);
    expect(await selectedABC.extract<string>({ path: "mode" })).toBe("c");
    expect(await winnerMetadataName(selectedABC, "mode")).toBe("ProfileC");

    const selectedBA = figment.selectProfiles(["b", "a"]);
    expect(await selectedBA.extract<string>({ path: "mode" })).toBe("a");
    expect(await winnerMetadataName(selectedBA, "mode")).toBe("ProfileA");
  });

  it("keeps select(profile) compatibility as single-overlay sugar", async () => {
    const figment = Figment.new()
      .merge(new ProfileNamedProvider("DefaultSource", "default", { value: "default" }))
      .merge(new ProfileNamedProvider("ProfileA", "a", { value: "a" }))
      .select("a");

    expect(figment.selectedProfiles()).toEqual(["a"]);
    expect(figment.profile()).toBe("a");
    expect(await figment.extract<string>({ path: "value" })).toBe("a");
  });

  it("falls back to default and global when no overlays are selected", async () => {
    const figment = Figment.new()
      .merge(new ProfileNamedProvider("DefaultSource", "default", { value: "default" }))
      .merge(new ProfileNamedProvider("GlobalSource", "global", { value: "global" }))
      .selectProfiles(["default", "global"]);

    expect(figment.selectedProfiles()).toEqual([]);
    expect(await figment.extract<string>({ path: "value" })).toBe("global");
  });

  it("defaults provider profile selection mode to seedWhenEmpty", async () => {
    const figment = Figment.new()
      .merge(Serialized.default("value", "default"))
      .merge(Serialized.default("value", "debug").profile("debug"));

    expect(figment.selectedProfiles()).toEqual(["debug"]);
    expect(await figment.extract<string>({ path: "value" })).toBe("debug");
  });

  it("supports provider profile selection mode 'never'", async () => {
    const figment = Figment.new()
      .providerProfileSelection("never")
      .merge(Serialized.default("value", "default"))
      .merge(Serialized.default("value", "debug").profile("debug"));

    expect(figment.selectedProfiles()).toEqual([]);
    expect(await figment.extract<string>({ path: "value" })).toBe("default");
    expect(await figment.select("debug").extract<string>({ path: "value" })).toBe("debug");
  });

  it("supports provider profile selection mode 'coalesce'", async () => {
    const figment = Figment.new()
      .selectProfiles(["base", "extra"])
      .providerProfileSelection("coalesce")
      .merge(Serialized.default("value", "debug").profile("debug"))
      .join(Serialized.default("value", "ignored").profile("other"));

    expect(figment.selectedProfiles()).toEqual(["debug"]);
  });
});
