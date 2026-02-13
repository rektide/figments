import { DEFAULT_PROFILE, GLOBAL_PROFILE, isCustomProfile, normalizeProfile } from "./profile.ts";
import type { Provider } from "./provider.ts";
import {
  coalesceDict,
  coalesceProfiles,
  coalesceTagDictNode,
  coalesceTagProfiles,
  profileCoalesce,
  type CoalesceOrder,
} from "./core/coalesce.ts";
import { FigmentError } from "./core/error.ts";
import { findTag, findValue } from "./core/path.ts";
import type { Metadata } from "./core/metadata.ts";
import type { ConfigDict, ConfigValue, ProfileMap } from "./core/types.ts";
import { deepClone, isConfigDict } from "./core/types.ts";
import {
  buildTagProfileMap,
  cloneProfileTagMap,
  cloneTagDictNode,
  makeTag,
  remapProfileTagMap,
  type ProfileTagMap,
  type Tag,
  type TagDictNode,
  type TagTree,
  isTagDictNode,
} from "./core/tag.ts";

export class Figment implements Provider {
  private activeProfile: string;
  private readonly metadataByTag: Map<number, Metadata>;
  private values: ProfileMap;
  private tags: ProfileTagMap;
  private failure?: FigmentError;
  private nextTag: number;
  private pending: Promise<void>;

  public constructor() {
    this.activeProfile = DEFAULT_PROFILE;
    this.metadataByTag = new Map();
    this.values = {};
    this.tags = {};
    this.failure = undefined;
    this.nextTag = 1;
    this.pending = Promise.resolve();
  }

  public static new(): Figment {
    return new Figment();
  }

  public static from(provider: Provider): Figment {
    return new Figment().provide(provider, "merge", captureProvideLocation());
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

  public selectedProfile(): string {
    return this.activeProfile;
  }

  public metadataEntries(): Metadata[] {
    return [...this.metadataByTag.values()];
  }

  public metadataMap(): Map<number, Metadata> {
    return new Map(this.metadataByTag.entries());
  }

  public tagMap(): ProfileTagMap {
    return cloneProfileTagMap(this.tags);
  }

  public getMetadata(tag: Tag): Metadata | undefined {
    return this.metadataByTag.get(tag.metadataId);
  }

  public async findMetadata(path: string): Promise<Metadata | undefined> {
    const tag = await this.findTagForPath(path);
    return tag === undefined ? undefined : this.metadataByTag.get(tag.metadataId);
  }

  public select(profile: string): Figment {
    this.activeProfile = normalizeProfile(profile);
    return this;
  }

  public join(provider: Provider): Figment {
    return this.provide(provider, "join", captureProvideLocation());
  }

  public adjoin(provider: Provider): Figment {
    return this.provide(provider, "adjoin", captureProvideLocation());
  }

  public merge(provider: Provider): Figment {
    return this.provide(provider, "merge", captureProvideLocation());
  }

  public admerge(provider: Provider): Figment {
    return this.provide(provider, "admerge", captureProvideLocation());
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
    const merged = await this.mergedState();
    const value = findValue(merged.value, path);
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
      for (const [metadataId, metadata] of this.metadataByTag.entries()) {
        focused.metadataByTag.set(metadataId, metadata);
      }

      const map: ProfileMap = {};
      const tags: ProfileTagMap = {};
      for (const [profile, dict] of Object.entries(this.values)) {
        const value = findValue(dict, path);
        const tree = this.tags[profile] ? findTag(this.tags[profile], path) : undefined;
        if (isConfigDict(value)) {
          map[profile] = deepClone(value);
          if (tree && isTagDictNode(tree)) {
            tags[profile] = cloneTagDictNode(tree);
          }
        }
      }

      focused.values = map;
      focused.tags = tags;
    });

    return focused;
  }

  public async ready(): Promise<void> {
    await this.pending;
    if (this.failure) {
      throw this.failure;
    }
  }

  private provide(provider: Provider, order: CoalesceOrder, provideLocation?: string): Figment {
    const providerProfile = provider.selectedProfile?.();
    if (providerProfile) {
      this.activeProfile = profileCoalesce(
        this.activeProfile,
        normalizeProfile(providerProfile),
        order,
      );
    }

    this.pending = this.pending.then(async () => {
      if (this.failure) {
        return;
      }

      let contextTag: Tag | undefined;
      let contextMetadata: Metadata | undefined;

      try {
        let incoming: ProfileMap;
        let incomingTags: ProfileTagMap;

        const importedMetadataMap = provider.metadataMap?.();
        const importedTagMap = provider.tagMap?.();

        if (importedMetadataMap && importedTagMap) {
          const remap = this.importMetadataMap(importedMetadataMap);
          incoming = normalizeProfiles(await provider.data());
          incomingTags = remapProfileTagMap(cloneProfileTagMap(importedTagMap), remap);
        } else {
          contextTag = this.allocateTag(this.activeProfile);
          contextMetadata = provider.metadata();
          contextMetadata.provideLocation = provideLocation;
          this.metadataByTag.set(contextTag.metadataId, contextMetadata);
          incoming = normalizeProfiles(await provider.data());
          incomingTags = buildTagProfileMap(incoming, contextTag);
        }

        this.values = coalesceProfiles(this.values, incoming, order);
        this.tags = coalesceTagProfiles(this.tags, incomingTags, order);
      } catch (error) {
        const figmentError =
          error instanceof FigmentError
            ? error.withContext({
                metadata: contextMetadata,
                tag: contextTag,
                profile: this.activeProfile,
              })
            : FigmentError.message(error instanceof Error ? error.message : String(error));

        this.failure = this.failure ? figmentError.chain(this.failure) : figmentError;
      }
    });

    return this;
  }

  private allocateTag(profile: string): Tag {
    while (this.metadataByTag.has(this.nextTag)) {
      this.nextTag += 1;
    }

    const metadataId = this.nextTag;
    this.nextTag += 1;
    return makeTag(metadataId, profile);
  }

  private importMetadataMap(map: Map<number, Metadata>): Map<number, number> {
    const remap = new Map<number, number>();
    for (const [metadataId, metadata] of map.entries()) {
      if (!this.metadataByTag.has(metadataId)) {
        this.metadataByTag.set(metadataId, metadata);
        if (metadataId >= this.nextTag) {
          this.nextTag = metadataId + 1;
        }
        continue;
      }

      const replacement = this.allocateTag(this.activeProfile);
      remap.set(metadataId, replacement.metadataId);
      this.metadataByTag.set(replacement.metadataId, metadata);
    }

    return remap;
  }

  private async merged(): Promise<ConfigDict> {
    return (await this.mergedState()).value;
  }

  private async mergedState(): Promise<{ value: ConfigDict; tags: TagDictNode }> {
    await this.ready();

    const defaults = this.values[DEFAULT_PROFILE] ?? {};
    const globals = this.values[GLOBAL_PROFILE] ?? {};
    const selected = this.values[this.activeProfile];

    const defaultTags = this.tags[DEFAULT_PROFILE] ?? emptyTagDictNode();
    const globalTags = this.tags[GLOBAL_PROFILE] ?? emptyTagDictNode();
    const selectedTags = this.tags[this.activeProfile];

    if (selected && isCustomProfile(this.activeProfile)) {
      return {
        value: coalesceDict(coalesceDict(defaults, selected, "merge"), globals, "merge"),
        tags: coalesceTagDictNode(
          coalesceTagDictNode(defaultTags, selectedTags ?? emptyTagDictNode(), "merge"),
          globalTags,
          "merge",
        ),
      };
    }

    return {
      value: coalesceDict(defaults, globals, "merge"),
      tags: coalesceTagDictNode(defaultTags, globalTags, "merge"),
    };
  }

  private async findTagForPath(path: string): Promise<Tag | undefined> {
    const tree = findTag((await this.mergedState()).tags, path);
    return unwrapTag(tree);
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

function unwrapTag(tree: TagTree | undefined): Tag | undefined {
  return tree?.tag;
}

function emptyTagDictNode(): TagDictNode {
  return {
    kind: "dict",
    tag: makeTag(0, DEFAULT_PROFILE),
    children: [],
  };
}

function captureProvideLocation(): string | undefined {
  const stack = new Error().stack;
  if (!stack) {
    return undefined;
  }

  const lines = stack
    .split("\n")
    .slice(1)
    .map((line) => line.trim());
  for (const line of lines) {
    if (line.includes("captureProvideLocation") || line.includes("/src/figment.ts")) {
      continue;
    }

    return line.replace(/^at\s+/, "");
  }

  return undefined;
}
