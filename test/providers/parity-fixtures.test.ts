import { describe, expect, it } from "vitest";

import { Figment } from "../../src/figment.ts";
import { Env, Serialized, YamlExtended } from "../../src/providers/index.ts";
import { withEnv } from "../fixtures/env.ts";
import {
  envArrayFixture,
  serializedKeyedFixture,
  yamlExtendedCircleFixture,
} from "../fixtures/provider-parity.ts";

describe("provider parity fixtures", () => {
  it("YamlExtended matches merge-key circle fixture behavior", async () => {
    const fixture = yamlExtendedCircleFixture();
    const figment = Figment.new().merge(YamlExtended.string(fixture.source));

    expect(await figment.extract<typeof fixture.expected.circle1>({ path: "circle1" })).toEqual(
      fixture.expected.circle1,
    );
    expect(await figment.extract<typeof fixture.expected.circle2>({ path: "circle2" })).toEqual(
      fixture.expected.circle2,
    );
    expect(await figment.extract<typeof fixture.expected.circle3>({ path: "circle3" })).toEqual(
      fixture.expected.circle3,
    );
  });

  it("Env zipmerge array construction matches fixture behavior", async () => {
    const fixture = envArrayFixture();
    await withEnv(fixture.env, async () => {
      const figment = Figment.new().merge(Env.prefixed("APP_").split("_"));
      expect(await figment.extract<Array<number>>({ path: fixture.path })).toEqual(
        fixture.expected,
      );
    });
  });

  it("Serialized keyed/unkeyed merge matches fixture behavior", async () => {
    const fixture = serializedKeyedFixture();
    const figment = Figment.new()
      .merge(Serialized.defaults(fixture.defaults))
      .merge(Serialized.default(fixture.keyedPath, fixture.keyedValue));

    expect(await figment.build<typeof fixture.expected>()).toEqual(fixture.expected);
  });
});
