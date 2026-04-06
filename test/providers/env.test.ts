import { describe, expect, it } from "vitest";

import { Figment } from "../../src/figment.ts";
import { Env } from "../../src/providers/env.ts";

describe("Env.raw", () => {
  it("iterates all env vars with split separator replacement", () => {
    const env = Env.raw().split("_");
    const iter = env.iter({ APP_NAME: '"demo"', APP_DEBUG: "true" });
    expect(iter).toEqual([
      ["app.name", '"demo"'],
      ["app.debug", "true"],
    ]);
  });
});

describe("Env.prefixed", () => {
  it("strips prefix and produces coalesced dict through Figment", async () => {
    process.env.TEST_FIGMENT_APP_NAME = '"demo"';
    process.env.TEST_FIGMENT_APP_DEBUG = "true";
    process.env.TEST_FIGMENT_ARRAY_0 = "4";
    process.env.TEST_FIGMENT_ARRAY_2 = "6";
    process.env.TEST_FIGMENT_ARRAY_1 = "5";
    try {
      const figment = Figment.new().merge(Env.prefixed("TEST_FIGMENT_").split("_"));
      const config = await figment.build<{
        app: { name: string; debug: boolean };
        array: number[];
      }>({ interpret: "lossy" });
      expect(config.app.name).toBe("demo");
      expect(config.app.debug).toBe(true);
      expect(config.array).toEqual([4, 5, 6]);
    } finally {
      delete process.env.TEST_FIGMENT_APP_NAME;
      delete process.env.TEST_FIGMENT_APP_DEBUG;
      delete process.env.TEST_FIGMENT_ARRAY_0;
      delete process.env.TEST_FIGMENT_ARRAY_2;
      delete process.env.TEST_FIGMENT_ARRAY_1;
    }
  });
});

describe("env value parsing", () => {
  it("supports custom value parser", async () => {
    process.env.TEST_FIGMENT_ENVFIX_LIST = "[1,2,3]";
    process.env.TEST_FIGMENT_ENVFIX_COUNT = "7";

    try {
      const figment = Figment.new().merge(
        Env.prefixed("TEST_FIGMENT_ENVFIX_").parser((value) => {
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        }),
      );

      const config = await figment.build<{ list: number[]; count: number }>();
      expect(config.list).toEqual([1, 2, 3]);
      expect(config.count).toBe(7);
    } finally {
      delete process.env.TEST_FIGMENT_ENVFIX_LIST;
      delete process.env.TEST_FIGMENT_ENVFIX_COUNT;
    }
  });
});

describe("ignoreEmpty", () => {
  it("filters empty env values when enabled", async () => {
    process.env.TEST_FIGMENT_ENVFIX_EMPTY = "";
    process.env.TEST_FIGMENT_ENVFIX_SET = "present";

    try {
      const withEmpty = Figment.new().merge(Env.prefixed("TEST_FIGMENT_ENVFIX_"));
      expect(await withEmpty.extract<string>({ path: "empty" })).toBe("");

      const ignoreEmpty = Figment.new().merge(
        Env.prefixed("TEST_FIGMENT_ENVFIX_").ignoreEmpty(true),
      );
      expect(await ignoreEmpty.contains("empty")).toBe(false);
      expect(await ignoreEmpty.extract<string>({ path: "set" })).toBe("present");
    } finally {
      delete process.env.TEST_FIGMENT_ENVFIX_EMPTY;
      delete process.env.TEST_FIGMENT_ENVFIX_SET;
    }
  });
});
