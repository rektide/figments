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

export function metadataNamed(name: string): Metadata {
  return {
    name,
    interpolate: (profile, keys) => `${profile}.${keys.join(".")}`,
  };
}

export function metadataFrom(name: string, source: string): Metadata {
  return {
    ...metadataNamed(name),
    source: { kind: SourceKind.Custom, value: source },
  };
}

export function metadataFromFile(name: string, path: string): Metadata {
  return {
    ...metadataNamed(name),
    source: { kind: SourceKind.File, path },
  };
}

export function metadataFromEnv(name: string, selector: string): Metadata {
  return {
    ...metadataNamed(name),
    source: { kind: SourceKind.Env, selector },
  };
}

export function metadataFromInline(name: string, descriptor: string): Metadata {
  return {
    ...metadataNamed(name),
    source: { kind: SourceKind.Inline, descriptor },
  };
}

export function metadataFromCode(name: string, location: string): Metadata {
  return {
    ...metadataNamed(name),
    source: { kind: SourceKind.Code, location },
  };
}

export function formatMetadataSource(source: MetadataSource | undefined): string {
  if (!source) {
    return "";
  }

  switch (source.kind) {
    case SourceKind.File:
      return `file ${source.path}`;
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
