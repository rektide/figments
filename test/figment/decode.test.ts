import { describe, expect, it } from "vitest";

import { Figment } from "../../src/figment.ts";
import { FigmentError } from "../../src/core/error.ts";
import { Serialized } from "../../src/providers/serialized.ts";

describe("decoder behavior", () => {
  it("extract supports parse-style deserializers", async () => {
    const figment = Figment.new().merge(Serialized.defaults({ port: "8080" }));
    const config = await figment.build({
      deser: {
        parse(value) {
          const raw = value.port;
          if (typeof raw !== "string") {
            throw new Error("port must be a string");
          }

          const parsed = Number.parseInt(raw, 10);
          if (Number.isNaN(parsed)) {
            throw new Error("port must be an integer string");
          }

          return { port: parsed };
        },
      },
    });

    expect(config).toEqual({ port: 8080 });
  });

  it("extract decodes path values", async () => {
    const figment = Figment.new().merge(Serialized.default("count", "42"));
    const count = await figment.extract({
      path: "count",
      deser: (value) => {
        if (typeof value !== "string") {
          throw new Error("count must be a string");
        }

        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed)) {
          throw new Error("count must be an integer string");
        }

        return parsed;
      },
    });

    expect(count).toBe(42);
  });

  it("extract runs deserializer for missing='undefined' values", async () => {
    const figment = Figment.new().merge(Serialized.defaults({ present: true }));
    const decoded = await figment.extract({
      path: "missing",
      missing: "undefined",
      deser: (value) => {
        if (value !== undefined) {
          throw new Error("expected undefined");
        }

        return "handled-missing";
      },
    });

    expect(decoded).toBe("handled-missing");
  });

  it("wraps decoder failures as FigmentError", async () => {
    const figment = Figment.new().merge(Serialized.defaults({ port: "not-a-number" }));

    await expect(
      figment.build({
        deser: {
          parse(value) {
            const raw = value.port;
            if (typeof raw !== "string") {
              throw new Error("port must be a string");
            }

            const parsed = Number.parseInt(raw, 10);
            if (Number.isNaN(parsed)) {
              throw new Error("port must be an integer string");
            }

            return { port: parsed };
          },
        },
      }),
    ).rejects.toThrow("failed to decode config: port must be an integer string");
  });

  it("preserves structured decoder errors with typed mismatch details", async () => {
    const figment = Figment.new().merge(Serialized.default("count", "42"));

    await expect(
      figment.extract({
        path: "count",
        deser: (value) => {
          if (typeof value !== "number") {
            throw FigmentError.invalidType("number", value);
          }

          return value;
        },
      }),
    ).rejects.toMatchObject({
      kind: "InvalidType",
      expected: "number",
      actual: "string",
      path: ["count"],
      profile: "default",
    });
  });

  it("includes provider interpolation in decoder errors", async () => {
    expect.assertions(1);
    const figment = Figment.new().merge(Serialized.default("app.count", "oops"));

    try {
      await figment.extract({
        path: "app.count",
        deser: (value) => {
          if (typeof value !== "number") {
            throw FigmentError.invalidType("number", value);
          }

          return value;
        },
      });
    } catch (error) {
      expect(String(error)).toContain("provider key 'default.app.count'");
    }
  });
});
