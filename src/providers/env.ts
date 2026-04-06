import * as TOML from "@iarna/toml";

import { FigmentError } from "../core/error.ts";
import type { Provider } from "../provider.ts";
import { metadataFromEnv } from "../core/metadata.ts";
import type { Metadata } from "../core/metadata.ts";
import { DEFAULT_PROFILE, GLOBAL_PROFILE, normalizeProfile } from "../profile.ts";
import { coalesceDict } from "../core/coalesce.ts";
import { nest } from "../core/path.ts";
import type { ConfigDict, ConfigValue, ProfileMap } from "../core/types.ts";

type KeyTransform = (key: string) => string | undefined;
type ValueParser = (value: string) => ConfigValue;

export class Env implements Provider {
  private readonly transforms: KeyTransform[];
  private profileName: string;
  private prefixValue?: string;
  private shouldLowercase: boolean;
  private ignoreEmptyValues: boolean;
  private parserFn: ValueParser;

  private constructor(transforms: KeyTransform[] = []) {
    this.transforms = transforms;
    this.profileName = DEFAULT_PROFILE;
    this.shouldLowercase = true;
    this.ignoreEmptyValues = false;
    this.parserFn = parseEnvironmentValue;
  }

  public static raw(): Env {
    return new Env();
  }

  public static prefixed(prefix: string): Env {
    const lowered = prefix.toLowerCase();
    const env = new Env([
      (key) => {
        if (!key.toLowerCase().startsWith(lowered)) {
          return undefined;
        }

        return key.slice(prefix.length);
      },
    ]);

    env.prefixValue = prefix;
    return env;
  }

  public filter(predicate: (key: string) => boolean): Env {
    return this.withTransform((key) => (predicate(key) ? key : undefined));
  }

  public map(mapper: (key: string) => string): Env {
    return this.withTransform((key) => mapper(key));
  }

  public filterMap(mapper: (key: string) => string | undefined): Env {
    return this.withTransform(mapper);
  }

  public lowercase(lowercase: boolean): Env {
    const copy = this.clone();
    copy.shouldLowercase = lowercase;
    return copy;
  }

  public split(pattern: string): Env {
    return this.map((key) => key.replaceAll(pattern, "."));
  }

  public parser(parserFn: ValueParser): Env {
    const copy = this.clone();
    copy.parserFn = parserFn;
    return copy;
  }

  public ignoreEmpty(ignore: boolean): Env {
    const copy = this.clone();
    copy.ignoreEmptyValues = ignore;
    return copy;
  }

  public ignore(keys: string[]): Env {
    const set = new Set(keys.map((key) => key.toLowerCase()));
    return this.filter((key) => !set.has(key.toLowerCase()));
  }

  public only(keys: string[]): Env {
    const set = new Set(keys.map((key) => key.toLowerCase()));
    return this.filter((key) => set.has(key.toLowerCase()));
  }

  public profile(profile: string): Env {
    const copy = this.clone();
    copy.profileName = normalizeProfile(profile);
    return copy;
  }

  public selectedProfile(): string {
    return this.profileName;
  }

  public global(): Env {
    const copy = this.clone();
    copy.profileName = GLOBAL_PROFILE;
    return copy;
  }

  public metadata(): Metadata {
    const base = this.prefixValue
      ? `\`${this.prefixValue.toUpperCase()}\` environment variable(s)`
      : "environment variable(s)";

    const selector = this.prefixValue ? `${this.prefixValue.toUpperCase()}*` : "*";
    const metadata = metadataFromEnv(base, selector);
    metadata.interpolate = (_profile: string, keys: string[]) =>
      keys.map((k) => k.toUpperCase()).join(".");
    return metadata;
  }

  public data(): ProfileMap {
    let dict: ConfigDict = {};

    for (const [key, value] of this.iter()) {
      const nested = nest(key, this.parserFn(value));
      dict = coalesceDict(dict, nested, "zipmerge");
    }

    return {
      [this.profileName]: dict,
    };
  }

  public iter(source: Record<string, string | undefined> = process.env): Array<[string, string]> {
    const values: Array<[string, string]> = [];

    for (const [rawKey, rawValue] of Object.entries(source)) {
      if (rawValue === undefined) {
        continue;
      }

      if (this.ignoreEmptyValues && rawValue.length === 0) {
        continue;
      }

      let key = rawKey.trim();
      if (key.length === 0) {
        continue;
      }

      let rejected = false;
      for (const transform of this.transforms) {
        const next = transform(key);
        if (next === undefined) {
          rejected = true;
          break;
        }

        key = next;
      }

      if (rejected) {
        continue;
      }

      key = key.trim();
      if (key.length === 0) {
        continue;
      }

      if (this.shouldLowercase) {
        key = key.toLowerCase();
      }

      const parts = key.split(".");
      if (parts.some((part) => part.trim().length === 0)) {
        continue;
      }

      values.push([key, rawValue]);
    }

    return values;
  }

  public static var(name: string): string | undefined {
    const lowered = name.toLowerCase();
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && key.trim().toLowerCase() === lowered) {
        return value.trim();
      }
    }

    return undefined;
  }

  public static varOr(name: string, fallback: string): string {
    return Env.var(name) ?? fallback;
  }

  private withTransform(transform: KeyTransform): Env {
    return new Env([...this.transforms, transform]).copyFrom(this);
  }

  private clone(): Env {
    return new Env([...this.transforms]).copyFrom(this);
  }

  private copyFrom(other: Env): Env {
    this.profileName = other.profileName;
    this.prefixValue = other.prefixValue;
    this.shouldLowercase = other.shouldLowercase;
    this.ignoreEmptyValues = other.ignoreEmptyValues;
    this.parserFn = other.parserFn;
    return this;
  }
}

function parseEnvironmentValue(rawValue: string): ConfigValue {
  const source = rawValue.trim();
  if (source.length === 0) {
    return "";
  }

  try {
    const parsed = TOML.parse(`value = ${source}`) as Record<string, unknown>;
    return convertUnknown(parsed.value);
  } catch {
    return rawValue;
  }
}

function convertUnknown(value: unknown, path: Array<string | number> = []): ConfigValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => convertUnknown(item, [...path, index]));
  }

  if (typeof value === "object") {
    const dict: ConfigDict = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      dict[key] = convertUnknown(item, [...path, key]);
    }

    return dict;
  }

  const error = FigmentError.unsupported(value);
  throw path.length > 0 ? error.withPath(path.join(".")) : error;
}
