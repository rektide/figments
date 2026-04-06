// TODO: direct unit tests for src/core/coalesce.ts
//
// Planned test cases (mirroring figment2/src/coalesce.rs):
// - coalesceValues — scalar conflict resolution across all 6 orders
// - coalesceDicts — nested dict merging with overlapping + disjoint keys
// - coalesceArrays — array behavior: replace (join/merge), concat (adjoin/admerge), zip (zipjoin/zipmerge)
// - coalesceArraysWithEmptySlots — zip behavior with sparse/undefined positions
// - coalesceTagValues — tag tree coalescing mirrors value coalescing for each order
// - coalesceTagDictNodes — nested tag dict coalescing preserves tag lineage
// - profileCoalesce — profile-level scalar preference (current vs incoming)

import { describe, it } from "vitest";

describe("coalesce (TODO)", () => {
  it.todo("placeholder for coalesce unit tests");
});
