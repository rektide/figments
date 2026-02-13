import type { ConfigDict, ConfigValue, ProfileMap } from "./types.ts";
import { deepClone, isConfigDict } from "./types.ts";
import {
  type ProfileTagMap,
  type TagDict,
  type TagDictNode,
  type TagTree,
  isTagArrayNode,
  isTagDictNode,
} from "./tag.ts";

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
      out[key] = coalesceTagDictNode(current[key], incoming[key], order);
    } else if (current[key]) {
      out[key] = deepCloneTag(current[key]) as TagDictNode;
    } else if (incoming[key]) {
      out[key] = deepCloneTag(incoming[key]) as TagDictNode;
    }
  }

  return out;
}

export function coalesceTagDictNode(
  current: TagDictNode,
  incoming: TagDictNode,
  order: CoalesceOrder,
): TagDictNode {
  return {
    kind: "dict",
    tag: prefersCurrent(order) ? current.tag : incoming.tag,
    entries: coalesceTagDict(current.entries, incoming.entries, order),
  };
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
  if (isTagDictNode(current) && isTagDictNode(incoming)) {
    return coalesceTagDictNode(current, incoming, order);
  }

  if (isTagArrayNode(current) && isTagArrayNode(incoming)) {
    if (order === "adjoin" || order === "admerge") {
      return {
        kind: "array",
        tag: prefersCurrent(order) ? current.tag : incoming.tag,
        items: [
          ...current.items.map((item) => deepCloneTag(item)),
          ...incoming.items.map((item) => deepCloneTag(item)),
        ],
      };
    }

    return order === "join" ? deepCloneTag(current) : deepCloneTag(incoming);
  }

  if (order === "join" || order === "adjoin") {
    return deepCloneTag(current);
  }

  return deepCloneTag(incoming);
}

function deepCloneTag<T extends TagTree>(value: T): T {
  if (isTagArrayNode(value)) {
    return {
      kind: "array",
      tag: value.tag,
      items: value.items.map((item) => deepCloneTag(item)),
    } as T;
  }

  if (isTagDictNode(value)) {
    const out: TagDict = {};
    for (const [key, item] of Object.entries(value.entries)) {
      out[key] = deepCloneTag(item);
    }

    return {
      kind: "dict",
      tag: value.tag,
      entries: out,
    } as T;
  }

  return {
    kind: "scalar",
    tag: value.tag,
  } as T;
}

function prefersCurrent(order: CoalesceOrder): boolean {
  return order === "join" || order === "adjoin";
}
