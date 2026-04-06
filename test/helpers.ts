import type { Figment } from "../src/figment.ts";
import { metadataNamed } from "../src/core/metadata.ts";
import type { Provider } from "../src/provider.ts";
import { makeTag, type ProfileTagMap } from "../src/core/tag.ts";
import type { ConfigDict } from "../src/core/types.ts";

export class NamedProvider implements Provider {
  readonly providerName: string;
  readonly payload: ConfigDict;

  public constructor(providerName: string, payload: ConfigDict) {
    this.providerName = providerName;
    this.payload = payload;
  }

  public metadata() {
    return metadataNamed(this.providerName);
  }

  public data() {
    return { default: this.payload };
  }
}

export class ProfileNamedProvider implements Provider {
  readonly providerName: string;
  readonly profileName: string;
  readonly payload: ConfigDict;

  public constructor(providerName: string, profileName: string, payload: ConfigDict) {
    this.providerName = providerName;
    this.profileName = profileName;
    this.payload = payload;
  }

  public metadata() {
    return metadataNamed(this.providerName);
  }

  public data() {
    return { [this.profileName]: this.payload };
  }
}

export class TaggedEntryProvider implements Provider {
  public metadata() {
    return metadataNamed("TaggedEntryProvider");
  }

  public data() {
    return {
      default: {
        alpha: "from-alpha",
        beta: "from-beta",
      },
    };
  }

  public metadataMap() {
    return new Map<number, ReturnType<typeof metadataNamed>>([
      [41, metadataNamed("AlphaSource")],
      [42, metadataNamed("BetaSource")],
    ]);
  }

  public tagMap(): ProfileTagMap {
    return {
      default: {
        kind: "dict",
        tag: makeTag(41, "default"),
        children: [
          { kind: "scalar", key: "alpha", tag: makeTag(41, "default") },
          { kind: "scalar", key: "beta", tag: makeTag(42, "default") },
        ],
      },
    };
  }
}

export async function winnerMetadataName(
  figment: Figment,
  path: string,
): Promise<string | undefined> {
  return (await figment.explain({ path, includeMetadata: "winner" })).metadata?.name;
}

export async function allMetadataNames(figment: Figment, path: string): Promise<string[]> {
  return ((await figment.explain({ path, includeMetadata: "all" })).metadataAll ?? []).map(
    (metadata) => metadata.name,
  );
}
