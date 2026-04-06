import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { Figment } from "../../src/figment.ts";
import { Toml } from "../../src/providers/data.ts";

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
