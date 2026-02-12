import type { ConfigDict, ConfigValue, ProfileMap } from "./types.ts";
import { deepClone, isConfigDict } from "./types.ts";
import type { ProfileTagMap, TagDict, TagTree } from "./tag.ts";
import { isTagDict } from "./tag.ts";

export type CoalesceOrder = "join" | "adjoin" | "merge" | "admerge";

export function profileCoalesce(current: string, incoming: string, order: CoalesceOrder): string {
  switch (order) {
    case "join":
    case "adjoin":
      return current;
    case "merge":
    case "admerge":
      return incoming;
  }
}

export function coalesceProfiles(
  current: ProfileMap,
  incoming: ProfileMap,
  order: CoalesceOrder,
): ProfileMap {
  const out: ProfileMap = {};
  const keys = new Set([...Object.keys(current), ...Object.keys(incoming)]);

  for (const key of keys) {
    if (current[key] && incoming[key]) {
      out[key] = coalesceDict(current[key], incoming[key], order);
    } else if (current[key]) {
      out[key] = deepClone(current[key]);
    } else if (incoming[key]) {
      out[key] = deepClone(incoming[key]);
    }
  }

  return out;
}

export function coalesceDict(
  current: ConfigDict,
  incoming: ConfigDict,
  order: CoalesceOrder,
): ConfigDict {
  const out: ConfigDict = {};
  const keys = new Set([...Object.keys(current), ...Object.keys(incoming)]);

  for (const key of keys) {
    if (key in current && key in incoming) {
      out[key] = coalesceValue(current[key], incoming[key], order);
    } else if (key in current) {
      out[key] = deepClone(current[key]);
    } else {
      out[key] = deepClone(incoming[key]);
    }
  }

  return out;
}

export function coalesceValue(
  current: ConfigValue,
  incoming: ConfigValue,
  order: CoalesceOrder,
): ConfigValue {
  if (isConfigDict(current) && isConfigDict(incoming)) {
    if (order === "join" || order === "adjoin") {
      return coalesceDict(current, incoming, order);
    }

    return coalesceDict(current, incoming, order);
  }

  if (Array.isArray(current) && Array.isArray(incoming)) {
    if (order === "adjoin" || order === "admerge") {
      return [...deepClone(current), ...deepClone(incoming)];
    }

    return order === "join" ? deepClone(current) : deepClone(incoming);
  }

  if (order === "join" || order === "adjoin") {
    return deepClone(current);
  }

  return deepClone(incoming);
}

export function coalesceTagProfiles(
  current: ProfileTagMap,
  incoming: ProfileTagMap,
  order: CoalesceOrder,
): ProfileTagMap {
  const out: ProfileTagMap = {};
  const keys = new Set([...Object.keys(current), ...Object.keys(incoming)]);

  for (const key of keys) {
    if (current[key] && incoming[key]) {
      out[key] = coalesceTagDict(current[key], incoming[key], order);
    } else if (current[key]) {
      out[key] = deepCloneTag(current[key]) as TagDict;
    } else if (incoming[key]) {
      out[key] = deepCloneTag(incoming[key]) as TagDict;
    }
  }

  return out;
}

export function coalesceTagDict(
  current: TagDict,
  incoming: TagDict,
  order: CoalesceOrder,
): TagDict {
  const out: TagDict = {};
  const keys = new Set([...Object.keys(current), ...Object.keys(incoming)]);

  for (const key of keys) {
    if (key in current && key in incoming) {
      out[key] = coalesceTagValue(current[key], incoming[key], order);
    } else if (key in current) {
      out[key] = deepCloneTag(current[key]);
    } else {
      out[key] = deepCloneTag(incoming[key]);
    }
  }

  return out;
}

export function coalesceTagValue(
  current: TagTree,
  incoming: TagTree,
  order: CoalesceOrder,
): TagTree {
  if (isTagDict(current) && isTagDict(incoming)) {
    return coalesceTagDict(current, incoming, order);
  }

  if (Array.isArray(current) && Array.isArray(incoming)) {
    if (order === "adjoin" || order === "admerge") {
      return [...deepCloneTag(current), ...deepCloneTag(incoming)];
    }

    return order === "join" ? deepCloneTag(current) : deepCloneTag(incoming);
  }

  if (order === "join" || order === "adjoin") {
    return deepCloneTag(current);
  }

  return deepCloneTag(incoming);
}

function deepCloneTag<T extends TagTree>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => deepCloneTag(item)) as T;
  }

  if (typeof value === "object") {
    const out: TagDict = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = deepCloneTag(item);
    }

    return out as T;
  }

  return value;
}
