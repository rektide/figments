import { resolve } from "node:path";

import {
  metadataFrom,
  metadataFromCode,
  metadataFromEnv,
  metadataFromFile,
  metadataFromInline,
  type Metadata,
} from "../../src/core/metadata.ts";

export type SourceDisplayFixture = {
  readonly name: string;
  readonly metadata: Metadata;
  readonly concise: string;
};

export function sourceDisplayFixtures(cwd: string): SourceDisplayFixture[] {
  const absoluteInsideCwd = resolve(cwd, "Config.toml");
  const absoluteOutsideCwd = resolve(cwd, "..", "outside", "Config.toml");

  return [
    {
      name: "relative file",
      metadata: metadataFromFile("TOML", "Config.toml"),
      concise: "file Config.toml",
    },
    {
      name: "absolute file under cwd",
      metadata: metadataFromFile("TOML", absoluteInsideCwd),
      concise: "file Config.toml",
    },
    {
      name: "absolute file outside cwd",
      metadata: metadataFromFile("TOML", absoluteOutsideCwd),
      concise: `file ${absoluteOutsideCwd}`,
    },
    {
      name: "environment selector",
      metadata: metadataFromEnv("Env", "APP_*"),
      concise: "environment APP_*",
    },
    {
      name: "inline descriptor",
      metadata: metadataFromInline("Inline", "desc"),
      concise: "desc",
    },
    {
      name: "code location",
      metadata: metadataFromCode("Code", "src/a.ts:1"),
      concise: "code src/a.ts:1",
    },
    {
      name: "custom source",
      metadata: metadataFrom("Custom", "named"),
      concise: "named",
    },
  ];
}
