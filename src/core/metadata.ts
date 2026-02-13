export type MetadataSourceKind = string;

export interface MetadataSource {
  kind: MetadataSourceKind;
  value: string;
}

export const SourceKind = {
  File: "file",
  Env: "env",
  Inline: "inline",
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
    source: { kind: "custom", value: source },
  };
}

export function metadataFromFile(name: string, path: string): Metadata {
  return {
    ...metadataNamed(name),
    source: { kind: SourceKind.File, value: path },
  };
}

export function metadataFromEnv(name: string, selector: string): Metadata {
  return {
    ...metadataNamed(name),
    source: { kind: SourceKind.Env, value: selector },
  };
}

export function metadataFromInline(name: string, descriptor: string): Metadata {
  return {
    ...metadataNamed(name),
    source: { kind: SourceKind.Inline, value: descriptor },
  };
}

export function formatMetadataSource(source: MetadataSource | undefined): string {
  if (!source) {
    return "";
  }

  if (source.kind === SourceKind.File) {
    return `file ${source.value}`;
  }

  if (source.kind === SourceKind.Env) {
    return `environment ${source.value}`;
  }

  return source.value;
}
