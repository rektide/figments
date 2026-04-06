import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  Metadata,
  MetadataBuilder,
  formatMetadataSource,
  metadataFrom,
  metadataFromCode,
  metadataFromEnv,
  metadataFromFile,
  metadataFromInline,
  metadataNamed,
} from "../../src/core/metadata.ts";

describe("metadata source typing", () => {
  it("creates typed file/env/inline/custom/code sources", () => {
    const file = metadataFromFile("TOML", "Config.toml").source;
    expect(file?.kind).toBe("file");
    if (file?.kind === "file") {
      expect(file.path).toBe("Config.toml");
    }

    const env = metadataFromEnv("Env", "APP_*").source;
    expect(env?.kind).toBe("env");
    if (env?.kind === "env") {
      expect(env.selector).toBe("APP_*");
    }

    const inline = metadataFromInline("Inline", "literal").source;
    expect(inline?.kind).toBe("inline");
    if (inline?.kind === "inline") {
      expect(inline.descriptor).toBe("literal");
    }

    const code = metadataFromCode("Code", "src/app.ts:10:2").source;
    expect(code?.kind).toBe("code");
    if (code?.kind === "code") {
      expect(code.location).toBe("src/app.ts:10:2");
    }

    const custom = metadataFrom("Custom", "my source").source;
    expect(custom?.kind).toBe("custom");
    if (custom?.kind === "custom") {
      expect(custom.value).toBe("my source");
    }
  });

  it("formats each source kind deterministically", () => {
    expect(formatMetadataSource(metadataFromFile("TOML", "Config.toml").source)).toBe(
      "file Config.toml",
    );
    expect(formatMetadataSource(metadataFromEnv("Env", "APP_*").source)).toBe("environment APP_*");
    expect(formatMetadataSource(metadataFromInline("Inline", "desc").source)).toBe("desc");
    expect(formatMetadataSource(metadataFromCode("Code", "src/a.ts:1").source)).toBe(
      "code src/a.ts:1",
    );
    expect(formatMetadataSource(metadataFrom("Custom", "named").source)).toBe("named");
  });

  it("formats absolute file paths relative to cwd when shorter", () => {
    const absolute = resolve(process.cwd(), "Config.toml");
    expect(formatMetadataSource(metadataFromFile("TOML", absolute).source)).toBe(
      "file Config.toml",
    );
  });

  it("returns empty string when source is missing", () => {
    expect(formatMetadataSource(undefined)).toBe("");
  });
});

describe("metadata interpolation", () => {
  it("metadataNamed interpolates as profile.key.path", () => {
    const metadata = metadataNamed("Named");
    expect(metadata.interpolate("debug", ["app", "host"])).toBe("debug.app.host");
  });

  it("metadataFrom* builders preserve default interpolation behavior", () => {
    const cases = [
      metadataFrom("Custom", "inline custom"),
      metadataFromFile("File", "Config.toml"),
      metadataFromEnv("Env", "APP_*"),
      metadataFromInline("Inline", "source string"),
      metadataFromCode("Code", "src/app.ts:1"),
    ];

    for (const metadata of cases) {
      expect(metadata.interpolate("default", ["a", "b"])).toBe("default.a.b");
    }
  });

  it("supports interpolation with empty key paths", () => {
    const metadata = metadataNamed("EmptyKeys");
    expect(metadata.interpolate("default", [])).toBe("default.");
  });
});

describe("fluent metadata builder", () => {
  it("supports Metadata.named().source().interpolater().build()", () => {
    const metadata = Metadata.named("Env")
      .source({ kind: "env", selector: "APP_*" })
      .interpolater((_, keys) => keys.map((key) => key.toUpperCase()).join("."))
      .build();

    expect(metadata.name).toBe("Env");
    expect(metadata.source).toEqual({ kind: "env", selector: "APP_*" });
    expect(metadata.interpolate("default", ["app", "name"])).toBe("APP.NAME");
  });

  it("supports Metadata.from(name, string) custom source shorthand", () => {
    const metadata = Metadata.from("Custom", "vault://path").build();
    expect(metadata.source).toEqual({ kind: "custom", value: "vault://path" });
  });

  it("supports MetadataBuilder direct usage with provideLocation", () => {
    const metadata = MetadataBuilder.named("File")
      .source({ kind: "file", path: "/etc/app.toml" })
      .provideLocation("test/core/metadata.test.ts")
      .build();

    expect(metadata.source).toEqual({ kind: "file", path: "/etc/app.toml" });
    expect(metadata.provideLocation).toBe("test/core/metadata.test.ts");
  });
});
