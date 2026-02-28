import type { ConfigDict, ConfigValue } from "./types.ts";
import { isConfigDict } from "./types.ts";
import type { TagDictNode, TagTree } from "./tag.ts";
import { dictChildrenIndex } from "./tag.ts";

export function findValue(dict: ConfigDict, path: string): ConfigValue | undefined {
  if (path.length === 0) {
    return dict;
  }

  const keys = path.split(".").filter(Boolean);
  let current: ConfigValue = dict;
  for (const key of keys) {
    if (Array.isArray(current)) {
      const index = parsePathIndex(key);
      if (index === undefined) {
        return undefined;
      }

      current = current[index];
      if (current === undefined) {
        return undefined;
      }

      continue;
    }

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

  const root = keys[0];
  if (parsePathIndex(root) !== undefined) {
    return {};
  }

  let out: ConfigValue = value;
  for (let i = keys.length - 1; i >= 1; i -= 1) {
    const key = keys[i];
    const index = parsePathIndex(key);
    if (index !== undefined) {
      const array: ConfigValue[] = [];
      array[index] = out;
      out = array;
      continue;
    }

    out = { [key]: out };
  }

  return { [root]: out };
}

export function findTag(dict: TagDictNode, path: string): TagTree | undefined {
  if (path.length === 0) {
    return dict;
  }

  const keys = path.split(".").filter(Boolean);
  let current: TagTree = dict;
  for (const key of keys) {
    if (current.kind === "array") {
      const index = parsePathIndex(key);
      if (index === undefined) {
        return undefined;
      }

      const child: TagTree | undefined = current.children[index];
      if (!child) {
        return undefined;
      }

      current = child;
      continue;
    }

    if (current.kind !== "dict") {
      return undefined;
    }

    const child: TagTree | undefined = dictChildrenIndex(current).get(key);
    if (!child) {
      return undefined;
    }

    current = child;
  }

  return current;
}

function parsePathIndex(key: string): number | undefined {
  if (!/^\d+$/.test(key)) {
    return undefined;
  }

  return Number.parseInt(key, 10);
}
