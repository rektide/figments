import type { ConfigDict, ConfigValue, ProfileMap } from "./types.ts";
import { deepClone, isConfigDict } from "./types.ts";

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

export function coalesceProfiles(current: ProfileMap, incoming: ProfileMap, order: CoalesceOrder): ProfileMap {
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

export function coalesceDict(current: ConfigDict, incoming: ConfigDict, order: CoalesceOrder): ConfigDict {
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

export function coalesceValue(current: ConfigValue, incoming: ConfigValue, order: CoalesceOrder): ConfigValue {
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
