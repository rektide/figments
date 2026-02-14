//#region src/core/metadata.d.ts
type MetadataSourceKind = string;
interface MetadataSource {
  kind: MetadataSourceKind;
  value: string;
}
interface Metadata {
  name: string;
  source?: MetadataSource;
  provideLocation?: string;
  interpolate: (profile: string, keys: string[]) => string;
}
//#endregion
//#region src/core/types.d.ts
type ConfigPrimitive = string | number | boolean | null;
interface ConfigDict {
  [key: string]: ConfigValue;
}
interface ConfigArray extends Array<ConfigValue> {}
type ConfigValue = ConfigPrimitive | ConfigArray | ConfigDict;
type ProfileMap = Record<string, ConfigDict>;
//#endregion
//#region src/core/tag.d.ts
interface Tag {
  metadataId: number;
  profile: string;
}
interface BaseTagNode {
  kind: "scalar" | "array" | "dict";
  tag: Tag;
  key?: string;
}
interface TagScalarNode extends BaseTagNode {
  kind: "scalar";
}
interface TagArrayNode extends BaseTagNode {
  kind: "array";
  children: TagNode[];
}
interface TagDictNode extends BaseTagNode {
  kind: "dict";
  children: DictChildTagNode[];
}
type TagNode = TagScalarNode | TagArrayNode | TagDictNode;
type DictChildTagNode = (TagScalarNode & {
  key: string;
}) | (TagArrayNode & {
  key: string;
}) | (TagDictNode & {
  key: string;
});
type ProfileTagMap = Record<string, TagDictNode>;
//#endregion
//#region src/provider.d.ts
interface Provider {
  metadata(): Metadata;
  data(): ProfileMap | Promise<ProfileMap>;
  selectedProfile?(): string | undefined;
  metadataMap?(): Map<number, Metadata>;
  tagMap?(): ProfileTagMap;
}
//#endregion
//#region src/figment.d.ts
declare class Figment implements Provider {
  private activeProfile;
  private readonly metadataByTag;
  private values;
  private tags;
  private failure?;
  private nextTag;
  private pending;
  constructor();
  static new(): Figment;
  static from(provider: Provider): Figment;
  metadata(): Metadata;
  data(): Promise<ProfileMap>;
  profile(): string;
  selectedProfile(): string;
  metadataEntries(): Metadata[];
  metadataMap(): Map<number, Metadata>;
  tagMap(): ProfileTagMap;
  getMetadata(tag: Tag): Metadata | undefined;
  findMetadata(path: string): Promise<Metadata | undefined>;
  select(profile: string): Figment;
  join(provider: Provider): Figment;
  adjoin(provider: Provider): Figment;
  merge(provider: Provider): Figment;
  admerge(provider: Provider): Figment;
  profiles(): Promise<string[]>;
  extract<T>(decode?: (value: ConfigDict) => T): Promise<T>;
  extractLossy<T>(decode?: (value: ConfigDict) => T): Promise<T>;
  extractInner<T>(path: string): Promise<T>;
  extractInnerLossy<T>(path: string): Promise<T>;
  contains(path: string): Promise<boolean>;
  findValue(path: string): Promise<ConfigValue>;
  focus(path: string): Figment;
  ready(): Promise<void>;
  private provide;
  private allocateTag;
  private importMetadataMap;
  private merged;
  private mergedState;
  private findTagForPath;
}
//#endregion
//#region src/profile.d.ts
declare const DEFAULT_PROFILE = "default";
declare const GLOBAL_PROFILE = "global";
declare function profileFromEnv(key: string): string | undefined;
declare function profileFromEnvOr(key: string, fallback: string): string;
//#endregion
//#region src/core/error.d.ts
declare class FigmentError extends Error {
  readonly kind: string;
  readonly tag?: Tag;
  readonly path: string[];
  readonly profile?: string;
  readonly metadata?: Metadata;
  readonly previous?: FigmentError;
  constructor(kind: string, message: string, options?: {
    path?: string[];
    tag?: Tag;
    profile?: string;
    metadata?: Metadata;
    previous?: FigmentError;
  });
  withPath(path: string): FigmentError;
  chain(previous: FigmentError): FigmentError;
  toString(): string;
  static missingField(path: string): FigmentError;
  static message(message: string): FigmentError;
  withContext(options: {
    tag?: Tag;
    profile?: string;
    metadata?: Metadata;
  }): FigmentError;
}
//#endregion
//#region src/providers/env.d.ts
declare class Env implements Provider {
  private readonly transforms;
  private profileName;
  private prefixValue?;
  private shouldLowercase;
  private constructor();
  static raw(): Env;
  static prefixed(prefix: string): Env;
  filter(predicate: (key: string) => boolean): Env;
  map(mapper: (key: string) => string): Env;
  filterMap(mapper: (key: string) => string | undefined): Env;
  lowercase(lowercase: boolean): Env;
  split(pattern: string): Env;
  ignore(keys: string[]): Env;
  only(keys: string[]): Env;
  profile(profile: string): Env;
  selectedProfile(): string;
  global(): Env;
  metadata(): Metadata;
  data(): ProfileMap;
  iter(source?: Record<string, string | undefined>): Array<[string, string]>;
  static var(name: string): string | undefined;
  static varOr(name: string, fallback: string): string;
  private withTransform;
  private clone;
  private copyFrom;
}
//#endregion
//#region src/providers/serialized.d.ts
declare class Serialized<T = unknown> implements Provider {
  value: T;
  keyPath?: string;
  targetProfile: string;
  constructor(value: T, profile?: string, keyPath?: string);
  static from<T>(value: T, profile: string): Serialized<T>;
  static defaults<T>(value: T): Serialized<T>;
  static globals<T>(value: T): Serialized<T>;
  static default<T>(key: string, value: T): Serialized<T>;
  static global<T>(key: string, value: T): Serialized<T>;
  profile(profile: string): Serialized<T>;
  selectedProfile(): string;
  key(keyPath: string): Serialized<T>;
  metadata(): Metadata;
  data(): ProfileMap;
}
//#endregion
//#region src/providers/data.d.ts
interface Format {
  readonly name: string;
  parse(source: string): unknown;
}
type DataSource = {
  type: "file";
  path: string;
  required: boolean;
  search: boolean;
} | {
  type: "string";
  source: string;
};
declare class Data<F extends Format> implements Provider {
  private readonly format;
  private source;
  private profileName;
  constructor(format: F, source: DataSource, profileName?: string | undefined);
  static file<F extends Format>(format: F, path: string): Data<F>;
  static string<F extends Format>(format: F, source: string): Data<F>;
  nested(): Data<F>;
  required(required: boolean): Data<F>;
  search(search: boolean): Data<F>;
  profile(profile: string): Data<F>;
  selectedProfile(): string | undefined;
  metadata(): Metadata;
  data(): Promise<ProfileMap>;
  private load;
}
declare const Json: FormatProvider;
declare const Toml: FormatProvider;
declare const Yaml: FormatProvider;
interface FormatProvider {
  file(path: string): Data<Format>;
  string(source: string): Data<Format>;
}
declare namespace index_d_exports {
  export { Data, Env, Format, FormatProvider, Json, Serialized, Toml, Yaml };
}
//#endregion
export { type ConfigDict, type ConfigValue, DEFAULT_PROFILE, Figment, FigmentError, GLOBAL_PROFILE, type ProfileMap, type Provider, profileFromEnv, profileFromEnvOr, index_d_exports as providers };