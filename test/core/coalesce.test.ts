import { describe, expect, it } from "vitest";

import {
  coalesceDict,
  coalesceProfiles,
  coalesceTagDictNode,
  coalesceTagProfiles,
  coalesceTagValue,
  coalesceValue,
  profileCoalesce,
  type CoalesceOrder,
} from "../../src/core/coalesce.ts";
import { makeTag, type Tag, type TagArrayNode, type TagDictNode } from "../../src/core/tag.ts";
import type { ConfigDict, ConfigValue, ProfileMap } from "../../src/core/types.ts";

const MERGE_ORDERS: CoalesceOrder[] = ["merge", "admerge", "zipmerge"];
const JOIN_ORDERS: CoalesceOrder[] = ["join", "adjoin", "zipjoin"];

describe("profileCoalesce", () => {
  it.each(MERGE_ORDERS)("prefers incoming for %s", (order) => {
    expect(profileCoalesce("default", "debug", order)).toBe("debug");
  });

  it.each(JOIN_ORDERS)("prefers current for %s", (order) => {
    expect(profileCoalesce("default", "debug", order)).toBe("default");
  });
});

describe("coalesceValue — scalar conflict resolution", () => {
  it.each(MERGE_ORDERS)("merge-group picks incoming: %s", (order) => {
    expect(coalesceValue("a", "b", order)).toBe("b");
  });

  it.each(JOIN_ORDERS)("join-group picks current: %s", (order) => {
    expect(coalesceValue("a", "b", order)).toBe("a");
  });

  it("preserves numeric types", () => {
    expect(coalesceValue(1, 2, "merge")).toBe(2);
    expect(coalesceValue(1, 2, "join")).toBe(1);
  });

  it("preserves boolean types", () => {
    expect(coalesceValue(true, false, "merge")).toBe(false);
    expect(coalesceValue(true, false, "join")).toBe(true);
  });

  it("handles null values", () => {
    expect(coalesceValue(null, "b", "merge")).toBe("b");
    expect(coalesceValue("a", null, "join")).toBe("a");
  });
});

describe("coalesceValue — nested dict merging", () => {
  function a(): ConfigValue {
    return {
      a: { one: 1, two: 2 },
      b: { ten: 10, twenty: 20 },
    };
  }

  function b(): ConfigValue {
    return {
      a: { one: 2, three: 3 },
      b: { ten: 20, thirty: 30 },
    };
  }

  function joined(): ConfigValue {
    return {
      a: { one: 1, two: 2, three: 3 },
      b: { ten: 10, twenty: 20, thirty: 30 },
    };
  }

  function merged(): ConfigValue {
    return {
      a: { one: 2, two: 2, three: 3 },
      b: { ten: 20, twenty: 20, thirty: 30 },
    };
  }

  it.each(MERGE_ORDERS)("merge-group produces merged result: %s", (order) => {
    expect(coalesceValue(a(), b(), order)).toEqual(merged());
  });

  it.each(JOIN_ORDERS)("join-group produces joined result: %s", (order) => {
    expect(coalesceValue(a(), b(), order)).toEqual(joined());
  });
});

describe("coalesceValue — array behavior per order", () => {
  const a: ConfigValue = [1, 2];
  const b: ConfigValue = [2, 3, 4];

  it("merge replaces entire array", () => {
    expect(coalesceValue(a, b, "merge")).toEqual([2, 3, 4]);
  });

  it("join keeps original array", () => {
    expect(coalesceValue(a, b, "join")).toEqual([1, 2]);
  });

  it("adjoin concatenates arrays", () => {
    expect(coalesceValue(a, b, "adjoin")).toEqual([1, 2, 2, 3, 4]);
  });

  it("admerge concatenates arrays", () => {
    expect(coalesceValue(a, b, "admerge")).toEqual([1, 2, 2, 3, 4]);
  });

  it("zipmerge replaces element-wise", () => {
    expect(coalesceValue(a, b, "zipmerge")).toEqual([2, 3, 4]);
  });

  it("zipjoin keeps element-wise from current", () => {
    expect(coalesceValue(a, b, "zipjoin")).toEqual([1, 2, 4]);
  });
});

describe("coalesceValue — zip with sparse positions", () => {
  const sparse = (): ConfigValue[] => {
    const a = [50, , 4] as unknown as ConfigValue[];
    const b = [, 2, 6, , 20] as unknown as ConfigValue[];
    return [a, b] as unknown as ConfigValue[];
  };

  it("zipmerge fills sparse slots from the other side", () => {
    const [a, b] = sparse();
    expect(coalesceValue(a, b, "zipmerge")).toEqual([50, 2, 6, undefined, 20]);
  });

  it("zipjoin fills sparse slots from the other side", () => {
    const [a, b] = sparse();
    expect(coalesceValue(a, b, "zipjoin")).toEqual([50, 2, 4, undefined, 20]);
  });

  it("admerge concatenates preserving sparse slots", () => {
    const [a, b] = sparse();
    expect(coalesceValue(a, b, "admerge")).toEqual([
      50,
      undefined,
      4,
      undefined,
      2,
      6,
      undefined,
      20,
    ]);
  });

  it("adjoin concatenates preserving sparse slots", () => {
    const [a, b] = sparse();
    expect(coalesceValue(a, b, "adjoin")).toEqual([
      50,
      undefined,
      4,
      undefined,
      2,
      6,
      undefined,
      20,
    ]);
  });

  it("merge replaces entirely with b", () => {
    const [a, b] = sparse();
    expect(coalesceValue(a, b, "merge")).toEqual([undefined, 2, 6, undefined, 20]);
  });

  it("join keeps a entirely", () => {
    const [a, b] = sparse();
    expect(coalesceValue(a, b, "join")).toEqual([50, undefined, 4]);
  });
});

describe("coalesceValue — does not mutate inputs", () => {
  it("leaves original dicts unmodified", () => {
    const a: ConfigValue = { x: 1 };
    const b: ConfigValue = { x: 2 };
    const aCopy = JSON.parse(JSON.stringify(a));
    coalesceValue(a, b, "merge");
    expect(a).toEqual(aCopy);
  });

  it("leaves original arrays unmodified", () => {
    const a: ConfigValue = [1, 2];
    const b: ConfigValue = [3, 4];
    const aCopy = [1, 2];
    const bCopy = [3, 4];
    coalesceValue(a, b, "adjoin");
    expect(a).toEqual(aCopy);
    expect(b).toEqual(bCopy);
  });
});

describe("coalesceDict", () => {
  it("handles disjoint keys", () => {
    const a: ConfigDict = { x: 1 };
    const b: ConfigDict = { y: 2 };
    expect(coalesceDict(a, b, "merge")).toEqual({ x: 1, y: 2 });
    expect(coalesceDict(a, b, "join")).toEqual({ x: 1, y: 2 });
  });

  it("handles empty dicts", () => {
    expect(coalesceDict({}, { x: 1 }, "merge")).toEqual({ x: 1 });
    expect(coalesceDict({ x: 1 }, {}, "join")).toEqual({ x: 1 });
    expect(coalesceDict({}, {}, "merge")).toEqual({});
  });

  it("recursively merges nested dicts", () => {
    const a: ConfigDict = { root: { a: 1, b: 2 } };
    const b: ConfigDict = { root: { a: 10, c: 3 } };
    expect(coalesceDict(a, b, "merge")).toEqual({ root: { a: 10, b: 2, c: 3 } });
    expect(coalesceDict(a, b, "join")).toEqual({ root: { a: 1, b: 2, c: 3 } });
  });
});

describe("coalesceProfiles", () => {
  it("merges overlapping profiles", () => {
    const a: ProfileMap = { default: { x: 1 }, debug: { y: 2 } };
    const b: ProfileMap = { default: { x: 10 }, release: { z: 3 } };
    expect(coalesceProfiles(a, b, "merge")).toEqual({
      default: { x: 10 },
      debug: { y: 2 },
      release: { z: 3 },
    });
  });

  it("keeps current values on join", () => {
    const a: ProfileMap = { default: { x: 1 } };
    const b: ProfileMap = { default: { x: 10, y: 2 } };
    expect(coalesceProfiles(a, b, "join")).toEqual({
      default: { x: 1, y: 2 },
    });
  });

  it("handles profiles only in one side", () => {
    const a: ProfileMap = { debug: { y: 2 } };
    const b: ProfileMap = { release: { z: 3 } };
    expect(coalesceProfiles(a, b, "merge")).toEqual({
      debug: { y: 2 },
      release: { z: 3 },
    });
  });
});

function scalar(tag: Tag, key?: string) {
  return { kind: "scalar" as const, tag, key };
}

function scalarK(tag: Tag, key: string) {
  return { kind: "scalar" as const, tag, key };
}

function dictNode(tag: Tag, children: Array<{ kind: string; tag: Tag; key: string }>): TagDictNode {
  return { kind: "dict", tag, children: children as TagDictNode["children"] };
}

function arrayNode(
  tag: Tag,
  children: Array<{ kind: string; tag: Tag; key?: string }>,
): TagArrayNode {
  return { kind: "array", tag, children: children as TagArrayNode["children"] };
}

describe("coalesceTagValue — scalar conflict resolution", () => {
  const tagA = makeTag(1, "default");
  const tagB = makeTag(2, "default");
  const a = scalar(tagA);
  const b = scalar(tagB);

  it.each(MERGE_ORDERS)("merge-group picks incoming tag: %s", (order) => {
    const result = coalesceTagValue(a, b, order);
    expect(result.tag).toEqual(tagB);
  });

  it.each(JOIN_ORDERS)("join-group picks current tag: %s", (order) => {
    const result = coalesceTagValue(a, b, order);
    expect(result.tag).toEqual(tagA);
  });
});

describe("coalesceTagValue — dict node merging", () => {
  const tagA = makeTag(1, "default");
  const tagB = makeTag(2, "default");

  const a = dictNode(tagA, [scalarK(tagA, "x"), scalarK(tagA, "y")]);

  const b = dictNode(tagB, [scalarK(tagB, "x"), scalarK(tagB, "z")]);

  it.each(MERGE_ORDERS)("merge-group picks incoming dict tag: %s", (order) => {
    const result = coalesceTagValue(a, b, order);
    expect(result.kind).toBe("dict");
    expect(result.tag).toEqual(tagB);
  });

  it.each(JOIN_ORDERS)("join-group picks current dict tag: %s", (order) => {
    const result = coalesceTagValue(a, b, order);
    expect(result.kind).toBe("dict");
    expect(result.tag).toEqual(tagA);
  });

  it("merge resolves conflicting child keys", () => {
    const result = coalesceTagValue(a, b, "merge") as TagDictNode;
    const keys = result.children.map((c) => c.key);
    expect(keys.sort()).toEqual(["x", "y", "z"]);
  });
});

describe("coalesceTagValue — array node behavior", () => {
  const tagA = makeTag(1, "default");
  const tagB = makeTag(2, "default");

  const a = arrayNode(tagA, [scalar(tagA), scalar(tagA)]);
  const b = arrayNode(tagB, [scalar(tagB), scalar(tagB), scalar(tagB)]);

  it("merge replaces array and picks incoming tag", () => {
    const result = coalesceTagValue(a, b, "merge") as TagArrayNode;
    expect(result.kind).toBe("array");
    expect(result.tag).toEqual(tagB);
    expect(result.children).toHaveLength(3);
  });

  it("join keeps original array and tag", () => {
    const result = coalesceTagValue(a, b, "join") as TagArrayNode;
    expect(result.tag).toEqual(tagA);
    expect(result.children).toHaveLength(2);
  });

  it("adjoin concatenates children", () => {
    const result = coalesceTagValue(a, b, "adjoin") as TagArrayNode;
    expect(result.children).toHaveLength(5);
  });

  it("admerge concatenates children", () => {
    const result = coalesceTagValue(a, b, "admerge") as TagArrayNode;
    expect(result.children).toHaveLength(5);
  });

  it("zipmerge zips element-wise", () => {
    const result = coalesceTagValue(a, b, "zipmerge") as TagArrayNode;
    expect(result.children).toHaveLength(3);
    expect(result.children[0].tag).toEqual(tagB);
    expect(result.children[1].tag).toEqual(tagB);
  });

  it("zipjoin zips element-wise keeping current", () => {
    const result = coalesceTagValue(a, b, "zipjoin") as TagArrayNode;
    expect(result.children).toHaveLength(3);
    expect(result.children[0].tag).toEqual(tagA);
    expect(result.children[1].tag).toEqual(tagA);
  });
});

describe("coalesceTagDictNode", () => {
  const tagA = makeTag(1, "default");
  const tagB = makeTag(2, "debug");

  it("prefers current key when set", () => {
    const a: TagDictNode = { kind: "dict", tag: tagA, key: "root", children: [scalarK(tagA, "x")] };
    const b: TagDictNode = { kind: "dict", tag: tagB, children: [] };
    const result = coalesceTagDictNode(a, b, "join");
    expect(result.key).toBe("root");
  });

  it("falls back to incoming key when current is unset", () => {
    const a: TagDictNode = { kind: "dict", tag: tagA, children: [scalarK(tagA, "x")] };
    const b: TagDictNode = { kind: "dict", tag: tagB, key: "child", children: [] };
    const result = coalesceTagDictNode(a, b, "merge");
    expect(result.key).toBe("child");
  });
});

describe("coalesceTagProfiles", () => {
  const tagA = makeTag(1, "default");
  const tagB = makeTag(2, "default");

  it("merges profiles from both sides", () => {
    const current = {
      default: dictNode(tagA, [scalarK(tagA, "x")]),
      debug: dictNode(tagA, [scalarK(tagA, "y")]),
    };
    const incoming = {
      default: dictNode(tagB, [scalarK(tagB, "x"), scalarK(tagB, "z")]),
      release: dictNode(tagB, [scalarK(tagB, "w")]),
    };

    const result = coalesceTagProfiles(current, incoming, "merge");
    expect(Object.keys(result).sort()).toEqual(["debug", "default", "release"]);
  });

  it("preserves profiles only in current", () => {
    const current = {
      debug: dictNode(tagA, [scalarK(tagA, "y")]),
    };
    const incoming = {
      release: dictNode(tagB, [scalarK(tagB, "z")]),
    };

    const result = coalesceTagProfiles(current, incoming, "merge");
    expect(result.debug).toBeDefined();
    expect(result.release).toBeDefined();
  });
});
