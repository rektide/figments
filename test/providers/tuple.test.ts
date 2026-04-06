import { describe, expect, it } from "vitest";

import { Figment } from "../../src/figment.ts";
import { Serialized } from "../../src/providers/serialized.ts";
import { Tuple, isTupleEntry } from "../../src/providers/tuple.ts";

describe("Tuple provider", () => {
  it("builds global profile data from a key/value tuple", () => {
    const provider = Tuple.from(["app.port", 8080]);

    expect(provider.selectedProfile()).toBe("global");
    expect(provider.data()).toEqual({
      global: {
        app: {
          port: 8080,
        },
      },
    });
  });

  it("provides tuple metadata with inline source descriptor", () => {
    const metadata = Tuple.from(["app.host", "example.com"]).metadata();
    expect(metadata.name).toBe("Tuple");
    expect(metadata.source).toEqual({
      kind: "inline",
      descriptor: "tuple provider for app.host",
    });
  });
});

describe("isTupleEntry", () => {
  it("accepts [string, value] tuples", () => {
    expect(isTupleEntry(["app.host", "example.com"])).toBe(true);
    expect(isTupleEntry(["app.port", 8080])).toBe(true);
  });

  it("rejects invalid tuple shapes", () => {
    expect(isTupleEntry("app.host")).toBe(false);
    expect(isTupleEntry(["app.host"])).toBe(false);
    expect(isTupleEntry([10, "value"])).toBe(false);
    expect(isTupleEntry(["app.host", "value", "extra"])).toBe(false);
  });
});

describe("Figment tuple providable", () => {
  it("accepts tuple entries directly in composition methods", async () => {
    const figment = Figment.new()
      .join(Serialized.default("app.port", 3000))
      .join(["app.port", 8080] as const)
      .merge(["app.host", "tuple.example"] as const);

    expect(figment.selectedProfiles()).toEqual([]);
    expect(await figment.extract<number>({ path: "app.port" })).toBe(8080);
    expect(await figment.extract<string>({ path: "app.host" })).toBe("tuple.example");
  });
});
