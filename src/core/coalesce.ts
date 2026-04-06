import type { ConfigDict, ConfigValue, ProfileMap } from "./types.ts";
import { deepClone, isConfigDict } from "./types.ts";
import { EMPTY, isEmpty } from "./const.ts";
import {
  dictChildrenIndex,
  type DictChildTagNode,
  type ProfileTagMap,
  type TagArrayNode,
  type TagDictNode,
  type TagTree,
  isTagArrayNode,
  isTagDictNode,
} from "./tag.ts";

export type CoalesceOrder = "join" | "adjoin" | "zipjoin" | "merge" | "admerge" | "zipmerge";

export function profileCoalesce(current: string, incoming: string, order: CoalesceOrder): string {
  switch (order) {
    case "join":
    case "adjoin":
    case "zipjoin":
      return current;
    case "merge":
    case "admerge":
    case "zipmerge":
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
  if (isEmpty(current) && !isEmpty(incoming)) {
    return deepClone(incoming);
  }

  if (!isEmpty(current) && isEmpty(incoming)) {
    return deepClone(current);
  }

  if (isEmpty(current) && isEmpty(incoming)) {
    return EMPTY;
  }

  if (isConfigDict(current) && isConfigDict(incoming)) {
    return coalesceDict(current, incoming, order);
  }

  if (Array.isArray(current) && Array.isArray(incoming)) {
    if (order === "adjoin" || order === "admerge") {
      return [...deepClone(current), ...deepClone(incoming)];
    }

    if (order === "zipjoin" || order === "zipmerge") {
      return zipArrayValues(current, incoming, order);
    }

    return order === "join" ? deepClone(current) : deepClone(incoming);
  }

  if (order === "join" || order === "adjoin" || order === "zipjoin") {
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
    key: current.key ?? incoming.key,
    tag: prefersCurrent(order) ? current.tag : incoming.tag,
    children: coalesceDictChildren(current, incoming, order),
  };
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
        key: current.key ?? incoming.key,
        tag: prefersCurrent(order) ? current.tag : incoming.tag,
        children: [
          ...current.children.map((item) => deepCloneTag(item)),
          ...incoming.children.map((item) => deepCloneTag(item)),
        ],
      };
    }

    if (order === "zipjoin" || order === "zipmerge") {
      return {
        kind: "array",
        key: current.key ?? incoming.key,
        tag: prefersCurrent(order) ? current.tag : incoming.tag,
        children: zipTagArrayChildren(current, incoming, order),
      };
    }

    return order === "join" ? deepCloneTag(current) : deepCloneTag(incoming);
  }

  if (order === "join" || order === "adjoin" || order === "zipjoin") {
    return deepCloneTag(current);
  }

  return deepCloneTag(incoming);
}

function coalesceDictChildren(
  current: TagDictNode,
  incoming: TagDictNode,
  order: CoalesceOrder,
): DictChildTagNode[] {
  const byCurrent = dictChildrenIndex(current);
  const byIncoming = dictChildrenIndex(incoming);
  const keys = new Set([...byCurrent.keys(), ...byIncoming.keys()]);
  const out: DictChildTagNode[] = [];

  for (const key of keys) {
    const left = byCurrent.get(key);
    const right = byIncoming.get(key);
    if (left && right) {
      out.push({ ...(coalesceTagValue(left, right, order) as DictChildTagNode), key });
    } else if (left) {
      out.push(deepCloneTag(left) as DictChildTagNode);
    } else if (right) {
      out.push(deepCloneTag(right) as DictChildTagNode);
    }
  }

  return out;
}

function deepCloneTag<T extends TagTree>(value: T): T {
  if (isTagArrayNode(value)) {
    return {
      kind: "array",
      tag: value.tag,
      key: value.key,
      children: value.children.map((item) => deepCloneTag(item)),
    } as T;
  }

  if (isTagDictNode(value)) {
    return {
      kind: "dict",
      tag: value.tag,
      key: value.key,
      children: value.children.map((item) => deepCloneTag(item) as DictChildTagNode),
    } as T;
  }

  return {
    kind: "scalar",
    tag: value.tag,
    key: value.key,
  } as T;
}

function zipArrayValues(
  current: ConfigValue[],
  incoming: ConfigValue[],
  order: CoalesceOrder,
): ConfigValue[] {
  const out: ConfigValue[] = [];
  const max = Math.max(current.length, incoming.length);
  for (let i = 0; i < max; i += 1) {
    const left = current[i];
    const right = incoming[i];
    if (left !== undefined && right !== undefined) {
      out[i] = coalesceValue(left, right, order);
    } else if (left !== undefined) {
      out[i] = deepClone(left);
    } else if (right !== undefined) {
      out[i] = deepClone(right);
    }
  }

  return out;
}

function zipTagArrayChildren(
  current: TagArrayNode,
  incoming: TagArrayNode,
  order: CoalesceOrder,
): TagTree[] {
  const out: TagTree[] = [];
  const max = Math.max(current.children.length, incoming.children.length);
  for (let i = 0; i < max; i += 1) {
    const left = current.children[i];
    const right = incoming.children[i];
    if (left && right) {
      out[i] = coalesceTagValue(left, right, order);
    } else if (left) {
      out[i] = deepCloneTag(left);
    } else if (right) {
      out[i] = deepCloneTag(right);
    }
  }

  return out;
}

function prefersCurrent(order: CoalesceOrder): boolean {
  return order === "join" || order === "adjoin" || order === "zipjoin";
}
