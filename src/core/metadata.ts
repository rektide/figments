import { isAbsolute, normalize, relative, sep } from "node:path";

export type MetadataSource =
  | { kind: "file"; path: string }
  | { kind: "env"; selector: string }
  | { kind: "inline"; descriptor: string }
  | { kind: "code"; location: string }
  | { kind: "custom"; value: string };

export const SourceKind = {
  File: "file",
  Env: "env",
  Inline: "inline",
  Code: "code",
  Custom: "custom",
} as const;

export interface Metadata {
  name: string;
  source?: MetadataSource;
  provideLocation?: string;
  interpolate: (profile: string, keys: string[]) => string;
}

export type MetadataInterpolater = (profile: string, keys: string[]) => string;

export class MetadataBuilder {
  readonly name: string;
  sourceValue?: MetadataSource;
  provideLocationValue?: string;
  interpolaterValue: MetadataInterpolater;

  public constructor(name: string) {
    this.name = name;
    this.interpolaterValue = defaultInterpolater;
  }

  public static named(name: string): MetadataBuilder {
    return new MetadataBuilder(name);
  }

  public static from(name: string, source: MetadataSource | string): MetadataBuilder {
    return new MetadataBuilder(name).source(source);
  }

  public source(source: MetadataSource | string): MetadataBuilder {
    this.sourceValue = normalizeMetadataSource(source);
    return this;
  }

  public interpolater(interpolater: MetadataInterpolater): MetadataBuilder {
    this.interpolaterValue = interpolater;
    return this;
  }

  public provideLocation(location: string): MetadataBuilder {
    this.provideLocationValue = location;
    return this;
  }

  public build(): Metadata {
    return {
      name: this.name,
      source: this.sourceValue,
      provideLocation: this.provideLocationValue,
      interpolate: this.interpolaterValue,
    };
  }
}

/**
 * Fluent metadata builder entry points.
 *
 * This mirrors Rust-style ergonomics:
 * `Metadata.named("Name").source(...).interpolater(...).build()`.
 */
export const Metadata = {
  named(name: string): MetadataBuilder {
    return MetadataBuilder.named(name);
  },
  from(name: string, source: MetadataSource | string): MetadataBuilder {
    return MetadataBuilder.from(name, source);
  },
} as const;

export function metadataNamed(name: string): Metadata {
  return Metadata.named(name).build();
}

export function metadataFrom(name: string, source: string): Metadata {
  return Metadata.from(name, source).build();
}

export function metadataFromFile(name: string, path: string): Metadata {
  return Metadata.named(name).source({ kind: SourceKind.File, path }).build();
}

export function metadataFromEnv(name: string, selector: string): Metadata {
  return Metadata.named(name).source({ kind: SourceKind.Env, selector }).build();
}

export function metadataFromInline(name: string, descriptor: string): Metadata {
  return Metadata.named(name).source({ kind: SourceKind.Inline, descriptor }).build();
}

export function metadataFromCode(name: string, location: string): Metadata {
  return Metadata.named(name).source({ kind: SourceKind.Code, location }).build();
}

export function formatMetadataSource(source: MetadataSource | undefined): string {
  if (!source) {
    return "";
  }

  switch (source.kind) {
    case SourceKind.File:
      return `file ${displayFilePath(source.path)}`;
    case SourceKind.Env:
      return `environment ${source.selector}`;
    case SourceKind.Inline:
      return source.descriptor;
    case SourceKind.Code:
      return `code ${source.location}`;
    case SourceKind.Custom:
      return source.value;
  }
}

function normalizeMetadataSource(source: MetadataSource | string): MetadataSource {
  if (typeof source === "string") {
    return {
      kind: SourceKind.Custom,
      value: source,
    };
  }

  return source;
}

function defaultInterpolater(profile: string, keys: string[]): string {
  return `${profile}.${keys.join(".")}`;
}

function displayFilePath(path: string): string {
  if (!isAbsolute(path)) {
    return path;
  }

  const relPath = relative(process.cwd(), path);
  if (!relPath || relPath === ".") {
    return path;
  }

  return segmentCount(relPath) < segmentCount(path) ? relPath : path;
}

function segmentCount(path: string): number {
  return normalize(path).split(sep).filter(Boolean).length;
}
