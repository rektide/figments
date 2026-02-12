import type { Provider } from "../provider.ts";
import { metadataNamed } from "../core/metadata.ts";
import type { Metadata } from "../core/metadata.ts";
import { DEFAULT_PROFILE, GLOBAL_PROFILE, normalizeProfile } from "../profile.ts";
import type { ConfigDict, ConfigValue, ProfileMap } from "../core/types.ts";
import { deepClone, isConfigDict } from "../core/types.ts";
import { nest } from "../core/path.ts";

export class Serialized<T = unknown> implements Provider {
  public value: T;
  public keyPath?: string;
  public targetProfile: string;

  public constructor(value: T, profile: string = DEFAULT_PROFILE, keyPath?: string) {
    this.value = value;
    this.keyPath = keyPath;
    this.targetProfile = normalizeProfile(profile);
  }

  public static from<T>(value: T, profile: string): Serialized<T> {
    return new Serialized(value, profile);
  }

  public static defaults<T>(value: T): Serialized<T> {
    return new Serialized(value, DEFAULT_PROFILE);
  }

  public static globals<T>(value: T): Serialized<T> {
    return new Serialized(value, GLOBAL_PROFILE);
  }

  public static default<T>(key: string, value: T): Serialized<T> {
    return new Serialized(value, DEFAULT_PROFILE, key);
  }

  public static global<T>(key: string, value: T): Serialized<T> {
    return new Serialized(value, GLOBAL_PROFILE, key);
  }

  public profile(profile: string): Serialized<T> {
    this.targetProfile = normalizeProfile(profile);
    return this;
  }

  public selectedProfile(): string {
    return this.targetProfile;
  }

  public key(keyPath: string): Serialized<T> {
    this.keyPath = keyPath;
    return this;
  }

  public metadata(): Metadata {
    return metadataNamed("Serialized");
  }

  public data(): ProfileMap {
    const serialized = toConfigValue(this.value);
    let dict: ConfigDict;

    if (this.keyPath) {
      dict = nest(this.keyPath, serialized);
    } else if (isConfigDict(serialized)) {
      dict = serialized;
    } else {
      throw new Error("Serialized provider without a key path must serialize to a dictionary");
    }

    return {
      [this.targetProfile]: dict,
    };
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
    const record = value as Record<string, unknown>;
    const dict: ConfigDict = {};
    for (const [key, item] of Object.entries(record)) {
      dict[key] = toConfigValue(item);
    }

    return deepClone(dict);
  }

  return String(value);
}
