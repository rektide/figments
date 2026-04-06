import { describe, expect, it } from "vitest";

import { Figment } from "../../src/figment.ts";
import { Serialized } from "../../src/providers/serialized.ts";
import { FIGMENTS_STATE } from "../../src/state.ts";

describe("state exposure", () => {
  it("state returns live mutable figment internals", async () => {
    const figment = Figment.new().merge(Serialized.default("name", "base"));

    const state = figment.state();
    await state.pending;
    expect(state.pending).toBeInstanceOf(Promise);

    const latest = figment.state();
    expect(latest.activeProfiles).toEqual([]);
    expect(latest.providerProfileSelectionMode).toBe("seedWhenEmpty");
    expect(latest.metadataByTag.size).toBeGreaterThan(0);

    latest.activeProfiles.push("debug");
    expect(figment.selectedProfiles()).toEqual(["debug"]);

    const defaults = latest.values.default;
    expect(defaults).toBeDefined();
    if (defaults) {
      defaults.name = "mutated";
    }

    expect(await figment.extract<string>({ path: "name" })).toBe("mutated");

    const symbolState = figment[FIGMENTS_STATE]();
    expect(symbolState.values).toBe(latest.values);
    expect(symbolState.metadataByTag).toBe(latest.metadataByTag);
  });
});
