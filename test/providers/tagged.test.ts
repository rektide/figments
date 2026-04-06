import { describe, expect, it } from "vitest";

import {
  metadataFromCode,
  metadataFromEnv,
  metadataFromFile,
  metadataNamed,
} from "../../src/core/metadata.ts";
import { Figment } from "../../src/figment.ts";
import { Tagged, taggedProvider } from "../../src/providers/tagged.ts";
import { winnerMetadataName } from "../helpers.ts";

describe("Tagged provider usage", () => {
  it("applies node and subtree metadata rules to specific paths", async () => {
    const provider = Tagged.from({
      name: "TaggedExample",
      data: {
        default: {
          app: {
            host: "localhost",
            db: {
              user: "app",
              password: "secret",
            },
          },
        },
      },
      rules: [
        { path: "app.host", metadata: metadataFromEnv("EnvHost", "APP_HOST"), mode: "node" },
        {
          path: "app.db",
          metadata: metadataFromFile("VaultDb", "/run/secrets/app"),
          mode: "subtree",
        },
      ],
    });

    const figment = Figment.new().merge(provider);
    expect(await figment.extract<string>({ path: "app.host" })).toBe("localhost");
    expect(await figment.extract<string>({ path: "app.db.user" })).toBe("app");

    expect(await winnerMetadataName(figment, "app")).toBe("TaggedExample");
    expect(await winnerMetadataName(figment, "app.host")).toBe("EnvHost");
    expect(await winnerMetadataName(figment, "app.db")).toBe("VaultDb");
    expect(await winnerMetadataName(figment, "app.db.user")).toBe("VaultDb");
    expect(await winnerMetadataName(figment, "app.db.password")).toBe("VaultDb");
  });

  it("supports profile-specific rules", async () => {
    const provider = Tagged.from({
      name: "ProfileTagged",
      data: {
        default: { app: { host: "default.example" } },
        debug: { app: { host: "debug.example" } },
      },
      rules: [
        {
          profile: "debug",
          path: "app.host",
          metadata: metadataFromCode("DebugHost", "tagged.test.ts:debug"),
          mode: "node",
        },
      ],
    });

    const figment = Figment.new().merge(provider);
    const selectedDefault = figment.select("default");
    const selectedDebug = figment.select("debug");

    expect(await selectedDefault.extract<string>({ path: "app.host" })).toBe("default.example");
    expect(await selectedDebug.extract<string>({ path: "app.host" })).toBe("debug.example");
    expect(await winnerMetadataName(selectedDefault, "app.host")).toBe("ProfileTagged");
    expect(await winnerMetadataName(selectedDebug, "app.host")).toBe("DebugHost");
  });

  it("supports selectedProfile advertisement for profile seeding", async () => {
    const provider = Tagged.from({
      name: "SelectedProfileTagged",
      selectedProfile: "Debug",
      data: {
        default: { app: { mode: "default" } },
        debug: { app: { mode: "debug" } },
      },
    });

    const figment = Figment.new().merge(provider);
    expect(figment.selectedProfiles()).toEqual(["debug"]);
    expect(await figment.extract<string>({ path: "app.mode" })).toBe("debug");
  });

  it("taggedProvider() convenience helper matches Tagged.from()", async () => {
    const provider = taggedProvider({
      data: {
        default: { app: { name: "from-helper" } },
      },
      rules: [
        {
          path: "app.name",
          metadata: metadataNamed("HelperRule"),
        },
      ],
    });

    const figment = Figment.new().merge(provider);
    expect(await figment.extract<string>({ path: "app.name" })).toBe("from-helper");
    expect(await winnerMetadataName(figment, "app.name")).toBe("HelperRule");
  });
});

describe("Tagged provider rule behavior", () => {
  it("node mode retags only the matched node", async () => {
    const provider = Tagged.from({
      name: "NodeOnly",
      data: {
        default: {
          app: {
            db: {
              user: "app",
              password: "secret",
            },
          },
        },
      },
      rules: [{ path: "app.db", metadata: metadataNamed("DbNode"), mode: "node" }],
    });

    const figment = Figment.new().merge(provider);
    expect(await winnerMetadataName(figment, "app.db")).toBe("DbNode");
    expect(await winnerMetadataName(figment, "app.db.user")).toBe("NodeOnly");
    expect(await winnerMetadataName(figment, "app.db.password")).toBe("NodeOnly");
  });

  it("strict mode throws on missing paths", () => {
    expect(() =>
      Tagged.from({
        data: { default: { app: { name: "demo" } } },
        strict: true,
        rules: [{ path: "app.missing", metadata: metadataNamed("MissingRule") }],
      }),
    ).toThrow("path 'app.missing' not found");
  });

  it("strict mode throws on unknown profiles", () => {
    expect(() =>
      Tagged.from({
        data: { default: { app: { name: "demo" } } },
        strict: true,
        rules: [{ profile: "debug", path: "app.name", metadata: metadataNamed("DebugRule") }],
      }),
    ).toThrow("profile 'debug' not found");
  });

  it("non-strict mode ignores unmatched rules", async () => {
    const provider = Tagged.from({
      name: "NonStrict",
      data: { default: { app: { name: "demo" } } },
      strict: false,
      rules: [
        { profile: "debug", path: "app.name", metadata: metadataNamed("IgnoredProfile") },
        { path: "app.missing", metadata: metadataNamed("IgnoredPath") },
      ],
    });

    const figment = Figment.new().merge(provider);
    expect(await figment.extract<string>({ path: "app.name" })).toBe("demo");
    expect(await winnerMetadataName(figment, "app.name")).toBe("NonStrict");
  });

  it("returns defensive copies from metadataMap() and tagMap()", () => {
    const provider = Tagged.from({
      name: "CopyCheck",
      data: { default: { app: { name: "demo" } } },
      rules: [{ path: "app.name", metadata: metadataNamed("NameRule") }],
    });

    const metadataMapA = provider.metadataMap();
    metadataMapA.set(9_999, metadataNamed("Mutated"));
    const metadataMapB = provider.metadataMap();
    expect(metadataMapB.has(9_999)).toBe(false);

    const tagMapA = provider.tagMap();
    tagMapA.default.tag.metadataId = 9_999;
    const tagMapB = provider.tagMap();
    expect(tagMapB.default.tag.metadataId).not.toBe(9_999);
  });

  it("applies the last matching rule when multiple rules target same path", async () => {
    const provider = Tagged.from({
      name: "RuleOrder",
      data: { default: { app: { token: "value" } } },
      rules: [
        { path: "app.token", metadata: metadataNamed("FirstRule"), mode: "node" },
        { path: "app.token", metadata: metadataNamed("SecondRule"), mode: "node" },
      ],
    });

    const figment = Figment.new().merge(provider);
    expect(await winnerMetadataName(figment, "app.token")).toBe("SecondRule");
  });

  it("unscoped rules apply across all profiles", async () => {
    const provider = Tagged.from({
      name: "AllProfiles",
      data: {
        default: { app: { host: "default.example" } },
        debug: { app: { host: "debug.example" } },
      },
      rules: [{ path: "app.host", metadata: metadataNamed("SharedHostRule"), mode: "node" }],
    });

    const figment = Figment.new().merge(provider);
    expect(await winnerMetadataName(figment.select("default"), "app.host")).toBe("SharedHostRule");
    expect(await winnerMetadataName(figment.select("debug"), "app.host")).toBe("SharedHostRule");
  });
});
