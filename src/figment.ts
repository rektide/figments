import { DEFAULT_PROFILE, GLOBAL_PROFILE, isCustomProfile, normalizeProfile } from "./profile.ts";
import type { Provider } from "./provider.ts";
import { coalesceDict, coalesceProfiles, profileCoalesce, type CoalesceOrder } from "./core/coalesce.ts";
import { FigmentError } from "./core/error.ts";
import { findValue } from "./core/path.ts";
import type { Metadata } from "./core/metadata.ts";
import type { ConfigDict, ConfigValue, ProfileMap } from "./core/types.ts";
import { deepClone, isConfigDict } from "./core/types.ts";

export class Figment implements Provider {
  private activeProfile: string;
  private readonly metadataByTag: Map<number, Metadata>;
  private values: ProfileMap;
  private failure?: FigmentError;
  private nextTag: number;
  private pending: Promise<void>;

  public constructor() {
    this.activeProfile = DEFAULT_PROFILE;
    this.metadataByTag = new Map();
    this.values = {};
    this.failure = undefined;
    this.nextTag = 1;
    this.pending = Promise.resolve();
  }

  public static new(): Figment {
    return new Figment();
  }

  public static from(provider: Provider): Figment {
    return new Figment().merge(provider);
  }

  public metadata(): Metadata {
    return {
      name: "Figment",
      interpolate: (profile, keys) => `${profile}.${keys.join(".")}`,
    };
  }

  public async data(): Promise<ProfileMap> {
    await this.ready();
    return deepClone(this.values);
  }

  public profile(): string {
    return this.activeProfile;
  }

  public metadataEntries(): Metadata[] {
    return [...this.metadataByTag.values()];
  }

  public select(profile: string): Figment {
    this.activeProfile = normalizeProfile(profile);
    return this;
  }

  public join(provider: Provider): Figment {
    return this.provide(provider, "join");
  }

  public adjoin(provider: Provider): Figment {
    return this.provide(provider, "adjoin");
  }

  public merge(provider: Provider): Figment {
    return this.provide(provider, "merge");
  }

  public admerge(provider: Provider): Figment {
    return this.provide(provider, "admerge");
  }

  public async profiles(): Promise<string[]> {
    await this.ready();
    return Object.keys(this.values);
  }

  public async extract<T>(decode?: (value: ConfigDict) => T): Promise<T> {
    const value = await this.merged();
    return decode ? decode(value) : (value as T);
  }

  public async extractLossy<T>(decode?: (value: ConfigDict) => T): Promise<T> {
    const value = lossyConfig(await this.merged());
    return decode ? decode(value) : (value as T);
  }

  public async extractInner<T>(path: string): Promise<T> {
    return (await this.findValue(path)) as T;
  }

  public async extractInnerLossy<T>(path: string): Promise<T> {
    return lossyValue(await this.findValue(path)) as T;
  }

  public async contains(path: string): Promise<boolean> {
    try {
      await this.findValue(path);
      return true;
    } catch {
      return false;
    }
  }

  public async findValue(path: string): Promise<ConfigValue> {
    const value = findValue(await this.merged(), path);
    if (value === undefined) {
      throw FigmentError.missingField(path);
    }

    return value;
  }

  public focus(path: string): Figment {
    const focused = new Figment();
    focused.pending = this.pending.then(async () => {
      if (this.failure) {
        focused.failure = this.failure;
        return;
      }

      focused.activeProfile = this.activeProfile;
      focused.nextTag = this.nextTag;
      for (const [tag, metadata] of this.metadataByTag.entries()) {
        focused.metadataByTag.set(tag, metadata);
      }

      const map: ProfileMap = {};
      for (const [profile, dict] of Object.entries(this.values)) {
        const value = findValue(dict, path);
        if (isConfigDict(value)) {
          map[profile] = deepClone(value);
        }
      }

      focused.values = map;
    });

    return focused;
  }

  public async ready(): Promise<void> {
    await this.pending;
    if (this.failure) {
      throw this.failure;
    }
  }

  private provide(provider: Provider, order: CoalesceOrder): Figment {
    const tag = this.nextTag;
    this.nextTag += 1;
    this.metadataByTag.set(tag, provider.metadata());

    const providerProfile = provider.selectedProfile?.();
    if (providerProfile) {
      this.activeProfile = profileCoalesce(this.activeProfile, normalizeProfile(providerProfile), order);
    }

    this.pending = this.pending.then(async () => {
      if (this.failure) {
        return;
      }

      try {
        const incoming = normalizeProfiles(await provider.data());
        this.values = coalesceProfiles(this.values, incoming, order);
      } catch (error) {
        const figmentError = error instanceof FigmentError
          ? error
          : FigmentError.message(error instanceof Error ? error.message : String(error));

        this.failure = this.failure ? figmentError.chain(this.failure) : figmentError;
      }
    });

    return this;
  }

  private async merged(): Promise<ConfigDict> {
    await this.ready();

    const defaults = this.values[DEFAULT_PROFILE] ?? {};
    const globals = this.values[GLOBAL_PROFILE] ?? {};
    const selected = this.values[this.activeProfile];

    if (selected && isCustomProfile(this.activeProfile)) {
      return coalesceDict(coalesceDict(defaults, selected, "merge"), globals, "merge");
    }

    return coalesceDict(defaults, globals, "merge");
  }
}

function normalizeProfiles(map: ProfileMap): ProfileMap {
  const out: ProfileMap = {};
  for (const [profile, dict] of Object.entries(map)) {
    out[normalizeProfile(profile)] = deepClone(dict);
  }

  return out;
}

function lossyConfig(value: ConfigDict): ConfigDict {
  const out: ConfigDict = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = lossyValue(item);
  }

  return out;
}

function lossyValue(value: ConfigValue): ConfigValue {
  if (Array.isArray(value)) {
    return value.map((item) => lossyValue(item));
  }

  if (isConfigDict(value)) {
    return lossyConfig(value);
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  const lowered = trimmed.toLowerCase();
  if (["true", "yes", "on", "1"].includes(lowered)) {
    return true;
  }

  if (["false", "no", "off", "0"].includes(lowered)) {
    return false;
  }

  if (/^-?\d+$/.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  if (/^-?\d+(\.\d+)?([eE]-?\d+)?$/.test(trimmed)) {
    const parsed = Number.parseFloat(trimmed);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return value;
}
