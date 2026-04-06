import { describe, expect, it } from "vitest";

import { Figment } from "../src/figment.ts";
import { FigmentError } from "../src/core/error.ts";
import { FIGMENTS_STATE } from "../src/state.ts";
import { Serialized } from "../src/providers/serialized.ts";
import {
  NamedProvider,
  ProfileNamedProvider,
  TaggedEntryProvider,
  allMetadataNames,
  winnerMetadataName,
} from "./helpers.ts";

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

describe("decoder behavior", () => {
  it("extract supports parse-style deserializers", async () => {
    const figment = Figment.new().merge(Serialized.defaults({ port: "8080" }));
    const config = await figment.build({
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
    const count = await figment.extract({
      path: "count",
      deser: (value) => {
        if (typeof value !== "string") {
          throw new Error("count must be a string");
        }

        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed)) {
          throw new Error("count must be an integer string");
        }

        return parsed;
      },
    });

    expect(count).toBe(42);
  });

  it("extract runs deserializer for missing='undefined' values", async () => {
    const figment = Figment.new().merge(Serialized.defaults({ present: true }));
    const decoded = await figment.extract({
      // Intentionally request a key that does not exist.
      path: "missing",
      // For a missing path, resolve to `undefined` instead of throwing.
      // This ensures the deserializer receives `undefined` and can handle it.
      missing: "undefined",
      deser: (value) => {
        if (value !== undefined) {
          throw new Error("expected undefined");
        }

        return "handled-missing";
      },
    });

    expect(decoded).toBe("handled-missing");
  });

  it("wraps decoder failures as FigmentError", async () => {
    const figment = Figment.new().merge(Serialized.defaults({ port: "not-a-number" }));

    await expect(
      figment.build({
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
      figment.extract({
        path: "count",
        deser: (value) => {
          if (typeof value !== "number") {
            throw FigmentError.invalidType("number", value);
          }

          return value;
        },
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
      await figment.extract({
        path: "app.count",
        deser: (value) => {
          if (typeof value !== "number") {
            throw FigmentError.invalidType("number", value);
          }

          return value;
        },
      });
    } catch (error) {
      expect(String(error)).toContain("provider key 'default.app.count'");
    }
  });
});

describe("path introspection", () => {
  it("extract with missing policy returns optional values without throwing", async () => {
    const figment = Figment.new().merge(Serialized.default("app.port", 8080));

    expect(await figment.extract({ path: "app.port", missing: "undefined" })).toBe(8080);
    expect(await figment.extract({ path: "app.missing", missing: "undefined" })).toBeUndefined();
  });

  it("treats serialized undefined as missing during extraction", async () => {
    const figment = Figment.new().merge(Serialized.defaults({ app: { missing: undefined } }));

    expect(await figment.extract({ path: "app.missing", missing: "undefined" })).toBeUndefined();
    expect(await figment.contains("app.missing")).toBe(false);
  });

  it("lets explicit values override undefined during coalesce", async () => {
    const joinOverEmpty = Figment.new()
      .join(Serialized.default("name", undefined))
      .join(Serialized.default("name", "incoming"));
    expect(await joinOverEmpty.extract({ path: "name" })).toBe("incoming");

    const mergeOverEmpty = Figment.new()
      .merge(Serialized.default("name", "base"))
      .merge(Serialized.default("name", undefined));
    expect(await mergeOverEmpty.extract({ path: "name" })).toBe("base");
  });

  it("build preserves undefined leaves", async () => {
    const figment = Figment.new().merge(Serialized.defaults({ app: { missing: undefined } }));
    const config = await figment.build<{ app: { missing?: string } }>();

    expect(Object.hasOwn(config.app, "missing")).toBe(true);
    expect(config.app.missing).toBeUndefined();
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

  it("explain runs deserializer for missing='undefined' values", async () => {
    const figment = Figment.new().merge(Serialized.defaults({ present: true }));
    const explained = await figment.explain({
      // Intentionally request a missing key so explain() resolves through missing policy.
      path: "missing",
      // Use undefined-missing policy to validate that the decoder runs on `undefined`.
      missing: "undefined",
      deser: (value) => {
        if (value !== undefined) {
          throw new Error("expected undefined");
        }

        return "decoded-missing";
      },
    });

    expect(explained.exists).toBe(false);
    expect(explained.value).toBe("decoded-missing");
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
