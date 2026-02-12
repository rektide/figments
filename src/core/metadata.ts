export interface Metadata {
  name: string;
  source?: string;
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
    source,
  };
}
