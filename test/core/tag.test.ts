import { describe, expect, it } from "vitest";

import {
  buildTagProfileMap,
  buildTagTree,
  cloneProfileTagMap,
  cloneTagTree,
  dictChildrenIndex,
  isTagArrayNode,
  isTagDictNode,
  makeTag,
  remapProfileTagMap,
  type ProfileTagMap,
  type TagArrayNode,
  type TagDictNode,
  type TagNode,
  type TagScalarNode,
} from "../../src/core/tag.ts";
import type { ConfigValue, ProfileMap } from "../../src/core/types.ts";

describe("makeTag", () => {
  it("creates a tag with metadata id and profile", () => {
    expect(makeTag(42, "debug")).toEqual({ metadataId: 42, profile: "debug" });
  });
});

describe("tag node shapes", () => {
  it("constructs scalar, array, and dict nodes", () => {
    const tag = makeTag(7, "default");
    const scalar: TagScalarNode = { kind: "scalar", tag };
    const array: TagArrayNode = { kind: "array", tag, children: [scalar] };
    const dict: TagDictNode = {
      kind: "dict",
      tag,
      children: [{ kind: "scalar", tag, key: "leaf" }],
    };

    expect(array.children[0].kind).toBe("scalar");
    expect(dict.children[0].key).toBe("leaf");
  });
});

describe("type guards", () => {
  const tag = makeTag(1, "default");
  const scalar: TagNode = { kind: "scalar", tag };
  const array: TagNode = { kind: "array", tag, children: [] };
  const dict: TagNode = { kind: "dict", tag, children: [] };

  it("detects dict nodes", () => {
    expect(isTagDictNode(dict)).toBe(true);
    expect(isTagDictNode(array)).toBe(false);
    expect(isTagDictNode(scalar)).toBe(false);
  });

  it("detects array nodes", () => {
    expect(isTagArrayNode(array)).toBe(true);
    expect(isTagArrayNode(dict)).toBe(false);
    expect(isTagArrayNode(scalar)).toBe(false);
  });
});

describe("buildTagTree", () => {
  it("builds a full tag tree from nested values", () => {
    const tag = makeTag(3, "default");
    const value: ConfigValue = {
      server: {
        host: "localhost",
        ports: [80, 443],
      },
      enabled: true,
    };

    const tree = buildTagTree(value, tag);
    expect(tree.kind).toBe("dict");
    if (!isTagDictNode(tree)) {
      throw new Error("expected dict node");
    }

    const server = dictChildrenIndex(tree).get("server");
    const enabled = dictChildrenIndex(tree).get("enabled");
    expect(server?.kind).toBe("dict");
    expect(enabled?.kind).toBe("scalar");

    if (!server || !isTagDictNode(server)) {
      throw new Error("expected nested server dict");
    }

    const ports = dictChildrenIndex(server).get("ports");
    expect(ports?.kind).toBe("array");
    if (!ports || !isTagArrayNode(ports)) {
      throw new Error("expected ports array");
    }

    expect(ports.children[0]?.kind).toBe("scalar");
    expect(ports.children[1]?.kind).toBe("scalar");
    expect(ports.children[0]?.tag).toBe(tag);
    expect(ports.children[1]?.tag).toBe(tag);
  });
});

describe("dictChildrenIndex", () => {
  it("indexes children by key and caches the map", () => {
    const tag = makeTag(8, "default");
    const node: TagDictNode = {
      kind: "dict",
      tag,
      children: [
        { kind: "scalar", tag, key: "alpha" },
        { kind: "scalar", tag, key: "beta" },
      ],
    };

    const first = dictChildrenIndex(node);
    const second = dictChildrenIndex(node);
    expect(first).toBe(second);
    expect(first.get("alpha")?.kind).toBe("scalar");
    expect(first.get("beta")?.kind).toBe("scalar");
  });
});

describe("buildTagProfileMap", () => {
  it("builds a profile-keyed map with profile-retagged trees", () => {
    const values: ProfileMap = {
      default: { retries: 2 },
      debug: { retries: 3, flags: { verbose: true } },
    };
    const map = buildTagProfileMap(values, makeTag(50, "ignored"));

    expect(Object.keys(map).sort()).toEqual(["debug", "default"]);
    expect(map.default.tag).toEqual({ metadataId: 50, profile: "default" });
    expect(map.debug.tag).toEqual({ metadataId: 50, profile: "debug" });
    expect(dictChildrenIndex(map.default).get("retries")?.tag.profile).toBe("default");
    expect(dictChildrenIndex(map.debug).get("retries")?.tag.profile).toBe("debug");
  });

  it("supports ProfileTagMap usage as a profile->dict structure", () => {
    const tag = makeTag(11, "default");
    const map: ProfileTagMap = {
      default: {
        kind: "dict",
        tag,
        children: [{ kind: "scalar", tag, key: "name" }],
      },
    };

    expect(map.default.kind).toBe("dict");
    expect(map.default.children[0]?.key).toBe("name");
  });
});

describe("cloneTagTree", () => {
  it("deep clones tree nodes while preserving tag references", () => {
    const tag = makeTag(9, "default");
    const source = buildTagTree(
      {
        a: 1,
        b: {
          c: [2, 3],
        },
      },
      tag,
    );

    const clone = cloneTagTree(source);
    expect(clone).toEqual(source);
    expect(clone).not.toBe(source);
    expect(clone.tag).toBe(source.tag);

    if (!isTagDictNode(source) || !isTagDictNode(clone)) {
      throw new Error("expected dict nodes");
    }

    expect(clone.children).not.toBe(source.children);
    const sourceB = dictChildrenIndex(source).get("b");
    const cloneB = dictChildrenIndex(clone).get("b");
    expect(cloneB).toBeDefined();
    expect(cloneB).not.toBe(sourceB);
  });
});

describe("cloneProfileTagMap", () => {
  it("deep clones profile map entries", () => {
    const source = buildTagProfileMap(
      {
        default: { app: { host: "localhost" } },
        debug: { app: { host: "127.0.0.1" } },
      },
      makeTag(12, "unused"),
    );

    const clone = cloneProfileTagMap(source);
    expect(clone).toEqual(source);
    expect(clone).not.toBe(source);
    expect(clone.default).not.toBe(source.default);
    expect(clone.debug).not.toBe(source.debug);
  });
});

describe("remapProfileTagMap", () => {
  it("remaps metadata ids recursively while preserving profiles", () => {
    const source: ProfileTagMap = {
      default: {
        kind: "dict",
        tag: makeTag(1, "default"),
        children: [
          { kind: "scalar", tag: makeTag(2, "default"), key: "alpha" },
          {
            kind: "array",
            key: "beta",
            tag: makeTag(3, "default"),
            children: [{ kind: "scalar", tag: makeTag(4, "default") }],
          },
        ],
      },
      debug: {
        kind: "dict",
        tag: makeTag(5, "debug"),
        children: [],
      },
    };

    const remapped = remapProfileTagMap(
      source,
      new Map<number, number>([
        [1, 101],
        [3, 103],
        [4, 104],
      ]),
    );

    expect(remapped.default.tag).toEqual({ metadataId: 101, profile: "default" });
    expect(remapped.debug.tag).toEqual({ metadataId: 5, profile: "debug" });

    const alpha = dictChildrenIndex(remapped.default).get("alpha");
    const beta = dictChildrenIndex(remapped.default).get("beta");
    expect(alpha?.tag.metadataId).toBe(2);
    expect(beta?.tag.metadataId).toBe(103);
    if (!beta || !isTagArrayNode(beta)) {
      throw new Error("expected beta to be array node");
    }

    expect(beta.children[0]?.tag.metadataId).toBe(104);
    expect(beta.children[0]?.tag.profile).toBe("default");

    expect(remapped.default).not.toBe(source.default);
    expect(source.default.tag.metadataId).toBe(1);
  });
});
