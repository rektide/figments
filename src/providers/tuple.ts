import { metadataFromInline } from "../core/metadata.ts";
import type { Metadata } from "../core/metadata.ts";
import { GLOBAL_PROFILE } from "../profile.ts";
import type { Provider } from "../provider.ts";
import type { ProfileMap } from "../core/types.ts";
import { Serialized } from "./serialized.ts";

export type TupleEntry = readonly [key: string, value: unknown];

export class Tuple implements Provider {
  public constructor(private readonly entry: TupleEntry) {}

  public static from(entry: TupleEntry): Tuple {
    return new Tuple(entry);
  }

  public selectedProfile(): string {
    return GLOBAL_PROFILE;
  }

  public metadata(): Metadata {
    return metadataFromInline("Tuple", `tuple provider for ${this.entry[0]}`);
  }

  public data(): ProfileMap {
    return Serialized.global(this.entry[0], this.entry[1]).data();
  }
}

export function isTupleEntry(value: unknown): value is TupleEntry {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === "string";
}
