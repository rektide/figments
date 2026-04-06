import { describe, expect, it } from "vitest";

import { Figment } from "../../src/figment.ts";
import { Env } from "../../src/providers/env.ts";

async function withEnv(
  values: Record<string, string | undefined>,
  run: () => Promise<void> | void,
): Promise<void> {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe("Env.raw", () => {
  it("iterates all env vars with split separator replacement", () => {
    const env = Env.raw().split("_");
    const iter = env.iter({ APP_NAME: '"demo"', APP_DEBUG: "true" });
    expect(iter).toEqual([
      ["app.name", '"demo"'],
      ["app.debug", "true"],
    ]);
  });

  it("supports filter/map/filterMap transforms", () => {
    const iter = Env.raw()
      .filter((key) => key.startsWith("APP_"))
      .map((key) => key.slice(4))
      .filterMap((key) => (key === "SKIP" ? undefined : key))
      .split("_")
      .iter({ APP_NAME: "demo", APP_PORT: "8080", APP_SKIP: "x", OTHER: "ignored" });

    expect(iter).toEqual([
      ["name", "demo"],
      ["port", "8080"],
    ]);
  });

  it("supports only/ignore filters case-insensitively", () => {
    const source = { APP_NAME: "demo", APP_PORT: "8080", APP_DEBUG: "true" };
    const only = Env.raw().only(["app_name", "app_debug"]).iter(source);
    const ignore = Env.raw().ignore(["APP_PORT"]).iter(source);

    expect(only).toEqual([
      ["app_name", "demo"],
      ["app_debug", "true"],
    ]);
    expect(ignore).toEqual([
      ["app_name", "demo"],
      ["app_debug", "true"],
    ]);
  });

  it("can disable lowercase normalization", () => {
    const iter = Env.raw().lowercase(false).split("_").iter({ App_Name: "demo" });
    expect(iter).toEqual([["App.Name", "demo"]]);
  });

  it("iter rejects empty keys, undefined values, and empty path segments", () => {
    const iter = Env.raw().split("_").iter({
      "  APP_NAME  ": "demo",
      APP__BROKEN: "x",
      APP_OK: "1",
      "   ": "blank",
      UNSET: undefined,
    });

    expect(iter).toEqual([
      ["app.name", "demo"],
      ["app.ok", "1"],
    ]);
  });
});

describe("Env.prefixed", () => {
  it("strips prefix and produces coalesced dict through Figment", async () => {
    await withEnv(
      {
        TEST_FIGMENT_APP_NAME: '"demo"',
        TEST_FIGMENT_APP_DEBUG: "true",
        TEST_FIGMENT_ARRAY_0: "4",
        TEST_FIGMENT_ARRAY_2: "6",
        TEST_FIGMENT_ARRAY_1: "5",
      },
      async () => {
        const figment = Figment.new().merge(Env.prefixed("TEST_FIGMENT_").split("_"));
        const config = await figment.build<{
          app: { name: string; debug: boolean };
          array: number[];
        }>({ interpret: "lossy" });
        expect(config.app.name).toBe("demo");
        expect(config.app.debug).toBe(true);
        expect(config.array).toEqual([4, 5, 6]);
      },
    );
  });

  it("supports profile/global selection and selectedProfile", () => {
    const custom = Env.prefixed("TEST_").profile("Debug");
    const global = Env.prefixed("TEST_").global();

    expect(custom.selectedProfile()).toBe("debug");
    expect(global.selectedProfile()).toBe("global");
  });

  it("provides env metadata source and interpolation", () => {
    const prefixed = Env.prefixed("test_env_").metadata();
    expect(prefixed.source).toEqual({ kind: "env", selector: "TEST_ENV_*" });
    expect(prefixed.name).toBe("`TEST_ENV_` environment variable(s)");
    expect(prefixed.interpolate("default", ["app", "name"])).toBe("APP.NAME");

    const raw = Env.raw().metadata();
    expect(raw.source).toEqual({ kind: "env", selector: "*" });
    expect(raw.name).toBe("environment variable(s)");
    expect(raw.interpolate("default", ["path", "to", "value"])).toBe("PATH.TO.VALUE");
  });

  it("data() builds a profile map from parsed env values", async () => {
    await withEnv(
      {
        TEST_ENV_APP_NAME: '"demo"',
        TEST_ENV_APP_PORT: "8080",
        TEST_ENV_SERVERS_0_HOST: '"a.local"',
        TEST_ENV_SERVERS_1_HOST: '"b.local"',
      },
      async () => {
        const profileMap = Env.prefixed("TEST_ENV_").split("_").data();
        expect(profileMap).toEqual({
          default: {
            app: { name: "demo", port: 8080 },
            servers: [{ host: "a.local" }, { host: "b.local" }],
          },
        });
      },
    );
  });
});

describe("env value parsing", () => {
  it("supports custom value parser", async () => {
    await withEnv(
      {
        TEST_FIGMENT_ENVFIX_LIST: "[1,2,3]",
        TEST_FIGMENT_ENVFIX_COUNT: "7",
      },
      async () => {
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
      },
    );
  });

  it("parses TOML-like booleans, numbers, arrays, and dicts", async () => {
    await withEnv(
      {
        TEST_FIGMENT_PARSE_BOOL: "true",
        TEST_FIGMENT_PARSE_INT: "7",
        TEST_FIGMENT_PARSE_FLOAT: "3.14",
        TEST_FIGMENT_PARSE_ARRAY: "[1, 2, 3]",
        TEST_FIGMENT_PARSE_DICT: "{ answer = 42 }",
        TEST_FIGMENT_PARSE_QUOTED: '"hello"',
        TEST_FIGMENT_PARSE_RAW: "not toml",
      },
      async () => {
        const figment = Figment.new().merge(Env.prefixed("TEST_FIGMENT_PARSE_"));

        expect(await figment.extract<boolean>({ path: "bool" })).toBe(true);
        expect(await figment.extract<number>({ path: "int" })).toBe(7);
        expect(await figment.extract<number>({ path: "float" })).toBe(3.14);
        expect(await figment.extract<number[]>({ path: "array" })).toEqual([1, 2, 3]);
        expect(await figment.extract<number>({ path: "dict.answer" })).toBe(42);
        expect(await figment.extract<string>({ path: "quoted" })).toBe("hello");
        expect(await figment.extract<string>({ path: "raw" })).toBe("not toml");
      },
    );
  });
});

describe("ignoreEmpty", () => {
  it("filters empty env values when enabled", async () => {
    await withEnv(
      {
        TEST_FIGMENT_ENVFIX_EMPTY: "",
        TEST_FIGMENT_ENVFIX_SET: "present",
      },
      async () => {
        const withEmpty = Figment.new().merge(Env.prefixed("TEST_FIGMENT_ENVFIX_"));
        expect(await withEmpty.extract<string>({ path: "empty" })).toBe("");

        const ignoreEmpty = Figment.new().merge(
          Env.prefixed("TEST_FIGMENT_ENVFIX_").ignoreEmpty(true),
        );
        expect(await ignoreEmpty.contains("empty")).toBe(false);
        expect(await ignoreEmpty.extract<string>({ path: "set" })).toBe("present");
      },
    );
  });
});

describe("Env.var / Env.varOr", () => {
  it("performs case-insensitive lookup and trims values", async () => {
    await withEnv({ TEST_FIGMENT_CASED: "  value  " }, () => {
      expect(Env.var("test_figment_cased")).toBe("value");
      expect(Env.var("missing_key")).toBeUndefined();
      expect(Env.varOr("missing_key", "fallback")).toBe("fallback");
    });
  });
});
