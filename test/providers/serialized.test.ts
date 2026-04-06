import { describe, expect, it } from "vitest";

import { FigmentError } from "../../src/core/error.ts";
import { Serialized } from "../../src/providers/serialized.ts";

describe("Serialized.defaults / globals", () => {
  it("binds to default profile", () => {
    const s = Serialized.defaults({ host: "localhost" });
    expect(s.selectedProfile()).toBe("default");
    expect(s.data()).toEqual({ default: { host: "localhost" } });
  });

  it("binds to global profile", () => {
    const s = Serialized.globals({ fallback: true });
    expect(s.selectedProfile()).toBe("global");
    expect(s.data()).toEqual({ global: { fallback: true } });
  });
});

describe("Serialized.default / global (keyed)", () => {
  it("nests keyed value into dict", () => {
    const s = Serialized.default("app.host", "example.com");
    expect(s.selectedProfile()).toBe("default");
    expect(s.data()).toEqual({ default: { app: { host: "example.com" } } });
  });

  it("nests global keyed value", () => {
    const s = Serialized.global("app.fallback", true);
    expect(s.data()).toEqual({ global: { app: { fallback: true } } });
  });
});

describe("Serialized.from", () => {
  it("binds to explicit profile", () => {
    const s = Serialized.from({ mode: "debug" }, "debug");
    expect(s.selectedProfile()).toBe("debug");
    expect(s.data()).toEqual({ debug: { mode: "debug" } });
  });
});

describe("profile", () => {
  it("reassigns profile immutably", () => {
    const s = Serialized.default("name", "demo");
    const debug = s.profile("debug");
    expect(s.selectedProfile()).toBe("default");
    expect(debug.selectedProfile()).toBe("debug");
  });
});

describe("key", () => {
  it("binds key path", () => {
    const s = Serialized.defaults({ host: "base" }).key("server");
    expect(s.data()).toEqual({ default: { server: { host: "base" } } });
  });
});

describe("data", () => {
  it("throws on unkeyed non-dict value", () => {
    const s = new Serialized("scalar");
    expect(() => s.data()).toThrow("must serialize to a dictionary");
  });

  it("throws on unsupported undefined leaf values", () => {
    const s = Serialized.defaults({ present: "ok", missing: undefined });
    try {
      s.data();
      expect.unreachable("expected data() to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(FigmentError);
      if (!(error instanceof FigmentError)) {
        throw error;
      }

      const figmentError = error;
      expect(figmentError.kind).toBe("Unsupported");
      expect(figmentError.actual).toBe("undefined");
      expect(figmentError.path).toEqual(["missing"]);
    }
  });
});

describe("metadata", () => {
  it("includes key path in descriptor when present", () => {
    const keyed = Serialized.default("app.host", "x");
    expect(keyed.metadata().source?.kind).toBe("inline");
    const keyedSource = keyed.metadata().source;
    if (keyedSource?.kind === "inline") {
      expect(keyedSource.descriptor).toContain("app.host");
    }

    const unkeyed = Serialized.defaults({ x: 1 });
    const unkeyedSource = unkeyed.metadata().source;
    if (unkeyedSource?.kind === "inline") {
      expect(unkeyedSource.descriptor).toContain("serialized value");
    }
  });
});
