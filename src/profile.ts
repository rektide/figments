export const DEFAULT_PROFILE = "default";
export const GLOBAL_PROFILE = "global";

export type ProfileInput = string;

export function normalizeProfile(profile: ProfileInput): string {
  return profile.trim().toLowerCase();
}

export function isCustomProfile(profile: string): boolean {
  return profile !== DEFAULT_PROFILE && profile !== GLOBAL_PROFILE;
}

export function profileFromEnv(key: string): string | undefined {
  const lowered = key.toLowerCase();
  for (const [envKey, value] of Object.entries(process.env)) {
    if (envKey.trim().toLowerCase() === lowered && value !== undefined) {
      return normalizeProfile(value);
    }
  }

  return undefined;
}

export function profileFromEnvOr(key: string, fallback: string): string {
  return profileFromEnv(key) ?? normalizeProfile(fallback);
}
