import type { Metadata } from "./core/metadata.ts";
import type { ProfileTagMap, Tag } from "./core/tag.ts";
import type { ProfileMap } from "./core/types.ts";

export interface Provider {
  metadata(): Metadata;
  data(): ProfileMap | Promise<ProfileMap>;
  selectedProfile?(): string | undefined;
  metadataMap?(): Map<Tag, Metadata>;
  tagMap?(): ProfileTagMap;
}
