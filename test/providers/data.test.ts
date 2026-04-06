import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { Figment } from "../../src/figment.ts";
import { Json, Toml, Yaml } from "../../src/providers/data.ts";

describe("Data.file (Toml)", () => {
  it("loads toml from file", async () => {
    const temp = await mkdtemp(join(tmpdir(), "figment-ts-"));
    const path = join(temp, "Config.toml");
    await writeFile(path, 'name = "demo"\ncount = 12\n', "utf8");

    try {
      const figment = Figment.new().merge(Toml.file(path));
      const config = await figment.build<{ name: string; count: number }>();
      expect(config).toEqual({ name: "demo", count: 12 });
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("supports parent-directory search when enabled", async () => {
    const temp = await mkdtemp(join(tmpdir(), "figment-ts-"));
    const configPath = join(temp, "Config.toml");
    const deep = join(temp, "a", "b", "c");
    await mkdir(deep, { recursive: true });
    await writeFile(configPath, 'name = "searched"\n', "utf8");

    const previousCwd = process.cwd();
    process.chdir(deep);
    try {
      const searched = Figment.new().merge(Toml.file("Config.toml").required(true));
      expect(await searched.extract<string>({ path: "name" })).toBe("searched");

      const noSearch = Figment.new().merge(Toml.file("Config.toml").search(false));
      expect(await noSearch.build()).toEqual({});

      const noSearchRequired = Figment.new().merge(
        Toml.file("Config.toml").search(false).required(true),
      );
      await expect(noSearchRequired.build()).rejects.toThrow("required file");
    } finally {
      process.chdir(previousCwd);
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("throws on missing required file", async () => {
    const temp = await mkdtemp(join(tmpdir(), "figment-ts-"));
    const missing = join(temp, "Missing.toml");

    try {
      const optional = Toml.file(missing);
      const required = optional.required(true);

      expect(await Figment.new().merge(optional).build()).toEqual({});
      await expect(Figment.new().merge(required).build()).rejects.toThrow("required file");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});

describe("Data.string", () => {
  it("loads toml from inline string", async () => {
    const figment = Figment.new().merge(Toml.string('name = "inline"\ncount = 3\n'));
    expect(await figment.build<{ name: string; count: number }>()).toEqual({
      name: "inline",
      count: 3,
    });
  });

  it("treats top-level keys as profiles in nested mode", async () => {
    const nested = Toml.string('[default]\nname = "demo"\n[DEBUG]\nname = "debug"\n').nested();
    expect(nested.selectedProfile()).toBeUndefined();
    expect(await nested.data()).toEqual({
      default: { name: "demo" },
      debug: { name: "debug" },
    });
  });

  it("supports explicit profile assignment", async () => {
    const provider = Toml.string('name = "demo"\n').profile("Debug");
    expect(provider.selectedProfile()).toBe("debug");
    expect(await provider.data()).toEqual({
      debug: { name: "demo" },
    });
  });
});

describe("format providers", () => {
  it("loads JSON data", async () => {
    const figment = Figment.new().merge(Json.string('{"name":"json","count":7}'));
    expect(await figment.build<{ name: string; count: number }>()).toEqual({
      name: "json",
      count: 7,
    });
  });

  it("loads YAML data", async () => {
    const figment = Figment.new().merge(Yaml.string("name: yaml\ncount: 5\n"));
    expect(await figment.build<{ name: string; count: number }>()).toEqual({
      name: "yaml",
      count: 5,
    });
  });
});

describe("metadata", () => {
  it("exposes file metadata for file sources", () => {
    const metadata = Toml.file("Config.toml").metadata();
    expect(metadata.name).toBe("TOML file");
    expect(metadata.source).toEqual({ kind: "file", path: "Config.toml" });
  });

  it("exposes inline metadata for string sources", () => {
    const metadata = Toml.string('name = "inline"').metadata();
    expect(metadata.name).toBe("TOML source string");
    expect(metadata.source).toEqual({ kind: "inline", descriptor: "TOML inline string" });
  });
});
