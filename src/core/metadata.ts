export type MetadataSourceKind = "file" | "env" | "inline" | "custom";

export interface MetadataSource {
  kind: MetadataSourceKind;
  value: string;
}

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
    source: { kind: "file", value: path },
  };
}

export function metadataFromEnv(name: string, selector: string): Metadata {
  return {
    ...metadataNamed(name),
    source: { kind: "env", value: selector },
  };
}

export function metadataFromInline(name: string, descriptor: string): Metadata {
  return {
    ...metadataNamed(name),
    source: { kind: "inline", value: descriptor },
  };
}

export function formatMetadataSource(source: MetadataSource | undefined): string {
  if (!source) {
    return "";
  }

  switch (source.kind) {
    case "file":
      return `file ${source.value}`;
    case "env":
      return `environment ${source.value}`;
    case "inline":
      return source.value;
    case "custom":
      return source.value;
  }
}
