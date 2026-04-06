import { describe, expect, it } from "vitest";

import { Figment } from "../../src/figment.ts";
import { Serialized } from "../../src/providers/serialized.ts";
import { Either, decodeEither, type Either as EitherValue } from "../../src/value/either.ts";
import { createTaggedPortProvider } from "../fixtures/tagged.ts";

describe("decodeEither", () => {
  it("returns Left when the left decoder succeeds", async () => {
    const figment = Figment.new().merge(Serialized.default("port", 9090));
    const decoder = decodeEither(
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

    const result = await figment.extract<EitherValue<number, number>>({
      path: "port",
      deser: decoder,
    });
    expect(Either.isLeft(result)).toBe(true);
    expect(result).toEqual({ kind: "left", value: 9090 });
  });

  it("returns Right when the left decoder fails and right succeeds", async () => {
    const figment = Figment.new().merge(Serialized.default("port", "8080"));
    const decoder = decodeEither(
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

        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed)) {
          throw new Error("not an int string");
        }

        return parsed;
      },
    );

    const result = await figment.extract<EitherValue<number, number>>({
      path: "port",
      deser: decoder,
    });
    expect(Either.isRight(result)).toBe(true);
    expect(result).toEqual({ kind: "right", value: 8080 });
  });

  it("includes both branch errors when both decoders fail", async () => {
    const figment = Figment.new().merge(Serialized.default("port", true));
    const decoder = decodeEither(
      () => {
        throw new Error("left-failure");
      },
      () => {
        throw new Error("right-failure");
      },
    );

    await expect(figment.extract({ path: "port", deser: decoder })).rejects.toThrow(
      "failed to decode either: left=left-failure; right=right-failure",
    );
  });

  it("forwards decode context to whichever branch runs", async () => {
    const figment = Figment.new().merge(createTaggedPortProvider());
    const decoder = decodeEither(
      (_value, context) => {
        expect(context?.metadata?.name).toBe("PortSource");
        throw new Error("force right branch");
      },
      (value, context) => {
        expect(context?.path).toBe("app.port");
        expect(context?.metadata?.name).toBe("PortSource");
        if (typeof value !== "string") {
          throw new Error("not a string");
        }

        return Number.parseInt(value, 10);
      },
    );

    const result = await figment.extract<EitherValue<number, number>>({
      path: "app.port",
      deser: decoder,
    });
    expect(result).toEqual({ kind: "right", value: 8080 });
  });
});
