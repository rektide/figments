import { access, readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import * as TOML from "@iarna/toml";
import YAML from "yaml";

import { FigmentError } from "../core/error.ts";
import type { Provider } from "../provider.ts";
import type { ConfigDict, ConfigValue, ProfileMap } from "../core/types.ts";
import { isConfigDict } from "../core/types.ts";
import { DEFAULT_PROFILE, normalizeProfile } from "../profile.ts";
import { metadataFromFile, metadataFromInline, type Metadata } from "../core/metadata.ts";

export interface Format {
  readonly name: string;
  parse(source: string): unknown;
}

type FileDataSource = {
  readonly type: "file";
  readonly path: string;
  readonly required: boolean;
  readonly search: boolean;
};

type StringDataSource = {
  readonly type: "string";
  readonly source: string;
};

type DataSource = FileDataSource | StringDataSource;

export class Data<F extends Format> implements Provider {
  private readonly source: DataSource;
  private readonly profileName: string | undefined;
  private readonly metadataValue: Metadata;

  public constructor(
    private readonly format: F,
    source: DataSource,
    profileName: string | undefined,
  ) {
    this.source = source;
    this.profileName = profileName;
    this.metadataValue = metadataForSource(this.format.name, this.source);
  }

  public static file<F extends Format>(format: F, path: string): Data<F> {
    return new Data(format, createFileSource(path), DEFAULT_PROFILE);
  }

  public static string<F extends Format>(format: F, source: string): Data<F> {
    return new Data(format, createStringSource(source), DEFAULT_PROFILE);
  }

  public nested(): Data<F> {
    return this.withProfile(undefined);
  }

  public required(required: boolean): Data<F> {
    if (!isFileDataSource(this.source)) {
      return this;
    }

    if (this.source.required === required) {
      return this;
    }

    return this.withSource({ ...this.source, required });
  }

  public search(search: boolean): Data<F> {
    if (!isFileDataSource(this.source)) {
      return this;
    }

    if (this.source.search === search) {
      return this;
    }

    return this.withSource({ ...this.source, search });
  }

  public profile(profile: string): Data<F> {
    const normalized = normalizeProfile(profile);
    if (this.profileName === normalized) {
      return this;
    }

    return this.withProfile(normalized);
  }

  public selectedProfile(): string | undefined {
    return this.profileName;
  }

  public metadata(): Metadata {
    return this.metadataValue;
  }

  public async data(): Promise<ProfileMap> {
    const loaded = await loadDataSource(this.format, this.source);
    if (loaded.resolvedPath && this.metadataValue.source?.kind === "file") {
      this.metadataValue.source.path = loaded.resolvedPath;
    }

    return asProfileMap(loaded.value, this.profileName, this.format.name);
  }

  private withSource(source: DataSource): Data<F> {
    return new Data(this.format, source, this.profileName);
  }

  private withProfile(profileName: string | undefined): Data<F> {
    return new Data(this.format, this.source, profileName);
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

function createFileSource(path: string): FileDataSource {
  return {
    type: "file",
    path,
    required: false,
    search: true,
  };
}

function createStringSource(source: string): StringDataSource {
  return {
    type: "string",
    source,
  };
}

function isFileDataSource(source: DataSource): source is FileDataSource {
  return source.type === "file";
}

function metadataForSource(formatName: string, source: DataSource): Metadata {
  if (isFileDataSource(source)) {
    return metadataFromFile(`${formatName} file`, source.path);
  }

  return metadataFromInline(`${formatName} source string`, `${formatName} inline string`);
}

async function loadDataSource(
  format: Format,
  source: DataSource,
): Promise<{ value: ConfigValue; resolvedPath?: string }> {
  if (!isFileDataSource(source)) {
    return { value: toConfigValue(format.parse(source.source)) };
  }

  const path = await resolvePath(source.path, source.search);
  if (!path) {
    if (!source.required) {
      return { value: {} };
    }

    throw new Error(`required file '${source.path}' not found`);
  }

  const fileSource = await readFile(path, "utf8");
  return {
    value: toConfigValue(format.parse(fileSource)),
    resolvedPath: path,
  };
}

function asProfileMap(
  value: ConfigValue,
  profileName: string | undefined,
  formatName: string,
): ProfileMap {
  if (profileName) {
    if (!isConfigDict(value)) {
      throw new Error(`${formatName} source must decode to a dictionary when nesting is disabled`);
    }

    return {
      [profileName]: value,
    };
  }

  if (!isConfigDict(value)) {
    throw new Error(`${formatName} nested source must decode to a profile dictionary`);
  }

  const output: ProfileMap = {};
  for (const [profile, profileValue] of Object.entries(value)) {
    if (isConfigDict(profileValue)) {
      output[normalizeProfile(profile)] = profileValue;
    }
  }

  return output;
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

function toConfigValue(value: unknown, path: Array<string | number> = []): ConfigValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => toConfigValue(item, [...path, index]));
  }

  if (typeof value === "object") {
    const dict: ConfigDict = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      dict[key] = toConfigValue(item, [...path, key]);
    }

    return dict;
  }

  const error = FigmentError.unsupported(value);
  throw path.length > 0 ? error.withPath(path.join(".")) : error;
}
