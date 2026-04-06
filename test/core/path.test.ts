import { describe, expect, it } from "vitest";

import { findTag, findValue, nest } from "../../src/core/path.ts";
import {
  buildTagTree,
  isTagArrayNode,
  isTagDictNode,
  makeTag,
  type TagDictNode,
} from "../../src/core/tag.ts";
import type { ConfigDict } from "../../src/core/types.ts";

describe("nest", () => {
  it("builds nested dicts from dotted paths", () => {
    expect(nest("a.b.c", 42)).toEqual({ a: { b: { c: 42 } } });
  });

  it("ignores empty segments and trims whitespace", () => {
    expect(nest("  app . . server . host  ", "localhost")).toEqual({
      app: { server: { host: "localhost" } },
    });
  });

  it("creates arrays for numeric path segments", () => {
    const out = nest("servers.1.host", "api.local");
    const servers = out.servers;
    if (!Array.isArray(servers)) {
      throw new Error("expected servers to be array");
    }

    expect(servers).toHaveLength(2);
    expect(0 in servers).toBe(false);
    expect(servers[1]).toEqual({ host: "api.local" });
  });

  it("returns empty dict for empty paths", () => {
    expect(nest("", true)).toEqual({});
    expect(nest("....", true)).toEqual({});
  });

  it("returns empty dict when root segment is numeric", () => {
    expect(nest("0.host", "x")).toEqual({});
  });
});

describe("findValue", () => {
  const config: ConfigDict = {
    app: {
      name: "figments",
      servers: [
        { host: "a.local", ports: [80, 443] },
        { host: "b.local", ports: [8080] },
      ],
    },
    feature: {
      enabled: true,
    },
  };

  it("returns root dict for empty path", () => {
    expect(findValue(config, "")).toBe(config);
  });

  it("resolves dotted dict paths", () => {
    expect(findValue(config, "app.name")).toBe("figments");
    expect(findValue(config, "feature.enabled")).toBe(true);
  });

  it("resolves numeric array segments", () => {
    expect(findValue(config, "app.servers.1.host")).toBe("b.local");
    expect(findValue(config, "app.servers.0.ports.1")).toBe(443);
  });

  it("ignores empty path segments", () => {
    expect(findValue(config, "app..servers...0..host")).toBe("a.local");
  });

  it("returns undefined for missing keys and invalid traversals", () => {
    expect(findValue(config, "app.missing")).toBeUndefined();
    expect(findValue(config, "app.servers.nope.host")).toBeUndefined();
    expect(findValue(config, "app.name.value")).toBeUndefined();
    expect(findValue(config, "app.servers.9.host")).toBeUndefined();
  });
});

describe("findTag", () => {
  function makeRootTagTree(): TagDictNode {
    const root = buildTagTree(
      {
        app: {
          servers: [{ host: "a.local", ports: [80, 443] }],
        },
        feature: {
          enabled: true,
        },
      },
      makeTag(90, "default"),
    );

    if (!isTagDictNode(root)) {
      throw new Error("expected root tag tree to be dict");
    }

    return root;
  }

  it("returns root dict for empty path", () => {
    const root = makeRootTagTree();
    expect(findTag(root, "")).toBe(root);
  });

  it("traverses dict and array paths", () => {
    const root = makeRootTagTree();
    const servers = findTag(root, "app.servers");
    expect(servers?.kind).toBe("array");

    const host = findTag(root, "app.servers.0.host");
    expect(host?.kind).toBe("scalar");

    const ports = findTag(root, "app.servers.0.ports");
    expect(ports?.kind).toBe("array");
    if (!ports || !isTagArrayNode(ports)) {
      throw new Error("expected ports to be a tag array node");
    }

    expect(ports.children[0]?.kind).toBe("scalar");
    expect(ports.children[1]?.kind).toBe("scalar");
  });

  it("ignores empty path segments", () => {
    const root = makeRootTagTree();
    expect(findTag(root, "app..servers...0..host")?.kind).toBe("scalar");
  });

  it("returns undefined for invalid or missing paths", () => {
    const root = makeRootTagTree();
    expect(findTag(root, "app.unknown")).toBeUndefined();
    expect(findTag(root, "app.servers.nope.host")).toBeUndefined();
    expect(findTag(root, "app.servers.8.host")).toBeUndefined();
    expect(findTag(root, "app.servers.0.host.deep")).toBeUndefined();
  });
});
