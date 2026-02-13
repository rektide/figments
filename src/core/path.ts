import type { ConfigDict, ConfigValue } from "./types.ts";
import { isConfigDict } from "./types.ts";
import type { TagDictNode, TagTree } from "./tag.ts";
import { isTagDictNode } from "./tag.ts";

export function findValue(dict: ConfigDict, path: string): ConfigValue | undefined {
  if (path.length === 0) {
    return dict;
  }

  const keys = path.split(".").filter(Boolean);
  let current: ConfigValue = dict;
  for (const key of keys) {
    if (!isConfigDict(current)) {
      return undefined;
    }

    if (!(key in current)) {
      return undefined;
    }

    current = current[key];
  }

  return current;
}

export function nest(path: string, value: ConfigValue): ConfigDict {
  const keys = path
    .split(".")
    .map((k) => k.trim())
    .filter(Boolean);
  if (keys.length === 0) {
    return {};
  }

  let out: ConfigDict = { [keys[keys.length - 1]]: value };
  for (let i = keys.length - 2; i >= 0; i -= 1) {
    out = { [keys[i]]: out };
  }

  return out;
}

export function findTag(dict: TagDictNode, path: string): TagTree | undefined {
  if (path.length === 0) {
    return dict;
  }

  const keys = path.split(".").filter(Boolean);
  let current: TagTree = dict;
  for (const key of keys) {
    if (!isTagDictNode(current)) {
      return undefined;
    }

    const child: TagTree | undefined = current.children.find((item) => item.key === key);
    if (!child) {
      return undefined;
    }

    current = child;
  }

  return current;
}
