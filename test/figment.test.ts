import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { Figment } from "../src/figment.ts";
import { Env } from "../src/providers/env.ts";
import { Serialized } from "../src/providers/serialized.ts";
import { Toml } from "../src/providers/data.ts";
import type { Provider } from "../src/provider.ts";
import { metadataNamed } from "../src/core/metadata.ts";

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

  it("tracks metadata provenance for winning values", async () => {
    class NamedProvider implements Provider {
      public constructor(
        private readonly providerName: string,
        private readonly value: string,
      ) {}

      public metadata() {
        return metadataNamed(this.providerName);
      }

      public data() {
        return { default: { name: this.value } };
      }
    }

    const base = new NamedProvider("BaseProvider", "base");
    const incoming = new NamedProvider("IncomingProvider", "incoming");

    const merged = Figment.new().join(base).merge(incoming);
    const mergedMetadata = await merged.findMetadata("name");
    expect(mergedMetadata?.name).toBe("IncomingProvider");

    const joined = Figment.new().join(base).join(incoming);
    const joinedMetadata = await joined.findMetadata("name");
    expect(joinedMetadata?.name).toBe("BaseProvider");
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
    try {
      const figment = Figment.new().merge(Env.prefixed("TEST_FIGMENT_").split("_"));
      const config = await figment.extractLossy<{ app: { name: string; debug: boolean } }>();
      expect(config.app.name).toBe("demo");
      expect(config.app.debug).toBe(true);
    } finally {
      delete process.env.TEST_FIGMENT_APP_NAME;
      delete process.env.TEST_FIGMENT_APP_DEBUG;
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
});
