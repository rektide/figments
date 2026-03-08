import type { Metadata } from "./metadata.ts";
import { formatMetadataSource } from "./metadata.ts";
import type { Tag } from "./tag.ts";

export type FigmentErrorKind =
  | "MissingField"
  | "Message"
  | "Decode"
  | "InvalidType"
  | "InvalidValue";

export type ActualType =
  | "undefined"
  | "null"
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "dict"
  | "other";

interface FigmentErrorOptions {
  path?: string[];
  tag?: Tag;
  profile?: string;
  metadata?: Metadata;
  previous?: FigmentError;
  expected?: string;
  actual?: ActualType;
}

export class FigmentError extends Error {
  readonly kind: FigmentErrorKind;
  readonly tag?: Tag;
  readonly path: string[];
  readonly profile?: string;
  readonly metadata?: Metadata;
  readonly previous?: FigmentError;
  readonly expected?: string;
  readonly actual?: ActualType;

  public constructor(kind: FigmentErrorKind, message: string, options?: FigmentErrorOptions) {
    super(message);
    this.name = "FigmentError";
    this.kind = kind;
    this.tag = options?.tag;
    this.path = options?.path ?? [];
    this.profile = options?.profile;
    this.metadata = options?.metadata;
    this.previous = options?.previous;
    this.expected = options?.expected;
    this.actual = options?.actual;
  }

  public withPath(path: string): FigmentError {
    return new FigmentError(this.kind, this.message, {
      path: [...this.path, ...path.split(".").filter(Boolean)],
      tag: this.tag,
      profile: this.profile,
      metadata: this.metadata,
      previous: this.previous,
      expected: this.expected,
      actual: this.actual,
    });
  }

  public chain(previous: FigmentError): FigmentError {
    return new FigmentError(this.kind, this.message, {
      path: this.path,
      tag: this.tag,
      profile: this.profile,
      metadata: this.metadata,
      previous,
      expected: this.expected,
      actual: this.actual,
    });
  }

  public toString(): string {
    const keySuffix = this.path.length > 0 ? ` for key '${this.path.join(".")}'` : "";
    const profile = this.profile ?? this.tag?.profile ?? "default";
    const interpolated =
      this.metadata && this.path.length > 0
        ? this.metadata.interpolate(profile, this.path)
        : undefined;
    const providerKeySuffix = interpolated ? ` (provider key '${interpolated}')` : "";
    const source = formatMetadataSource(this.metadata?.source);
    const sourceSuffix = this.metadata?.source
      ? ` in ${source} ${this.metadata.name}`
      : this.metadata
        ? ` in ${this.metadata.name}`
        : "";
    const mismatchSuffix = this.expected
      ? ` (expected ${this.expected}, found ${this.actual ?? "unknown"})`
      : "";
    const base = `${this.message}${mismatchSuffix}${keySuffix}${sourceSuffix}${providerKeySuffix}`;
    if (!this.previous) {
      return base;
    }

    return `${base}\n${this.previous.toString()}`;
  }

  public static missingField(path: string, profile?: string): FigmentError {
    return new FigmentError("MissingField", `missing field '${path}'`, {
      path: path.split(".").filter(Boolean),
      profile,
    });
  }

  public static message(message: string): FigmentError {
    return new FigmentError("Message", message);
  }

  public static decode(scope: string, error: unknown): FigmentError {
    const detail = error instanceof Error ? error.message : String(error);
    return new FigmentError("Decode", `failed to decode ${scope}: ${detail}`);
  }

  public static invalidType(expected: string, actualValue: unknown): FigmentError {
    return new FigmentError("InvalidType", "invalid type", {
      expected,
      actual: actualType(actualValue),
    });
  }

  public static invalidValue(message: string): FigmentError {
    return new FigmentError("InvalidValue", message);
  }

  public withContext(options: { tag?: Tag; profile?: string; metadata?: Metadata }): FigmentError {
    return new FigmentError(this.kind, this.message, {
      path: this.path,
      tag: options.tag ?? this.tag,
      profile: options.profile ?? this.profile,
      metadata: options.metadata ?? this.metadata,
      previous: this.previous,
      expected: this.expected,
      actual: this.actual,
    });
  }
}

function actualType(value: unknown): ActualType {
  if (value === undefined) {
    return "undefined";
  }

  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  if (typeof value === "object") {
    return "dict";
  }

  if (typeof value === "string") {
    return "string";
  }

  if (typeof value === "number") {
    return "number";
  }

  if (typeof value === "boolean") {
    return "boolean";
  }

  return "other";
}
