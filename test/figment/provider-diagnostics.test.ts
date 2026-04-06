import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FigmentError } from "../../src/core/error.ts";
import { Figment } from "../../src/figment.ts";
import { Env, Serialized, Toml, YamlExtended } from "../../src/providers/index.ts";
import { withEnv } from "../fixtures/env.ts";

function expectNumber(value: unknown): number {
  if (typeof value !== "number") {
    throw FigmentError.invalidType("number", value);
  }

  return value;
}

describe("provider diagnostics interpolation", () => {
  it("Env errors include uppercased provider key interpolation", async () => {
    await withEnv({ APP_APP_PORT: "oops" }, async () => {
      const figment = Figment.new().merge(Env.prefixed("APP_").split("_"));

      const thrown = await figment
        .extract({ path: "app.port", deser: expectNumber })
        .catch((error: unknown) => error);

      const text = String(thrown);
      expect(text).toContain("provider key 'APP.PORT'");
      expect(text).toContain("environment APP_*");
      expect(text).toContain("`APP_` environment variable(s)");
    });
  });

  it("Toml file errors include source display and default provider key", async () => {
    const temp = await mkdtemp(join(tmpdir(), "figment-ts-"));
    const path = join(temp, "Config.toml");
    await writeFile(path, '[app]\nport = "oops"\n', "utf8");

    try {
      const figment = Figment.new().merge(Toml.file(path));
      const thrown = await figment
        .extract({ path: "app.port", deser: expectNumber })
        .catch((error: unknown) => error);

      const text = String(thrown);
      expect(text).toContain("provider key 'default.app.port'");
      expect(text).toContain("in TOML file (file");
      expect(text).toContain(path);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("YamlExtended string errors include YAML Extended source and provider key", async () => {
    const figment = Figment.new().merge(YamlExtended.string("app:\n  port: oops\n"));
    const thrown = await figment
      .extract({ path: "app.port", deser: expectNumber })
      .catch((error: unknown) => error);

    const text = String(thrown);
    expect(text).toContain("provider key 'default.app.port'");
    expect(text).toContain("in YAML Extended source string (YAML Extended inline string)");
  });

  it("Serialized uses selected profile in provider key interpolation", async () => {
    const figment = Figment.new()
      .merge(Serialized.default("app.port", "oops").profile("debug"))
      .select("debug");

    const thrown = await figment
      .extract({ path: "app.port", deser: expectNumber })
      .catch((error: unknown) => error);

    expect(String(thrown)).toContain("provider key 'debug.app.port'");
  });
});
