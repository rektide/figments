import type { ConfigValue, ProfileMap } from "./types.ts";
import { isConfigDict } from "./types.ts";

export type Tag = number;

export type TagTree = Tag | TagTree[] | TagDict;

export interface TagDict {
  [key: string]: TagTree;
}

export type ProfileTagMap = Record<string, TagDict>;

export function buildTagTree(value: ConfigValue, tag: Tag): TagTree {
  if (Array.isArray(value)) {
    return value.map((item) => buildTagTree(item, tag));
  }

  if (isConfigDict(value)) {
    const tree: TagDict = {};
    for (const [key, item] of Object.entries(value)) {
      tree[key] = buildTagTree(item, tag);
    }

    return tree;
  }

  return tag;
}

export function buildTagProfileMap(values: ProfileMap, tag: Tag): ProfileTagMap {
  const map: ProfileTagMap = {};
  for (const [profile, dict] of Object.entries(values)) {
    map[profile] = buildTagTree(dict, tag) as TagDict;
  }

  return map;
}

export function isTagDict(value: TagTree): value is TagDict {
  return typeof value === "object" && !Array.isArray(value);
}
