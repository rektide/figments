import {
  buildTagProfileMap,
  makeTag,
  remapProfileTagMap,
  type ProfileTagMap,
  type TagNode,
} from "../core/tag.ts";
import { findTag } from "../core/path.ts";
import { metadataFromInline, type Metadata } from "../core/metadata.ts";
import { deepClone, type ConfigDict, type ConfigValue, type ProfileMap } from "../core/types.ts";
import { DEFAULT_PROFILE, normalizeProfile } from "../profile.ts";
import type { Provider } from "../provider.ts";

/**
 * Applies metadata only to the matched path (`node`) or to the matched path and
 * every descendant (`subtree`).
 */
export type TaggedRuleMode = "node" | "subtree";

/**
 * Rule describing where to apply metadata tags in provider data.
 *
 * - `path`: Dot-separated config path (for example: `app.db.password`).
 * - `profile`: Optional target profile; when omitted, applies to all profiles.
 * - `mode`: Defaults to `subtree`.
 */
export type TaggedRule = {
  readonly path: string;
  readonly metadata: Metadata;
  readonly profile?: string;
  readonly mode?: TaggedRuleMode;
};

/**
 * Construction options for {@link Tagged}.
 */
export type TaggedOptions = {
  /**
   * Base data emitted by the provider.
   */
  readonly data: ProfileMap;
  /**
   * Optional provider-facing metadata (used for paths not covered by rules).
   */
  readonly metadata?: Metadata;
  /**
   * Optional name used when `metadata` is not provided.
   */
  readonly name?: string;
  /**
   * Rules that assign metadata to specific paths.
   */
  readonly rules?: ReadonlyArray<TaggedRule>;
  /**
   * When true, throw if a rule targets a missing profile/path.
   */
  readonly strict?: boolean;
  /**
   * Optional selected profile advertised by this provider.
   */
  readonly selectedProfile?: string;
};

/**
 * Provider helper for building providers with per-path metadata attribution.
 *
 * This wraps raw `ProfileMap` data and generates `metadataMap()` + `tagMap()`
 * automatically from a list of path rules.
 *
 * @example
 * ```ts
 * import { metadataFromEnv, metadataFromFile } from "../core/metadata.ts";
 *
 * const provider = Tagged.from({
 *   name: "TaggedExample",
 *   data: {
 *     default: {
 *       app: {
 *         host: "localhost",
 *         db: { password: "secret" },
 *       },
 *     },
 *   },
 *   rules: [
 *     { path: "app.host", metadata: metadataFromEnv("EnvHost", "APP_HOST"), mode: "node" },
 *     { path: "app.db", metadata: metadataFromFile("Vault", "/run/secrets/app"), mode: "subtree" },
 *   ],
 * });
 * ```
 */
export class Tagged implements Provider {
  private readonly values: ProfileMap;
  private readonly providerMetadata: Metadata;
  private readonly metadataById: Map<number, Metadata>;
  private readonly tagsByProfile: ProfileTagMap;
  private readonly profileName: string | undefined;

  public constructor(options: TaggedOptions) {
    const normalizedValues = cloneProfileMap(options.data);
    const providerMetadata =
      options.metadata ??
      metadataFromInline(
        options.name ?? "Tagged",
        `${(options.name ?? "Tagged").toLowerCase()} provider`,
      );

    this.values = normalizedValues;
    this.providerMetadata = providerMetadata;
    this.profileName = options.selectedProfile
      ? normalizeProfile(options.selectedProfile)
      : undefined;

    const rootMetadataId = 1;
    const metadataById = new Map<number, Metadata>([[rootMetadataId, providerMetadata]]);
    const tagsByProfile = buildTagProfileMap(
      normalizedValues,
      makeTag(rootMetadataId, DEFAULT_PROFILE),
    );

    const strict = options.strict ?? false;
    const rules = options.rules ?? [];
    let nextMetadataId = rootMetadataId + 1;
    for (const rule of rules) {
      metadataById.set(nextMetadataId, rule.metadata);
      applyTaggedRule(tagsByProfile, rule, nextMetadataId, strict);
      nextMetadataId += 1;
    }

    this.metadataById = metadataById;
    this.tagsByProfile = tagsByProfile;
  }

  /**
   * Constructs a tagged provider from options.
   */
  public static from(options: TaggedOptions): Tagged {
    return new Tagged(options);
  }

  public metadata(): Metadata {
    return this.providerMetadata;
  }

  public selectedProfile(): string | undefined {
    return this.profileName;
  }

  public data(): ProfileMap {
    return cloneProfileMap(this.values);
  }

  public metadataMap(): Map<number, Metadata> {
    return new Map(this.metadataById);
  }

  public tagMap(): ProfileTagMap {
    return remapProfileTagMap(this.tagsByProfile, new Map());
  }
}

/**
 * Convenience helper equivalent to `Tagged.from(options)`.
 */
export function taggedProvider(options: TaggedOptions): Tagged {
  return Tagged.from(options);
}

function applyTaggedRule(
  tagsByProfile: ProfileTagMap,
  rule: TaggedRule,
  metadataId: number,
  strict: boolean,
): void {
  const mode = rule.mode ?? "subtree";
  const targetProfiles =
    rule.profile === undefined ? Object.keys(tagsByProfile) : [normalizeProfile(rule.profile)];
  const path = rule.path.trim();

  if (targetProfiles.length === 0) {
    if (strict) {
      throw new Error("invalid tagged rule: provider has no profiles to tag");
    }

    return;
  }

  let applied = false;
  for (const profile of targetProfiles) {
    const root = tagsByProfile[profile];
    if (!root) {
      if (strict) {
        throw new Error(`invalid tagged rule: profile '${profile}' not found`);
      }

      continue;
    }

    const node = findTag(root, path);
    if (!node) {
      if (strict) {
        throw new Error(`invalid tagged rule: path '${path}' not found in profile '${profile}'`);
      }

      continue;
    }

    retagNode(node, metadataId, mode);
    applied = true;
  }

  if (!applied && strict) {
    throw new Error(`invalid tagged rule: no targets matched path '${path}'`);
  }
}

function retagNode(node: TagNode, metadataId: number, mode: TaggedRuleMode): void {
  node.tag = makeTag(metadataId, node.tag.profile);
  if (mode === "node") {
    return;
  }

  if (node.kind === "array") {
    for (const child of node.children) {
      retagNode(child, metadataId, mode);
    }

    return;
  }

  if (node.kind === "dict") {
    for (const child of node.children) {
      retagNode(child, metadataId, mode);
    }
  }
}

function cloneProfileMap(map: ProfileMap): ProfileMap {
  const out: ProfileMap = {};
  for (const [profile, dict] of Object.entries(map)) {
    out[normalizeProfile(profile)] = cloneConfigDict(dict);
  }

  return out;
}

function cloneConfigDict(dict: ConfigDict): ConfigDict {
  const out: ConfigDict = {};
  for (const [key, value] of Object.entries(dict)) {
    out[key] = cloneConfigValue(value);
  }

  return out;
}

function cloneConfigValue(value: ConfigValue): ConfigValue {
  return deepClone(value);
}
