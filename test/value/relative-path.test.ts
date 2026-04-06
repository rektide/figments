import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { metadataFromEnv, metadataFromFile } from "../../src/core/metadata.ts";
import { Figment } from "../../src/figment.ts";
import { Env, Toml } from "../../src/providers/index.ts";
import { RelativePathBuf, decodeRelativePathBuf } from "../../src/value/relative-path.ts";
import { withEnv } from "../fixtures/env.ts";

describe("RelativePathBuf", () => {
  it("resolves relative to metadata file parent", () => {
    const metadata = metadataFromFile("TOML file", "/etc/myapp/Config.toml");
    const path = RelativePathBuf.from("templates/index.html", metadata);

    expect(path.original()).toBe("templates/index.html");
    expect(path.metadataPath()).toBe("/etc/myapp/Config.toml");
    expect(path.relative()).toBe("/etc/myapp/templates/index.html");
  });

  it("keeps absolute paths unchanged", () => {
    const metadata = metadataFromFile("TOML file", "/etc/myapp/Config.toml");
    const path = RelativePathBuf.from("/var/log/app.log", metadata);
    expect(path.relative()).toBe("/var/log/app.log");
  });

  it("returns original for non-file metadata", () => {
    const path = RelativePathBuf.from("templates/index.html", metadataFromEnv("Env", "APP_*"));
    expect(path.metadataPath()).toBeUndefined();
    expect(path.relative()).toBe("templates/index.html");
  });

  it("decodeRelativePathBuf validates input type", () => {
    expect(() => decodeRelativePathBuf(123)).toThrow("relative path value must be a string");
  });

  it("integrates with figment explain() for file-configured paths", async () => {
    const temp = await mkdtemp(join(tmpdir(), "figment-ts-"));
    const configPath = join(temp, "Config.toml");
    await writeFile(configPath, 'path = "assets/site.html"\n', "utf8");

    try {
      const figment = Figment.new().merge(Toml.file(configPath));
      const explained = await figment.explain({ path: "path" });
      const value = explained.value;
      if (typeof value !== "string") {
        throw new Error("expected path to decode as a string");
      }

      const relative = RelativePathBuf.from(value, explained.metadata);
      expect(relative.original()).toBe("assets/site.html");
      expect(relative.metadataPath()).toBe(configPath);
      expect(relative.relative()).toBe(join(temp, "assets/site.html"));
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("integrates with env overrides by keeping non-file paths as-is", async () => {
    const temp = await mkdtemp(join(tmpdir(), "figment-ts-"));
    const configPath = join(temp, "Config.toml");
    await writeFile(configPath, 'path = "assets/site.html"\n', "utf8");

    await withEnv({ TEST_PATH: '"env/override.html"' }, async () => {
      const figment = Figment.new().merge(Toml.file(configPath)).merge(Env.prefixed("TEST_"));
      const explained = await figment.explain({ path: "path" });
      const value = explained.value;
      if (typeof value !== "string") {
        throw new Error("expected env path to decode as a string");
      }

      const relative = RelativePathBuf.from(value, explained.metadata);
      expect(relative.original()).toBe("env/override.html");
      expect(relative.metadataPath()).toBeUndefined();
      expect(relative.relative()).toBe("env/override.html");
    });

    await rm(temp, { recursive: true, force: true });
  });
});
