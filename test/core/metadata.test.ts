import { describe, expect, it } from "vitest";

import {
  formatMetadataSource,
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
});
