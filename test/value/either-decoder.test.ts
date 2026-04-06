import { describe, expect, it } from "vitest";

import { Figment } from "../../src/figment.ts";
import { Serialized } from "../../src/providers/serialized.ts";
import { eitherDecoder } from "../../src/value/either-decoder.ts";

describe("eitherDecoder", () => {
  it("falls back to the secondary decoder when primary fails", async () => {
    const figment = Figment.new().merge(Serialized.default("port", "8080"));

    const decoder = eitherDecoder(
      (value: unknown) => {
        if (typeof value === "number") {
          return value;
        }

        throw new Error("not a number");
      },
      (value: unknown) => {
        if (typeof value !== "string") {
          throw new Error("not a string");
        }

        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed)) {
          throw new Error("not an int string");
        }

        return parsed;
      },
    );

    expect(await figment.extract<number>({ path: "port", deser: decoder })).toBe(8080);
  });

  it("returns the primary decoder result when it succeeds", async () => {
    const figment = Figment.new().merge(Serialized.default("port", 9090));
    const decoder = eitherDecoder(
      (value: unknown) => {
        if (typeof value !== "number") {
          throw new Error("not a number");
        }

        return value;
      },
      (value: unknown) => {
        if (typeof value !== "string") {
          throw new Error("not a string");
        }

        return Number.parseInt(value, 10);
      },
    );

    expect(await figment.extract<number>({ path: "port", deser: decoder })).toBe(9090);
  });

  it("throws when both decoders fail", async () => {
    const figment = Figment.new().merge(Serialized.default("port", true));
    const decoder = eitherDecoder(
      () => {
        throw new Error("first failure");
      },
      () => {
        throw new Error("second failure");
      },
    );

    await expect(figment.extract({ path: "port", deser: decoder })).rejects.toThrow(
      "second failure",
    );
  });
});
