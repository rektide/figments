import { describe, expect, it } from "vitest";

import {
  formatMetadataSource,
  metadataNamed,
  metadataFrom,
  metadataFromCode,
  metadataFromEnv,
  metadataFromFile,
  metadataFromInline,
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
