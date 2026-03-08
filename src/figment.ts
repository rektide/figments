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

export type ValueDecoder<T, V = ConfigValue> =
  | ((value: V) => T)
  | {
      parse(value: V): T;
    };

export type ProviderProfileSelectionMode = "coalesce" | "seedWhenEmpty" | "never";

export interface PathExplanation {
  path: string;
  exists: boolean;
  value: ConfigValue | undefined;
  tag: Tag | undefined;
  metadata: Metadata | undefined;
  profile: string;
  selectedProfiles: string[];
  effectiveProfileOrder: string[];
}

export class Figment implements Provider {
  private activeProfiles: string[];
  private providerProfileSelectionMode: ProviderProfileSelectionMode;
  private readonly metadataByTag: Map<number, Metadata>;
  private values: ProfileMap;
  private tags: ProfileTagMap;
  private failure?: FigmentError;
  private nextTag: number;
  private pending: Promise<void>;

  public constructor() {
    this.activeProfiles = [];
    this.providerProfileSelectionMode = "seedWhenEmpty";
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
    return this.primaryProfile();
  }

  public selectedProfile(): string {
    return this.primaryProfile();
  }

  public selectedProfiles(): string[] {
    return [...this.activeProfiles];
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

  public async findMetadataAll(path: string): Promise<Metadata[]> {
    const tree = findTag((await this.mergedState()).tags, path);
    if (!tree) {
      return [];
    }

    const out: Metadata[] = [];
    const seen = new Set<number>();
    for (const metadataId of collectMetadataIds(tree)) {
      if (seen.has(metadataId)) {
        continue;
      }

      seen.add(metadataId);
      const metadata = this.metadataByTag.get(metadataId);
      if (metadata) {
        out.push(metadata);
      }
    }

    return out;
  }

  public async findPath(path: string): Promise<ConfigValue | undefined> {
    const merged = await this.mergedState();
    const value = findValue(merged.value, path);
    return value === undefined ? undefined : deepClone(value);
  }

  public async explain(path: string): Promise<PathExplanation> {
    const merged = await this.mergedState();
    const value = findValue(merged.value, path);
    const tree = findTag(merged.tags, path);
    const tag = unwrapTag(tree);
    const metadata = tag === undefined ? undefined : this.metadataByTag.get(tag.metadataId);

    return {
      path,
      exists: value !== undefined,
      value: value === undefined ? undefined : deepClone(value),
      tag,
      metadata,
      ...this.errorProfileContext(),
    };
  }

  public select(profile: string): Figment {
    return this.selectProfiles([profile]);
  }

  public selectProfiles(profiles: string[]): Figment {
    const normalized = normalizeSelectedProfiles(profiles);
    const next = this.fork();
    next.activeProfiles = normalized;
    next.pending = next.pending.then(() => {
      if (next.failure) {
        return;
      }

      next.activeProfiles = normalized;
    });

    return next;
  }

  public spliceProfiles(start: number, deleteCount?: number, ...profiles: string[]): Figment {
    const next = this.fork();
    const selected = [...this.activeProfiles];

    if (deleteCount === undefined) {
      selected.splice(start);
    } else {
      selected.splice(start, deleteCount, ...profiles);
    }

    const normalized = normalizeSelectedProfiles(selected);
    next.activeProfiles = normalized;
    next.pending = next.pending.then(() => {
      if (next.failure) {
        return;
      }

      next.activeProfiles = normalized;
    });

    return next;
  }

  public providerProfileSelection(mode: ProviderProfileSelectionMode): Figment {
    const next = this.fork();
    next.providerProfileSelectionMode = mode;
    next.pending = next.pending.then(() => {
      if (next.failure) {
        return;
      }

      next.providerProfileSelectionMode = mode;
    });

    return next;
  }

  public join(provider: Provider): Figment {
    return this.provide(provider, "join", captureProvideLocation());
  }

  public adjoin(provider: Provider): Figment {
    return this.provide(provider, "adjoin", captureProvideLocation());
  }

  public zipjoin(provider: Provider): Figment {
    return this.provide(provider, "zipjoin", captureProvideLocation());
  }

  public merge(provider: Provider): Figment {
    return this.provide(provider, "merge", captureProvideLocation());
  }

  public admerge(provider: Provider): Figment {
    return this.provide(provider, "admerge", captureProvideLocation());
  }

  public zipmerge(provider: Provider): Figment {
    return this.provide(provider, "zipmerge", captureProvideLocation());
  }

  public async profiles(): Promise<string[]> {
    await this.ready();
    return Object.keys(this.values);
  }

  public async extract<T>(decode?: ValueDecoder<T, ConfigDict>): Promise<T> {
    const value = await this.merged();
    return decode
      ? runDecoder(value, decode, "config", {
          context: this.errorProfileContext(),
        })
      : (value as T);
  }

  public async extractWith<T>(decode: ValueDecoder<T, ConfigDict>): Promise<T> {
    return this.extract(decode);
  }

  public async extractLossy<T>(decode?: ValueDecoder<T, ConfigDict>): Promise<T> {
    const value = lossyConfig(await this.merged());
    return decode
      ? runDecoder(value, decode, "lossy config", {
          context: this.errorProfileContext(),
        })
      : (value as T);
  }

  public async extractLossyWith<T>(decode: ValueDecoder<T, ConfigDict>): Promise<T> {
    return this.extractLossy(decode);
  }

  public async extractInner<T>(path: string): Promise<T> {
    return (await this.findValue(path)) as T;
  }

  public async extractInnerWith<T>(path: string, decode: ValueDecoder<T, ConfigValue>): Promise<T> {
    const value = await this.findValue(path);
    const tag = await this.findTagForPath(path);
    const metadata = tag === undefined ? undefined : this.metadataByTag.get(tag.metadataId);
    return runDecoder(value, decode, `key '${path}'`, {
      path,
      context: {
        tag,
        ...this.errorProfileContext(),
        metadata,
      },
    });
  }

  public async extractInnerLossy<T>(path: string): Promise<T> {
    return lossyValue(await this.findValue(path)) as T;
  }

  public async extractInnerLossyWith<T>(
    path: string,
    decode: ValueDecoder<T, ConfigValue>,
  ): Promise<T> {
    const value = lossyValue(await this.findValue(path));
    const tag = await this.findTagForPath(path);
    const metadata = tag === undefined ? undefined : this.metadataByTag.get(tag.metadataId);
    return runDecoder(value, decode, `lossy key '${path}'`, {
      path,
      context: {
        tag,
        ...this.errorProfileContext(),
        metadata,
      },
    });
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
      throw FigmentError.missingField(path, this.errorProfileContext());
    }

    return value;
  }

  public focus(path: string): Figment {
    const focused = this.fork();
    focused.pending = focused.pending.then(() => {
      if (focused.failure) {
        return;
      }

      const map: ProfileMap = {};
      const tags: ProfileTagMap = {};
      for (const [profile, dict] of Object.entries(focused.values)) {
        const value = findValue(dict, path);
        const tree = focused.tags[profile] ? findTag(focused.tags[profile], path) : undefined;
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
    const next = this.fork();
    const providerProfile = provider.selectedProfile?.();
    const normalizedProviderProfile = providerProfile
      ? normalizeProfile(providerProfile)
      : undefined;

    if (normalizedProviderProfile) {
      next.activeProfiles = applyProviderProfileSelection(
        next.activeProfiles,
        normalizedProviderProfile,
        order,
        this.providerProfileSelectionMode,
      );
    }

    next.pending = next.pending.then(async () => {
      if (next.failure) {
        return;
      }

      if (normalizedProviderProfile) {
        next.activeProfiles = applyProviderProfileSelection(
          next.activeProfiles,
          normalizedProviderProfile,
          order,
          next.providerProfileSelectionMode,
        );
      }

      let contextTag: Tag | undefined;
      let contextMetadata: Metadata | undefined;

      try {
        let incoming: ProfileMap;
        let incomingTags: ProfileTagMap;

        const importedMetadataMap = provider.metadataMap?.();
        const importedTagMap = provider.tagMap?.();

        if (importedMetadataMap && importedTagMap) {
          const remap = next.importMetadataMap(importedMetadataMap);
          incoming = normalizeProfiles(await provider.data());
          incomingTags = remapProfileTagMap(cloneProfileTagMap(importedTagMap), remap);
        } else {
          contextTag = next.allocateTag(next.primaryProfile());
          contextMetadata = provider.metadata();
          contextMetadata.provideLocation = provideLocation;
          next.metadataByTag.set(contextTag.metadataId, contextMetadata);
          incoming = normalizeProfiles(await provider.data());
          incomingTags = buildTagProfileMap(incoming, contextTag);
        }

        next.values = coalesceProfiles(next.values, incoming, order);
        next.tags = coalesceTagProfiles(next.tags, incomingTags, order);
      } catch (error) {
        const figmentError =
          error instanceof FigmentError
            ? error.withContext({
                metadata: contextMetadata,
                tag: contextTag,
                ...next.errorProfileContext(),
              })
            : FigmentError.message(error instanceof Error ? error.message : String(error));

        next.failure = next.failure ? figmentError.chain(next.failure) : figmentError;
      }
    });

    return next;
  }

  private fork(): Figment {
    const next = new Figment();
    next.activeProfiles = [...this.activeProfiles];
    next.providerProfileSelectionMode = this.providerProfileSelectionMode;
    next.pending = this.pending.then(() => {
      next.activeProfiles = [...this.activeProfiles];
      next.providerProfileSelectionMode = this.providerProfileSelectionMode;
      next.values = deepClone(this.values);
      next.tags = cloneProfileTagMap(this.tags);
      next.failure = this.failure;
      next.nextTag = this.nextTag;
      for (const [metadataId, metadata] of this.metadataByTag.entries()) {
        next.metadataByTag.set(metadataId, metadata);
      }
    });

    return next;
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

      const replacement = this.allocateTag(this.primaryProfile());
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

    const defaultTags = this.tags[DEFAULT_PROFILE] ?? emptyTagDictNode();
    const globalTags = this.tags[GLOBAL_PROFILE] ?? emptyTagDictNode();

    let value = deepClone(defaults);
    let tags = cloneTagDictNode(defaultTags);
    for (const profile of this.activeProfiles) {
      const selected = this.values[profile];
      if (selected && isCustomProfile(profile)) {
        value = coalesceDict(value, selected, "merge");
      }

      const selectedTags = this.tags[profile];
      if (selectedTags && isCustomProfile(profile)) {
        tags = coalesceTagDictNode(tags, selectedTags, "merge");
      }
    }

    return {
      value: coalesceDict(value, globals, "merge"),
      tags: coalesceTagDictNode(tags, globalTags, "merge"),
    };
  }

  private async findTagForPath(path: string): Promise<Tag | undefined> {
    const tree = findTag((await this.mergedState()).tags, path);
    return unwrapTag(tree);
  }

  private primaryProfile(): string {
    return this.activeProfiles[0] ?? DEFAULT_PROFILE;
  }

  private effectiveProfileOrder(): string[] {
    return [DEFAULT_PROFILE, ...this.activeProfiles, GLOBAL_PROFILE];
  }

  private errorProfileContext(): {
    profile: string;
    selectedProfiles: string[];
    effectiveProfileOrder: string[];
  } {
    return {
      profile: this.primaryProfile(),
      selectedProfiles: this.selectedProfiles(),
      effectiveProfileOrder: this.effectiveProfileOrder(),
    };
  }
}

function normalizeProfiles(map: ProfileMap): ProfileMap {
  const out: ProfileMap = {};
  for (const [profile, dict] of Object.entries(map)) {
    out[normalizeProfile(profile)] = deepClone(dict);
  }

  return out;
}

function normalizeSelectedProfiles(profiles: string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const profile of profiles) {
    const next = normalizeProfile(profile);
    if (!isCustomProfile(next) || seen.has(next)) {
      continue;
    }

    seen.add(next);
    normalized.push(next);
  }

  return normalized;
}

function applyProviderProfileSelection(
  selectedProfiles: string[],
  providerProfile: string,
  order: CoalesceOrder,
  mode: ProviderProfileSelectionMode,
): string[] {
  if (!isCustomProfile(providerProfile)) {
    return selectedProfiles;
  }

  switch (mode) {
    case "never":
      return selectedProfiles;
    case "seedWhenEmpty":
      return selectedProfiles.length === 0 ? [providerProfile] : selectedProfiles;
    case "coalesce": {
      const current = selectedProfiles[0] ?? DEFAULT_PROFILE;
      const profile = profileCoalesce(current, providerProfile, order);
      return isCustomProfile(profile) ? [profile] : [];
    }
  }
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

function collectMetadataIds(tree: TagTree): number[] {
  const ids: number[] = [tree.tag.metadataId];
  switch (tree.kind) {
    case "scalar":
      return ids;
    case "array":
      for (const child of tree.children) {
        ids.push(...collectMetadataIds(child));
      }

      return ids;
    case "dict":
      for (const child of tree.children) {
        ids.push(...collectMetadataIds(child));
      }

      return ids;
  }
}

function runDecoder<T, V>(
  value: V,
  decode: ValueDecoder<T, V>,
  scope: string,
  options?: {
    path?: string;
    context?: {
      tag?: Tag;
      profile?: string;
      selectedProfiles?: string[];
      effectiveProfileOrder?: string[];
      metadata?: Metadata;
    };
  },
): T {
  try {
    if (typeof decode === "function") {
      return decode(value);
    }

    return decode.parse(value);
  } catch (error) {
    let figmentError =
      error instanceof FigmentError ? error : FigmentError.decode(scope, error);

    if (options?.path) {
      figmentError = figmentError.withPath(options.path);
    }

    if (options?.context) {
      figmentError = figmentError.withContext(options.context);
    }

    throw figmentError;
  }
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
