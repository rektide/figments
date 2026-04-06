export type ConfigPrimitive = string | number | boolean | null | undefined;

export interface ConfigDict {
  [key: string]: ConfigValue;
}

export interface ConfigArray extends Array<ConfigValue> {}

export type ConfigValue = ConfigPrimitive | ConfigArray | ConfigDict;

export type ProfileMap = Record<string, ConfigDict>;

export function isConfigDict(value: ConfigValue | unknown): value is ConfigDict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deepClone<T extends ConfigValue>(value: T): T {
  if (Array.isArray(value)) {
    return (value as ConfigValue[]).map((item: ConfigValue) => deepClone(item)) as T;
  }

  if (isConfigDict(value)) {
    const copy: ConfigDict = {};
    for (const [key, item] of Object.entries(value)) {
      copy[key] = deepClone(item);
    }

    return copy as T;
  }

  return value;
}
