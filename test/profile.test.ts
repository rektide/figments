import { describe, expect, it } from "vitest";

import { Figment } from "../src/figment.ts";
import { Serialized } from "../src/providers/serialized.ts";
import { ProfileNamedProvider } from "./helpers.ts";

describe("selectProfiles", () => {
  it("overlays profiles in list order", async () => {
    const figment = Figment.new()
      .merge(new ProfileNamedProvider("DefaultSource", "default", { level: "default" }))
      .merge(new ProfileNamedProvider("ProfileA", "a", { level: "a" }))
      .merge(new ProfileNamedProvider("ProfileB", "b", { level: "b" }))
      .selectProfiles(["a", "b"]);

    expect(figment.selectedProfiles()).toEqual(["a", "b"]);
    expect(await figment.extract<string>({ path: "level" })).toBe("b");
  });
});

describe("profile normalization", () => {
  it("normalizes, dedupes, and strips built-in profile names", () => {
    const figment = Figment.new().selectProfiles(["A", "a", "default", "GLOBAL", "b"]);

    expect(figment.selectedProfiles()).toEqual(["a", "b"]);
    expect(figment.profile()).toBe("a");
  });
});

describe("spliceProfiles", () => {
  it("supports insert, replace, and remove", () => {
    const selected = Figment.new()
      .selectProfiles(["a", "c"])
      .spliceProfiles(1, 0, "b")
      .spliceProfiles(0, 1, "x")
      .spliceProfiles(1);

    expect(selected.selectedProfiles()).toEqual(["x"]);
  });
});

describe("missing profile handling", () => {
  it("skips missing selected profiles during extraction", async () => {
    const figment = Figment.new()
      .merge(new ProfileNamedProvider("DefaultSource", "default", { name: "default" }))
      .merge(new ProfileNamedProvider("ProfileA", "a", { name: "from-a" }))
      .selectProfiles(["missing", "a"]);

    expect(await figment.extract<string>({ path: "name" })).toBe("from-a");
  });
});

describe("winning metadata across overlays", () => {
  it("tracks winning metadata across multiple selected overlays", async () => {
    const { winnerMetadataName } = await import("./helpers.ts");
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
});

describe("select", () => {
  it("keeps select(profile) compatibility as single-overlay sugar", async () => {
    const figment = Figment.new()
      .merge(new ProfileNamedProvider("DefaultSource", "default", { value: "default" }))
      .merge(new ProfileNamedProvider("ProfileA", "a", { value: "a" }))
      .select("a");

    expect(figment.selectedProfiles()).toEqual(["a"]);
    expect(figment.profile()).toBe("a");
    expect(await figment.extract<string>({ path: "value" })).toBe("a");
  });
});

describe("default/global fallback", () => {
  it("falls back to default and global when no overlays are selected", async () => {
    const figment = Figment.new()
      .merge(new ProfileNamedProvider("DefaultSource", "default", { value: "default" }))
      .merge(new ProfileNamedProvider("GlobalSource", "global", { value: "global" }))
      .selectProfiles(["default", "global"]);

    expect(figment.selectedProfiles()).toEqual([]);
    expect(await figment.extract<string>({ path: "value" })).toBe("global");
  });
});

describe("providerProfileSelection", () => {
  it("defaults to seedWhenEmpty mode", async () => {
    const figment = Figment.new()
      .merge(Serialized.default("value", "default"))
      .merge(Serialized.default("value", "debug").profile("debug"));

    expect(figment.selectedProfiles()).toEqual(["debug"]);
    expect(await figment.extract<string>({ path: "value" })).toBe("debug");
  });

  it("supports 'never' mode", async () => {
    const figment = Figment.new()
      .providerProfileSelection("never")
      .merge(Serialized.default("value", "default"))
      .merge(Serialized.default("value", "debug").profile("debug"));

    expect(figment.selectedProfiles()).toEqual([]);
    expect(await figment.extract<string>({ path: "value" })).toBe("default");
    expect(await figment.select("debug").extract<string>({ path: "value" })).toBe("debug");
  });

  it("supports 'coalesce' mode", async () => {
    const figment = Figment.new()
      .selectProfiles(["base", "extra"])
      .providerProfileSelection("coalesce")
      .merge(Serialized.default("value", "debug").profile("debug"))
      .join(Serialized.default("value", "ignored").profile("other"));

    expect(figment.selectedProfiles()).toEqual(["debug"]);
  });
});
