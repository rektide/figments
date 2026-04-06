import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { Figment } from "../../src/figment.ts";
import { Env, Serialized, Toml, YamlExtended } from "../../src/providers/index.ts";
import { withEnv } from "../fixtures/env.ts";
import { winnerMetadataName } from "../helpers.ts";

describe("provider provenance integration", () => {
  it("Env provider integrates with winner metadata and tag lookup", async () => {
    await withEnv({ APP_APP_HOST: '"env.example"' }, async () => {
      const figment = Figment.new().merge(Env.prefixed("APP_").split("_"));

      expect(await winnerMetadataName(figment, "app.host")).toBe("`APP_` environment variable(s)");

      const explained = await figment.explain({ path: "app.host", includeMetadata: "winner" });
      expect(explained.tag?.profile).toBe("default");
      expect(explained.metadata?.source).toEqual({ kind: "env", selector: "APP_*" });

      const byTag = await figment.getMetadata(explained.tag);
      expect(byTag?.name).toBe("`APP_` environment variable(s)");
    });
  });

  it("Serialized provider preserves profile-specific winner provenance", async () => {
    const figment = Figment.new()
      .merge(Serialized.default("app.host", "default.example"))
      .merge(Serialized.default("app.host", "debug.example").profile("debug"))
      .select("debug");

    expect(await figment.extract<string>({ path: "app.host" })).toBe("debug.example");
    expect(await winnerMetadataName(figment, "app.host")).toBe("Serialized");

    const explained = await figment.explain({ path: "app.host", includeMetadata: "winner" });
    expect(explained.tag?.profile).toBe("debug");
    expect(explained.metadata?.interpolate("debug", ["app", "host"])).toBe("debug.app.host");
  });

  it("Toml file provider reports resolved file metadata on winner lookup", async () => {
    const temp = await mkdtemp(join(tmpdir(), "figment-ts-"));
    const path = join(temp, "Config.toml");
    await writeFile(path, '[app]\nhost = "toml.example"\n', "utf8");

    try {
      const figment = Figment.new().merge(Toml.file(path));

      expect(await figment.extract<string>({ path: "app.host" })).toBe("toml.example");
      expect(await winnerMetadataName(figment, "app.host")).toBe("TOML file");

      const explained = await figment.explain({ path: "app.host", includeMetadata: "winner" });
      expect(explained.metadata?.source).toEqual({ kind: "file", path });
      expect((await figment.getMetadata(explained.tag))?.name).toBe("TOML file");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("YamlExtended provider winner metadata is available for merged keys", async () => {
    const figment = Figment.new().merge(
      YamlExtended.string(
        [
          "app: &APP",
          "  host: merged.example",
          "  token: merged-token",
          "runtime:",
          "  <<: *APP",
          "",
        ].join("\n"),
      ),
    );

    expect(await figment.extract<string>({ path: "runtime.host" })).toBe("merged.example");
    expect(await figment.extract<string>({ path: "runtime.token" })).toBe("merged-token");
    expect(await winnerMetadataName(figment, "runtime.token")).toBe("YAML Extended source string");

    const explained = await figment.explain({ path: "runtime.token", includeMetadata: "winner" });
    expect(explained.metadata?.source).toEqual({
      kind: "inline",
      descriptor: "YAML Extended inline string",
    });
  });
});
