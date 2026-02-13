import type { Metadata } from "./core/metadata.ts";
import type { ProfileTagMap } from "./core/tag.ts";
import type { ProfileMap } from "./core/types.ts";

export interface Provider {
  metadata(): Metadata;
  data(): ProfileMap | Promise<ProfileMap>;
  selectedProfile?(): string | undefined;
  metadataMap?(): Map<number, Metadata>;
  tagMap?(): ProfileTagMap;
}
