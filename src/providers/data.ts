import { access, readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import * as TOML from "@iarna/toml";
import YAML from "yaml";

import type { Provider } from "../provider.ts";
import type { ConfigDict, ConfigValue, ProfileMap } from "../core/types.ts";
import { isConfigDict } from "../core/types.ts";
import { DEFAULT_PROFILE, normalizeProfile } from "../profile.ts";
import { metadataFrom, metadataNamed, type Metadata } from "../core/metadata.ts";

export interface Format {
  readonly name: string;
  parse(source: string): unknown;
}

type DataSource =
  | { type: "file"; path: string; required: boolean; search: boolean }
  | { type: "string"; source: string };

export class Data<F extends Format> implements Provider {
  private source: DataSource;
  private profileName: string | undefined;

  public constructor(
    private readonly format: F,
    source: DataSource,
    profileName: string | undefined = DEFAULT_PROFILE,
  ) {
    this.source = source;
    this.profileName = profileName;
  }

  public static file<F extends Format>(format: F, path: string): Data<F> {
    return new Data(format, { type: "file", path, required: false, search: true });
  }

  public static string<F extends Format>(format: F, source: string): Data<F> {
    return new Data(format, { type: "string", source });
  }

  public nested(): Data<F> {
    this.profileName = undefined;
    return this;
  }

  public required(required: boolean): Data<F> {
    if (this.source.type === "file") {
      this.source.required = required;
    }

    return this;
  }

  public search(search: boolean): Data<F> {
    if (this.source.type === "file") {
      this.source.search = search;
    }

    return this;
  }

  public profile(profile: string): Data<F> {
    this.profileName = normalizeProfile(profile);
    return this;
  }

  public selectedProfile(): string | undefined {
    return this.profileName;
  }

  public metadata(): Metadata {
    if (this.source.type === "string") {
      return metadataNamed(`${this.format.name} source string`);
    }

    return metadataFrom(`${this.format.name} file`, this.source.path);
  }

  public async data(): Promise<ProfileMap> {
    const value = await this.load();

    if (this.profileName) {
      if (!isConfigDict(value)) {
        throw new Error(
          `${this.format.name} source must decode to a dictionary when nesting is disabled`,
        );
      }

      return {
        [this.profileName]: value,
      };
    }

    if (!isConfigDict(value)) {
      throw new Error(`${this.format.name} nested source must decode to a profile dictionary`);
    }

    const output: ProfileMap = {};
    for (const [profile, profileValue] of Object.entries(value)) {
      if (isConfigDict(profileValue)) {
        output[normalizeProfile(profile)] = profileValue;
      }
    }

    return output;
  }

  private async load(): Promise<ConfigValue> {
    if (this.source.type === "string") {
      return toConfigValue(this.format.parse(this.source.source));
    }

    const path = await resolvePath(this.source.path, this.source.search);
    if (!path) {
      if (!this.source.required) {
        return {};
      }

      throw new Error(`required file '${this.source.path}' not found`);
    }

    const source = await readFile(path, "utf8");
    return toConfigValue(this.format.parse(source));
  }
}

export const Json: FormatProvider = createFormatProvider({
  name: "JSON",
  parse: (source) => JSON.parse(source),
});

export const Toml: FormatProvider = createFormatProvider({
  name: "TOML",
  parse: (source) => TOML.parse(source),
});

export const Yaml: FormatProvider = createFormatProvider({
  name: "YAML",
  parse: (source) => YAML.parse(source),
});

export interface FormatProvider {
  file(path: string): Data<Format>;
  string(source: string): Data<Format>;
}

function createFormatProvider(format: Format): FormatProvider {
  return {
    file(path: string): Data<Format> {
      return Data.file(format, path);
    },
    string(source: string): Data<Format> {
      return Data.string(format, source);
    },
  };
}

async function resolvePath(path: string, search: boolean): Promise<string | undefined> {
  const resolvedIfAbsolute = isAbsolute(path) ? path : undefined;
  if (resolvedIfAbsolute) {
    return (await exists(resolvedIfAbsolute)) ? resolvedIfAbsolute : undefined;
  }

  if (!search) {
    const exact = resolve(process.cwd(), path);
    return (await exists(exact)) ? exact : undefined;
  }

  let current = process.cwd();
  while (true) {
    const candidate = resolve(current, path);
    if (await exists(candidate)) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function toConfigValue(value: unknown): ConfigValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toConfigValue(item));
  }

  if (typeof value === "object") {
    const dict: ConfigDict = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      dict[key] = toConfigValue(item);
    }

    return dict;
  }

  return String(value);
}
