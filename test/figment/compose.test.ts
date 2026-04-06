import { describe, expect, it } from "vitest";

import { Figment } from "../../src/figment.ts";
import { Serialized } from "../../src/providers/serialized.ts";
import type { Provider } from "../../src/provider.ts";
import { coalesceConflictFixtures, type FourWayCoalesceOrder } from "../fixtures/coalesce.ts";
import { NamedProvider, winnerMetadataName } from "../helpers.ts";

describe("figment composition", () => {
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

  it("adjoin concatenates arrays while keeping join semantics for scalars", async () => {
    const figment = Figment.new()
      .join(Serialized.default("name", "base"))
      .join(Serialized.default("items", ["a"]))
      .adjoin(Serialized.default("name", "incoming"))
      .adjoin(Serialized.default("items", ["b"]));

    expect(await figment.extract<string>({ path: "name" })).toBe("base");
    expect(await figment.extract<string[]>({ path: "items" })).toEqual(["a", "b"]);
  });

  it("applies fixture-driven conflicts for join/merge/adjoin/admerge", async () => {
    for (const fixture of coalesceConflictFixtures()) {
      const base = Figment.new().join(Serialized.default("value", fixture.current));
      for (const order of ["join", "merge", "adjoin", "admerge"] as FourWayCoalesceOrder[]) {
        const result = await applyFourWayOrder(
          base,
          order,
          Serialized.default("value", fixture.incoming),
        ).extract({ path: "value" });

        expect(result).toEqual(fixture.expected[order]);
      }
    }
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

  it("select(profile) matches selectProfiles([profile]) behavior", async () => {
    const base = Figment.new()
      .merge(Serialized.default("name", "default"))
      .merge(Serialized.default("name", "debug").profile("debug"));

    const viaSelect = base.select("debug");
    const viaSelectProfiles = base.selectProfiles(["debug"]);

    expect(viaSelect.selectedProfiles()).toEqual(["debug"]);
    expect(viaSelectProfiles.selectedProfiles()).toEqual(["debug"]);
    expect(await viaSelect.extract<string>({ path: "name" })).toBe("debug");
    expect(await viaSelectProfiles.extract<string>({ path: "name" })).toBe("debug");
  });

  it("profiles lists all profiles that currently have data", async () => {
    const figment = Figment.new()
      .merge(Serialized.defaults({ app: { name: "base" } }))
      .merge(Serialized.default("app.debug", true).profile("debug"))
      .merge(Serialized.global("app.fallback", true));

    expect((await figment.profiles()).sort()).toEqual(["debug", "default", "global"]);
  });

  it("Figment.from(provider) seeds a figment from provider data", async () => {
    const figment = Figment.from(Serialized.default("app.host", "from-provider"));
    expect(await figment.extract<string>({ path: "app.host" })).toBe("from-provider");
  });
});

function applyFourWayOrder(
  figment: Figment,
  order: FourWayCoalesceOrder,
  provider: Provider,
): Figment {
  switch (order) {
    case "join":
      return figment.join(provider);
    case "merge":
      return figment.merge(provider);
    case "adjoin":
      return figment.adjoin(provider);
    case "admerge":
      return figment.admerge(provider);
  }
}
