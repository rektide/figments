import { describe, expect, it } from "vitest";

import { Figment, type DecodeContext } from "../../src/figment.ts";
import { Serialized } from "../../src/providers/serialized.ts";
import { createTaggedAppTokenProvider, createTaggedPortProvider } from "../fixtures/tagged.ts";

describe("decoder context", () => {
  it("provides path, winner metadata, and tag to extract deserializers", async () => {
    const figment = Figment.new().merge(createTaggedAppTokenProvider());

    const captured: Array<DecodeContext | undefined> = [];
    const value = await figment.extract<string>({
      path: "app.token",
      deser(raw, context) {
        captured.push(context);
        if (typeof raw !== "string") {
          throw new Error("expected token string");
        }

        return raw;
      },
    });

    expect(value).toBe("secret");
    expect(captured).toHaveLength(1);

    const context = captured[0];
    expect(context?.path).toBe("app.token");
    expect(context?.profile).toBe("default");
    expect(context?.selectedProfiles).toEqual([]);
    expect(context?.effectiveProfileOrder).toEqual(["default", "global"]);
    expect(context?.metadata?.name).toBe("TokenSource");
    expect(context?.tag).toBeDefined();
    expect(context?.metadataAll.map((metadata) => metadata.name)).toEqual(["TokenSource"]);
  });

  it("provides root-level metadataAll to build deserializers on demand", async () => {
    const figment = Figment.new()
      .merge(createTaggedAppTokenProvider())
      .merge(createTaggedPortProvider({ name: "PortProvider" }));

    const names = await figment.build<string[]>({
      deser(_raw, context) {
        return context ? context.metadataAll.map((metadata) => metadata.name) : [];
      },
    });

    expect(names).toEqual(["PortProvider", "TaggedApp", "TokenSource", "PortSource"]);
  });

  it("supports missing-policy decode with context for explain", async () => {
    const figment = Figment.new().merge(Serialized.defaults({ app: { host: "localhost" } }));

    const explained = await figment.explain<string>({
      path: "app.token",
      missing: "undefined",
      deser(value, context) {
        expect(value).toBeUndefined();
        expect(context?.path).toBe("app.token");
        expect(context?.tag).toBeUndefined();
        expect(context?.metadata).toBeUndefined();
        expect(context?.metadataAll).toEqual([]);
        return "decoded-missing";
      },
    });

    expect(explained.value).toBe("decoded-missing");
    expect(explained.exists).toBe(false);
  });
});
