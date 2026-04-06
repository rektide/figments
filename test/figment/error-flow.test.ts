import { describe, expect, it } from "vitest";

import { FigmentAggregateError, FigmentError } from "../../src/core/error.ts";
import { Figment } from "../../src/figment.ts";
import { ThrowingAggregateProvider, ThrowingMessageProvider } from "../fixtures/error-providers.ts";
import { createTaggedPortProvider } from "../fixtures/tagged.ts";

describe("figment error flow", () => {
  it("wraps provider load errors with metadata and profile context", async () => {
    const figment = Figment.new().merge(new ThrowingMessageProvider());

    try {
      await figment.build();
      throw new Error("expected build to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(FigmentError);
      const failure = error as FigmentError;
      expect(failure.message).toBe("load exploded");
      expect(failure.metadata?.name).toBe("FixtureFileProvider");
      expect(failure.metadata?.source).toEqual({ kind: "file", path: "Missing.toml" });
      expect(failure.tag).toBeDefined();
      expect(failure.profile).toBe("default");
      expect(failure.effectiveProfileOrder).toEqual(["default", "global"]);
      expect(String(failure)).toContain("FixtureFileProvider");
      expect(String(failure)).toContain("Missing.toml");
    }
  });

  it("preserves order and attaches context for provider aggregate failures", async () => {
    const figment = Figment.new().merge(new ThrowingAggregateProvider());

    try {
      await figment.build();
      throw new Error("expected build to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(FigmentAggregateError);
      const aggregate = error as FigmentAggregateError;
      expect(aggregate.count()).toBe(2);
      expect(aggregate.errors.map((item) => item.message)).toEqual([
        "provider-first",
        "provider-second",
      ]);
      expect(aggregate.errors.every((item) => item.metadata?.name === "AggregateProvider")).toBe(
        true,
      );
      expect(aggregate.errors.every((item) => item.profile === "default")).toBe(true);
    }
  });

  it("applies decode path and metadata context to each aggregate decode issue", async () => {
    const figment = Figment.new().merge(createTaggedPortProvider());

    const thrown = await figment
      .extract({
        path: "app.port",
        deser() {
          throw new FigmentAggregateError(
            [FigmentError.invalidType("number", "oops"), FigmentError.message("decoder boom")],
            "decode aggregate",
          );
        },
      })
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(FigmentAggregateError);
    const aggregate = thrown as FigmentAggregateError;
    expect(aggregate.count()).toBe(2);
    expect(aggregate.errors.map((item) => item.path.join("."))).toEqual(["app.port", "app.port"]);
    expect(aggregate.errors.map((item) => item.metadata?.name)).toEqual([
      "PortSource",
      "PortSource",
    ]);
    expect(aggregate.toString()).toContain("decode aggregate");
    expect(aggregate.toString()).toContain("provider key 'default.app.port'");
  });
});
