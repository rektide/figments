import { describe, expect, it } from "vitest";

import { Figment } from "../../src/figment.ts";
import { Serialized } from "../../src/providers/serialized.ts";
import { NamedProvider, ProfileNamedProvider, allMetadataNames } from "../helpers.ts";

describe("path introspection", () => {
  it("contains reports path existence for present, missing, and undefined leaves", async () => {
    const figment = Figment.new().merge(
      Serialized.defaults({ app: { name: "demo", missing: undefined } }),
    );

    expect(await figment.contains("app.name")).toBe(true);
    expect(await figment.contains("app.missing")).toBe(false);
    expect(await figment.contains("app.nope")).toBe(false);
  });

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
      path: "missing",
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
