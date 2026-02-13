import type { ConfigValue, ProfileMap } from "./types.ts";
import { isConfigDict } from "./types.ts";

export type Tag = number;

export type TagTree = TagScalarNode | TagArrayNode | TagDictNode;

export interface TagScalarNode {
  kind: "scalar";
  tag: Tag;
}

export interface TagArrayNode {
  kind: "array";
  tag: Tag;
  items: TagTree[];
}

export interface TagDictNode {
  kind: "dict";
  tag: Tag;
  entries: TagDict;
}

export interface TagDict {
  [key: string]: TagTree;
}

export type ProfileTagMap = Record<string, TagDictNode>;

export function buildTagTree(value: ConfigValue, tag: Tag): TagTree {
  if (Array.isArray(value)) {
    return {
      kind: "array",
      tag,
      items: value.map((item) => buildTagTree(item, tag)),
    };
  }

  if (isConfigDict(value)) {
    const entries: TagDict = {};
    for (const [key, item] of Object.entries(value)) {
      entries[key] = buildTagTree(item, tag);
    }

    return {
      kind: "dict",
      tag,
      entries,
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
    map[profile] = buildTagTree(dict, tag) as TagDictNode;
  }

  return map;
}

export function isTagDictNode(value: TagTree): value is TagDictNode {
  return value.kind === "dict";
}

export function isTagArrayNode(value: TagTree): value is TagArrayNode {
  return value.kind === "array";
}

export function cloneTagTree(value: TagTree): TagTree {
  if (isTagArrayNode(value)) {
    return {
      kind: "array",
      tag: value.tag,
      items: value.items.map((item) => cloneTagTree(item)),
    };
  }

  if (isTagDictNode(value)) {
    return {
      kind: "dict",
      tag: value.tag,
      entries: Object.fromEntries(
        Object.entries(value.entries).map(([key, item]) => [key, cloneTagTree(item)]),
      ),
    };
  }

  return {
    kind: "scalar",
    tag: value.tag,
  };
}

export function cloneTagDictNode(value: TagDictNode): TagDictNode {
  return cloneTagTree(value) as TagDictNode;
}
