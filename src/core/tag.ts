import type { ConfigValue, ProfileMap } from "./types.ts";
import { isConfigDict } from "./types.ts";

export interface Tag {
  metadataId: number;
  profile: string;
}

export interface BaseTagNode {
  kind: "scalar" | "array" | "dict";
  tag: Tag;
  key?: string;
}

export interface TagScalarNode extends BaseTagNode {
  kind: "scalar";
}

export interface TagArrayNode extends BaseTagNode {
  kind: "array";
  children: TagNode[];
}

export interface TagDictNode extends BaseTagNode {
  kind: "dict";
  children: DictChildTagNode[];
}

export type TagNode = TagScalarNode | TagArrayNode | TagDictNode;

export type DictChildTagNode =
  | (TagScalarNode & { key: string })
  | (TagArrayNode & { key: string })
  | (TagDictNode & { key: string });

export type TagTree = TagNode;

export type ProfileTagMap = Record<string, TagDictNode>;

export function buildTagTree(value: ConfigValue, tag: Tag): TagNode {
  if (Array.isArray(value)) {
    return {
      kind: "array",
      tag,
      children: value.map((item) => buildTagTree(item, tag)),
    };
  }

  if (isConfigDict(value)) {
    const children: DictChildTagNode[] = [];
    for (const [key, item] of Object.entries(value)) {
      children.push({ ...buildTagTree(item, tag), key } as DictChildTagNode);
    }

    return {
      kind: "dict",
      tag,
      children,
    };
  }

  return {
    kind: "scalar",
    tag,
  };
}

export function buildTagProfileMap(values: ProfileMap, tag: Tag): ProfileTagMap {
  const map: ProfileTagMap = {};
  for (const [profile, dict] of Object.entries(values)) {
    map[profile] = buildTagTree(dict, retagForProfile(tag, profile)) as TagDictNode;
  }

  return map;
}

export function isTagDictNode(value: TagNode): value is TagDictNode {
  return value.kind === "dict";
}

export function isTagArrayNode(value: TagNode): value is TagArrayNode {
  return value.kind === "array";
}

export function cloneTagTree(value: TagNode): TagNode {
  if (value.kind === "array") {
    return {
      kind: "array",
      tag: value.tag,
      key: value.key,
      children: value.children.map((item) => cloneTagTree(item)),
    };
  }

  if (value.kind === "dict") {
    return {
      kind: "dict",
      tag: value.tag,
      key: value.key,
      children: value.children.map((item) => cloneTagTree(item) as DictChildTagNode),
    };
  }

  return {
    kind: "scalar",
    tag: value.tag,
    key: value.key,
  };
}

export function cloneTagDictNode(value: TagDictNode): TagDictNode {
  return cloneTagTree(value) as TagDictNode;
}

export function cloneProfileTagMap(map: ProfileTagMap): ProfileTagMap {
  const out: ProfileTagMap = {};
  for (const [profile, node] of Object.entries(map)) {
    out[profile] = cloneTagDictNode(node);
  }

  return out;
}

export function remapProfileTagMap(
  map: ProfileTagMap,
  tagMap: ReadonlyMap<number, number>,
): ProfileTagMap {
  const out: ProfileTagMap = {};
  for (const [profile, node] of Object.entries(map)) {
    out[profile] = remapTagTree(node, tagMap) as TagDictNode;
  }

  return out;
}

function remapTagTree(value: TagNode, tagMap: ReadonlyMap<number, number>): TagNode {
  const tag = {
    metadataId: tagMap.get(value.tag.metadataId) ?? value.tag.metadataId,
    profile: value.tag.profile,
  };

  if (value.kind === "array") {
    return {
      kind: "array",
      tag,
      key: value.key,
      children: value.children.map((item) => remapTagTree(item, tagMap)),
    };
  }

  if (value.kind === "dict") {
    return {
      kind: "dict",
      tag,
      key: value.key,
      children: value.children.map((item) => remapTagTree(item, tagMap) as DictChildTagNode),
    };
  }

  return {
    kind: "scalar",
    tag,
    key: value.key,
  };
}

export function makeTag(metadataId: number, profile: string): Tag {
  return {
    metadataId,
    profile,
  };
}

export function retagForProfile(tag: Tag, profile: string): Tag {
  return {
    metadataId: tag.metadataId,
    profile,
  };
}
