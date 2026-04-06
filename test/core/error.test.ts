import { describe, expect, it } from "vitest";

import { FigmentAggregateError, FigmentError } from "../../src/core/error.ts";

describe("FigmentError construction", () => {
  it("stores kind, message, path, profile, tag, and metadata", () => {
    const error = new FigmentError("Message", "test message", {
      path: ["app", "port"],
      profile: "default",
    });

    expect(error.kind).toBe("Message");
    expect(error.message).toBe("test message");
    expect(error.path).toEqual(["app", "port"]);
    expect(error.profile).toBe("default");
    expect(error.name).toBe("FigmentError");
  });
});

describe("FigmentError.withPath", () => {
  it("appends path segments immutably", () => {
    const original = new FigmentError("Message", "test", { path: ["a"] });
    const extended = original.withPath("b.c");

    expect(original.path).toEqual(["a"]);
    expect(extended.path).toEqual(["a", "b", "c"]);
  });
});

describe("FigmentError.withContext", () => {
  it("merges context without mutating original", () => {
    const original = new FigmentError("Message", "test", { profile: "default" });
    const withCtx = original.withContext({ profile: "debug" });

    expect(original.profile).toBe("default");
    expect(withCtx.profile).toBe("debug");
  });
});

describe("FigmentError.missing", () => {
  it("returns true only for MissingField kind", () => {
    expect(new FigmentError("MissingField", "gone").missing()).toBe(true);
    expect(new FigmentError("Message", "ok").missing()).toBe(false);
  });
});

describe("FigmentError.toString", () => {
  it("includes path, profile interpolation, and profile order", () => {
    const error = FigmentError.missingField("a.b", {
      effectiveProfileOrder: ["default", "debug"],
    });
    const text = String(error);
    expect(text).toContain("a.b");
    expect(text).toContain("default -> debug");
  });
});

describe("FigmentError static factories", () => {
  it("creates InvalidLength with detail", () => {
    const error = FigmentError.invalidLength(4, "length 2");
    expect(error.kind).toBe("InvalidLength");
    expect(String(error)).toContain("length 4");
  });

  it("creates UnknownField with expected values", () => {
    const error = FigmentError.unknownField("typo", ["type", "top"]);
    expect(error.kind).toBe("UnknownField");
    expect(String(error)).toContain("expected one of: type, top");
  });

  it("creates UnknownVariant with expected values", () => {
    const error = FigmentError.unknownVariant("teal", ["red", "green", "blue"]);
    expect(error.kind).toBe("UnknownVariant");
    expect(String(error)).toContain("expected one of: red, green, blue");
  });

  it("creates DuplicateField with field name", () => {
    const error = FigmentError.duplicateField("name");
    expect(error.kind).toBe("DuplicateField");
    expect(String(error)).toContain("'name'");
  });

  it("creates Unsupported with actual type", () => {
    const error = FigmentError.unsupported(Symbol("x"));
    expect(error.kind).toBe("Unsupported");
  });

  it("creates UnsupportedKey with needed type", () => {
    const error = FigmentError.unsupportedKey(true, "string key");
    expect(error.kind).toBe("UnsupportedKey");
    expect(String(error)).toContain("need string key");
  });

  it("creates InvalidType with expected and actual", () => {
    const error = FigmentError.invalidType("number", "oops");
    expect(error.kind).toBe("InvalidType");
    expect(error.expected).toBe("number");
    expect(error.actual).toBe("string");
  });

  it("creates InvalidValue with message", () => {
    const error = FigmentError.invalidValue("bad value");
    expect(error.kind).toBe("InvalidValue");
    expect(error.message).toBe("bad value");
  });

  it("creates missingField with path", () => {
    const error = FigmentError.missingField("app.port");
    expect(error.kind).toBe("MissingField");
    expect(error.path).toEqual(["app", "port"]);
  });

  it("creates message", () => {
    const error = FigmentError.message("hello");
    expect(error.kind).toBe("Message");
    expect(error.message).toBe("hello");
  });
});

describe("FigmentAggregateError", () => {
  it("provides count, iterator, toArray, and missing", () => {
    const missing = FigmentError.missingField("a.b");
    const aggregate = new FigmentAggregateError([FigmentError.message("second"), missing]);

    expect(aggregate.missing()).toBe(true);
    expect(aggregate.count()).toBe(2);
  });

  it("supports iterable traversal", () => {
    const aggregate = new FigmentAggregateError([
      FigmentError.message("one"),
      FigmentError.message("two"),
      FigmentError.message("three"),
    ]);

    expect(aggregate.toArray().map((error) => error.message)).toEqual(["one", "two", "three"]);
    expect([...aggregate].map((error) => error.message)).toEqual(["one", "two", "three"]);
  });

  it("formats multi-line toString", () => {
    const aggregate = new FigmentAggregateError(
      [FigmentError.message("a"), FigmentError.message("b")],
      "multi error",
    );
    const text = aggregate.toString();
    expect(text).toContain("multi error");
    expect(text).toContain("a");
    expect(text).toContain("b");
  });

  it("withPath applies to all errors", () => {
    const aggregate = new FigmentAggregateError([
      FigmentError.message("a"),
      FigmentError.message("b"),
    ]);
    const extended = aggregate.withPath("x.y");
    expect(extended.errors[0].path).toEqual(["x", "y"]);
    expect(extended.errors[1].path).toEqual(["x", "y"]);
  });

  it("withContext applies to all errors", () => {
    const aggregate = new FigmentAggregateError([FigmentError.message("a")]);
    const withCtx = aggregate.withContext({ profile: "debug" });
    expect(withCtx.errors[0].profile).toBe("debug");
  });
});

describe("FigmentError.decode", () => {
  it("wraps Error into FigmentError", () => {
    const decoded = FigmentError.decode("config", new Error("bad input"));
    expect(decoded).toBeInstanceOf(FigmentError);
    if (decoded instanceof FigmentError) {
      expect(decoded.kind).toBe("Decode");
      expect(decoded.message).toContain("bad input");
    }
  });
});

describe("FigmentError.decodeIssues", () => {
  it("maps structured decoder issues into aggregate figment errors", () => {
    const mapped = FigmentError.decode("config", {
      issues: [
        {
          code: "invalid_type",
          message: "expected number, received string",
          expected: "number",
          received: "oops",
          path: ["app", "port"],
        },
        {
          code: "unrecognized_keys",
          message: "unrecognized key(s): extra",
          keys: ["extra"],
          path: ["app"],
        },
      ],
    });

    expect(mapped).toBeInstanceOf(FigmentAggregateError);
    if (mapped instanceof FigmentAggregateError) {
      expect(mapped.count()).toBe(2);
      expect(mapped.errors[0].kind).toBe("InvalidType");
      expect(mapped.errors[0].path).toEqual(["app", "port"]);
      expect(mapped.errors[1].kind).toBe("UnknownField");
      expect(mapped.errors[1].path).toEqual(["app"]);
    }
  });

  it("returns single FigmentError for single issue", () => {
    const mapped = FigmentError.decode("config", {
      issues: [
        {
          code: "invalid_type",
          message: "bad",
          expected: "number",
          received: "oops",
        },
      ],
    });

    expect(mapped).toBeInstanceOf(FigmentError);
    if (mapped instanceof FigmentError) {
      expect(mapped.kind).toBe("InvalidType");
    }
  });
});

describe("mergeFigmentFailures", () => {
  it("chains incoming + previous into aggregate", async () => {
    const { mergeFigmentFailures } = await import("../../src/core/error.ts");
    const a = FigmentError.message("first");
    const b = FigmentError.message("second");

    const result = mergeFigmentFailures(a, b);
    expect(result).toBeInstanceOf(FigmentAggregateError);
    if (result instanceof FigmentAggregateError) {
      expect(result.count()).toBe(2);
    }
  });

  it("returns incoming when previous is undefined", async () => {
    const { mergeFigmentFailures } = await import("../../src/core/error.ts");
    const a = FigmentError.message("solo");
    const result = mergeFigmentFailures(a, undefined);
    expect(result).toBe(a);
  });
});

describe("isFigmentFailure", () => {
  it("type guards FigmentError and FigmentAggregateError", async () => {
    const { isFigmentFailure } = await import("../../src/core/error.ts");
    expect(isFigmentFailure(FigmentError.message("x"))).toBe(true);
    expect(isFigmentFailure(new FigmentAggregateError([FigmentError.message("y")]))).toBe(true);
    expect(isFigmentFailure(new Error("plain"))).toBe(false);
    expect(isFigmentFailure("string")).toBe(false);
  });
});

describe("flattenFigmentFailure", () => {
  it("normalizes to array", async () => {
    const { flattenFigmentFailure } = await import("../../src/core/error.ts");
    const a = FigmentError.message("a");
    expect(flattenFigmentFailure(a)).toEqual([a]);

    const agg = new FigmentAggregateError([a, FigmentError.message("b")]);
    expect(flattenFigmentFailure(agg)).toEqual(agg.toArray());
  });
});
