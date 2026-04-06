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
import {
  type FigmentFailure,
  FigmentError,
  isFigmentFailure,
  mergeFigmentFailures,
} from "./core/error.ts";
import { isEmpty } from "./core/const.ts";
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
import { FIGMENTS_STATE, type Stateful } from "./state.ts";

export type ValueDecoder<T, V = ConfigValue> =
  | ((value: V) => T)
  | {
      parse(value: V): T;
    };

export type ProviderProfileSelectionMode = "coalesce" | "seedWhenEmpty" | "never";

export type InterpretMode = "default" | "lossy";

export type MissingPolicy = "throw" | "undefined" | "null" | "default";

export type IncludeMetadataMode = "none" | "winner" | "all";

interface ResolveBaseOptions {
  interpret?: InterpretMode;
  profiles?: string[];
}

interface MissingOptions<T = unknown> {
  missing?: MissingPolicy;
  fallback?: T | (() => T);
}

export interface BuildOptions<T = ConfigDict> extends ResolveBaseOptions {
  deser?: ValueDecoder<T, ConfigDict>;
}

export interface ExtractOptions<T = ConfigValue>
  extends ResolveBaseOptions, MissingOptions<ConfigValue> {
  path: string;
  deser?: ValueDecoder<T, ConfigValue | undefined>;
}

export interface ExplainOptions<T = unknown>
  extends ResolveBaseOptions, MissingOptions<ConfigValue> {
  path?: string;
  deser?: ValueDecoder<T, unknown>;
  includeMetadata?: IncludeMetadataMode;
}

export interface ExplainResult<T = unknown> {
  path: string;
  exists: boolean;
  value: T | ConfigValue | ConfigDict | undefined | null;
  tag: Tag | undefined;
  metadata?: Metadata;
  metadataAll?: Metadata[];
  profile: string;
  selectedProfiles: string[];
  effectiveProfileOrder: string[];
}

export interface FigmentState {
  activeProfiles: string[];
  providerProfileSelectionMode: ProviderProfileSelectionMode;
  pending: Promise<void>;
  values: ProfileMap;
  tags: ProfileTagMap;
  metadataByTag: Map<number, Metadata>;
  failure?: FigmentFailure;
  nextTag: number;
}

type Providable = Provider | Figment;

export class Figment implements Stateful<FigmentState> {
  private activeProfiles: string[];
  private providerProfileSelectionMode: ProviderProfileSelectionMode;
  private readonly metadataByTag: Map<number, Metadata>;
  private values: ProfileMap;
  private tags: ProfileTagMap;
  private failure?: FigmentFailure;
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

  public static from(provider: Providable): Figment {
    return new Figment().provide(provider, "merge", captureProvideLocation());
  }

  public metadata(): Metadata {
    return {
      name: "Figment",
      interpolate: (profile, keys) => `${profile}.${keys.join(".")}`,
    };
  }

  public state(): FigmentState {
    return this[FIGMENTS_STATE]();
  }

  public [FIGMENTS_STATE](): FigmentState {
    return {
      activeProfiles: this.activeProfiles,
      providerProfileSelectionMode: this.providerProfileSelectionMode,
      pending: this.pending,
      values: this.values,
      tags: this.tags,
      metadataByTag: this.metadataByTag,
      failure: this.failure,
      nextTag: this.nextTag,
    };
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

  public async explain<T = unknown>(options: ExplainOptions<T> = {}): Promise<ExplainResult<T>> {
    const path = normalizePath(options.path);
    const selectedProfiles = options.profiles
      ? normalizeSelectedProfiles(options.profiles)
      : this.activeProfiles;
    const interpret = options.interpret ?? "default";
    const includeMetadata = options.includeMetadata ?? "winner";
    const context = this.errorProfileContext(selectedProfiles);

    const merged = await this.mergedState(selectedProfiles);
    const rawValue = path ? findValue(merged.value, path) : merged.value;
    const normalizedRawValue = isEmpty(rawValue) ? undefined : rawValue;
    const tree = path ? findTag(merged.tags, path) : merged.tags;
    const exists = normalizedRawValue !== undefined;
    const tag = unwrapTag(tree);
    const winnerMetadata = tag === undefined ? undefined : this.metadataByTag.get(tag.metadataId);

    const value =
      normalizedRawValue === undefined
        ? resolveMissingValue(path, options, context, "undefined")
        : resolveEmptyValue(applyInterpret(normalizedRawValue, interpret));

    const resolved = options.deser
      ? runDecoder(value, options.deser, describeScope(path, interpret), {
          path,
          context: {
            tag,
            ...context,
            metadata: winnerMetadata,
          },
        })
      : value;

    const metadata = includeMetadata === "none" ? undefined : winnerMetadata;
    const metadataAll =
      includeMetadata === "all" ? collectMetadata(tree, this.metadataByTag) : undefined;

    return {
      path: path ?? "",
      exists,
      value: cloneResolvable(resolved),
      tag,
      metadata,
      metadataAll,
      ...context,
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

  public join(provider: Providable): Figment {
    return this.provide(provider, "join", captureProvideLocation());
  }

  public adjoin(provider: Providable): Figment {
    return this.provide(provider, "adjoin", captureProvideLocation());
  }

  public zipjoin(provider: Providable): Figment {
    return this.provide(provider, "zipjoin", captureProvideLocation());
  }

  public merge(provider: Providable): Figment {
    return this.provide(provider, "merge", captureProvideLocation());
  }

  public admerge(provider: Providable): Figment {
    return this.provide(provider, "admerge", captureProvideLocation());
  }

  public zipmerge(provider: Providable): Figment {
    return this.provide(provider, "zipmerge", captureProvideLocation());
  }

  public async profiles(): Promise<string[]> {
    await this.ready();
    return Object.keys(this.values);
  }

  public async extract<T = ConfigValue>(options: ExtractOptions<T>): Promise<T> {
    const path = normalizePath(options.path);
    if (path === undefined) {
      throw FigmentError.invalidValue("extract requires a non-empty path");
    }

    const selectedProfiles = options.profiles
      ? normalizeSelectedProfiles(options.profiles)
      : this.activeProfiles;
    const interpret = options.interpret ?? "default";
    const context = this.errorProfileContext(selectedProfiles);

    const merged = await this.mergedState(selectedProfiles);
    const rawValue = findValue(merged.value, path);
    const normalizedRawValue = isEmpty(rawValue) ? undefined : rawValue;
    const tree = findTag(merged.tags, path);
    const tag = unwrapTag(tree);
    const metadata = tag === undefined ? undefined : this.metadataByTag.get(tag.metadataId);

    const value =
      normalizedRawValue === undefined
        ? resolveMissingValue(path, options, context, "throw")
        : interpret === "lossy"
          ? resolveEmptyValue(lossyValue(normalizedRawValue))
          : resolveEmptyValue(normalizedRawValue);

    const resolved = options.deser
      ? runDecoder(value, options.deser, describeScope(path, interpret), {
          path,
          context: {
            tag,
            ...context,
            metadata,
          },
        })
      : value;

    return cloneResolvable(resolved) as T;
  }

  public async build<T = ConfigDict>(options: BuildOptions<T> = {}): Promise<T> {
    const selectedProfiles = options.profiles
      ? normalizeSelectedProfiles(options.profiles)
      : this.activeProfiles;
    const interpret = options.interpret ?? "default";
    const context = this.errorProfileContext(selectedProfiles);

    const merged = await this.mergedState(selectedProfiles);
    const tag = unwrapTag(merged.tags);
    const metadata = tag === undefined ? undefined : this.metadataByTag.get(tag.metadataId);
    const value = resolveEmptyValue(
      interpret === "lossy" ? lossyConfig(merged.value) : merged.value,
    ) as ConfigDict;

    const resolved =
      options.deser === undefined
        ? value
        : runDecoder(value, options.deser, describeScope(undefined, interpret), {
            context: {
              tag,
              ...context,
              metadata,
            },
          });

    return cloneResolvable(resolved) as T;
  }

  public async contains(path: string): Promise<boolean> {
    return (await this.extract({ path, missing: "undefined" })) !== undefined;
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

  private provide(provider: Providable, order: CoalesceOrder, provideLocation?: string): Figment {
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

        if (provider instanceof Figment) {
          await provider.ready();
          const remap = next.importMetadataMap(provider.metadataByTag);
          incoming = normalizeProfiles(provider.values);
          incomingTags = remapProfileTagMap(cloneProfileTagMap(provider.tags), remap);
        } else {
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
        }

        next.values = coalesceProfiles(next.values, incoming, order);
        next.tags = coalesceTagProfiles(next.tags, incomingTags, order);
      } catch (error) {
        const figmentError = isFigmentFailure(error)
          ? error.withContext({
              metadata: contextMetadata,
              tag: contextTag,
              ...next.errorProfileContext(),
            })
          : FigmentError.message(
              error instanceof Error ? error.message : String(error),
            ).withContext({
              metadata: contextMetadata,
              tag: contextTag,
              ...next.errorProfileContext(),
            });

        next.failure = mergeFigmentFailures(figmentError, next.failure);
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

  private async mergedState(selectedProfiles = this.activeProfiles): Promise<{
    value: ConfigDict;
    tags: TagDictNode;
  }> {
    await this.ready();

    const defaults = this.values[DEFAULT_PROFILE] ?? {};
    const globals = this.values[GLOBAL_PROFILE] ?? {};

    const defaultTags = this.tags[DEFAULT_PROFILE] ?? emptyTagDictNode();
    const globalTags = this.tags[GLOBAL_PROFILE] ?? emptyTagDictNode();

    let value = deepClone(defaults);
    let tags = cloneTagDictNode(defaultTags);
    for (const profile of selectedProfiles) {
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

  private primaryProfile(selectedProfiles = this.activeProfiles): string {
    return selectedProfiles[0] ?? DEFAULT_PROFILE;
  }

  private effectiveProfileOrder(selectedProfiles = this.activeProfiles): string[] {
    return [DEFAULT_PROFILE, ...selectedProfiles, GLOBAL_PROFILE];
  }

  private errorProfileContext(selectedProfiles = this.activeProfiles): {
    profile: string;
    selectedProfiles: string[];
    effectiveProfileOrder: string[];
  } {
    return {
      profile: this.primaryProfile(selectedProfiles),
      selectedProfiles: [...selectedProfiles],
      effectiveProfileOrder: this.effectiveProfileOrder(selectedProfiles),
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

function normalizePath(path: string | undefined): string | undefined {
  if (path === undefined) {
    return undefined;
  }

  const trimmed = path.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function applyInterpret(
  value: ConfigValue | ConfigDict,
  interpret: InterpretMode,
): ConfigValue | ConfigDict {
  if (interpret === "lossy") {
    return isConfigDict(value) ? lossyConfig(value) : lossyValue(value);
  }

  return value;
}

function resolveEmptyValue<T>(value: T): T | undefined {
  if (isEmpty(value)) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveEmptyValue(item)) as T;
  }

  if (isConfigDict(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = resolveEmptyValue(item);
    }

    return out as T;
  }

  return value;
}

function resolveMissingValue<T>(
  path: string | undefined,
  options: MissingOptions<T>,
  context: {
    profile: string;
    selectedProfiles: string[];
    effectiveProfileOrder: string[];
  },
  defaultMissing: MissingPolicy,
): T | undefined | null {
  const missing = options.missing ?? defaultMissing;
  const missingPath = path ?? "(root)";

  switch (missing) {
    case "undefined":
      return undefined;
    case "null":
      return null;
    case "default": {
      const fallback =
        typeof options.fallback === "function" ? (options.fallback as () => T)() : options.fallback;
      if (fallback === undefined) {
        throw FigmentError.invalidValue("missing fallback for missing policy 'default'")
          .withPath(missingPath)
          .withContext(context);
      }

      return fallback;
    }
    case "throw":
      throw FigmentError.missingField(missingPath, context);
  }
}

function describeScope(path: string | undefined, interpret: InterpretMode): string {
  if (path) {
    return interpret === "lossy" ? `lossy key '${path}'` : `key '${path}'`;
  }

  return interpret === "lossy" ? "lossy config" : "config";
}

function collectMetadata(
  tree: TagTree | undefined,
  metadataByTag: ReadonlyMap<number, Metadata>,
): Metadata[] {
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
    const metadata = metadataByTag.get(metadataId);
    if (metadata) {
      out.push(metadata);
    }
  }

  return out;
}

function cloneResolvable<T>(value: T): T {
  if (isEmpty(value)) {
    return undefined as T;
  }

  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value) || isConfigDict(value)) {
    return deepClone(value as ConfigValue) as T;
  }

  return value;
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
    let figmentError: FigmentFailure = isFigmentFailure(error)
      ? error
      : FigmentError.decode(scope, error);

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
