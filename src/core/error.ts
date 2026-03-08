import type { Metadata } from "./metadata.ts";
import { formatMetadataSource } from "./metadata.ts";
import type { Tag } from "./tag.ts";

export type FigmentErrorKind =
  | "MissingField"
  | "Message"
  | "Decode"
  | "InvalidType"
  | "InvalidValue"
  | "InvalidLength"
  | "UnknownVariant"
  | "UnknownField"
  | "DuplicateField"
  | "Unsupported"
  | "UnsupportedKey";

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
  selectedProfiles?: string[];
  effectiveProfileOrder?: string[];
  metadata?: Metadata;
  previous?: FigmentError;
  expected?: string;
  actual?: ActualType;
  actualValue?: string | number;
  expectedValues?: string[];
  field?: string;
  needed?: string;
}

export class FigmentError extends Error {
  readonly kind: FigmentErrorKind;
  readonly tag?: Tag;
  readonly path: string[];
  readonly profile?: string;
  readonly selectedProfiles?: string[];
  readonly effectiveProfileOrder?: string[];
  readonly metadata?: Metadata;
  readonly previous?: FigmentError;
  readonly expected?: string;
  readonly actual?: ActualType;
  readonly actualValue?: string | number;
  readonly expectedValues?: string[];
  readonly field?: string;
  readonly needed?: string;

  public constructor(kind: FigmentErrorKind, message: string, options?: FigmentErrorOptions) {
    super(message);
    this.name = "FigmentError";
    this.kind = kind;
    this.tag = options?.tag;
    this.path = options?.path ?? [];
    this.profile = options?.profile;
    this.selectedProfiles = options?.selectedProfiles ? [...options.selectedProfiles] : undefined;
    this.effectiveProfileOrder = options?.effectiveProfileOrder
      ? [...options.effectiveProfileOrder]
      : undefined;
    this.metadata = options?.metadata;
    this.previous = options?.previous;
    this.expected = options?.expected;
    this.actual = options?.actual;
    this.actualValue = options?.actualValue;
    this.expectedValues = options?.expectedValues ? [...options.expectedValues] : undefined;
    this.field = options?.field;
    this.needed = options?.needed;
  }

  public withPath(path: string): FigmentError {
    return new FigmentError(this.kind, this.message, {
      path: [...this.path, ...path.split(".").filter(Boolean)],
      tag: this.tag,
      profile: this.profile,
      selectedProfiles: this.selectedProfiles,
      effectiveProfileOrder: this.effectiveProfileOrder,
      metadata: this.metadata,
      previous: this.previous,
      expected: this.expected,
      actual: this.actual,
      actualValue: this.actualValue,
      expectedValues: this.expectedValues,
      field: this.field,
      needed: this.needed,
    });
  }

  public chain(previous: FigmentError): FigmentError {
    return new FigmentError(this.kind, this.message, {
      path: this.path,
      tag: this.tag,
      profile: this.profile,
      selectedProfiles: this.selectedProfiles,
      effectiveProfileOrder: this.effectiveProfileOrder,
      metadata: this.metadata,
      previous,
      expected: this.expected,
      actual: this.actual,
      actualValue: this.actualValue,
      expectedValues: this.expectedValues,
      field: this.field,
      needed: this.needed,
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
    const detailSuffix = formatKindDetail(this);
    const profileOrderSuffix =
      this.effectiveProfileOrder && this.effectiveProfileOrder.length > 0
        ? ` [profile order: ${this.effectiveProfileOrder.join(" -> ")}]`
        : "";
    const base =
      `${this.message}${mismatchSuffix}${detailSuffix}${keySuffix}${sourceSuffix}${providerKeySuffix}` +
      profileOrderSuffix;
    if (!this.previous) {
      return base;
    }

    return `${base}\n${this.previous.toString()}`;
  }

  public static missingField(
    path: string,
    options?: {
      profile?: string;
      selectedProfiles?: string[];
      effectiveProfileOrder?: string[];
    },
  ): FigmentError {
    return new FigmentError("MissingField", `missing field '${path}'`, {
      path: path.split(".").filter(Boolean),
      profile: options?.profile,
      selectedProfiles: options?.selectedProfiles,
      effectiveProfileOrder: options?.effectiveProfileOrder,
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
      actualValue: stringifyActualValue(actualValue),
    });
  }

  public static invalidValue(message: string): FigmentError {
    return new FigmentError("InvalidValue", message);
  }

  public static invalidLength(actual: number, expected: string): FigmentError {
    return new FigmentError("InvalidLength", "invalid length", {
      expected,
      actualValue: actual,
    });
  }

  public static unknownVariant(actual: string, expectedValues: string[]): FigmentError {
    return new FigmentError("UnknownVariant", "unknown variant", {
      actualValue: actual,
      expectedValues,
    });
  }

  public static unknownField(actual: string, expectedValues: string[]): FigmentError {
    return new FigmentError("UnknownField", "unknown field", {
      actualValue: actual,
      expectedValues,
    });
  }

  public static duplicateField(field: string): FigmentError {
    return new FigmentError("DuplicateField", "duplicate field", {
      field,
    });
  }

  public static unsupported(actualValue: unknown): FigmentError {
    return new FigmentError("Unsupported", "unsupported type", {
      actual: actualType(actualValue),
      actualValue: stringifyActualValue(actualValue),
    });
  }

  public static unsupportedKey(actualValue: unknown, needed: string): FigmentError {
    return new FigmentError("UnsupportedKey", "unsupported key type", {
      actual: actualType(actualValue),
      actualValue: stringifyActualValue(actualValue),
      needed,
    });
  }

  public missing(): boolean {
    return this.kind === "MissingField";
  }

  public count(): number {
    return 1 + (this.previous?.count() ?? 0);
  }

  public withContext(options: {
    tag?: Tag;
    profile?: string;
    selectedProfiles?: string[];
    effectiveProfileOrder?: string[];
    metadata?: Metadata;
  }): FigmentError {
    return new FigmentError(this.kind, this.message, {
      path: this.path,
      tag: options.tag ?? this.tag,
      profile: options.profile ?? this.profile,
      selectedProfiles: options.selectedProfiles ?? this.selectedProfiles,
      effectiveProfileOrder: options.effectiveProfileOrder ?? this.effectiveProfileOrder,
      metadata: options.metadata ?? this.metadata,
      previous: this.previous,
      expected: this.expected,
      actual: this.actual,
      actualValue: this.actualValue,
      expectedValues: this.expectedValues,
      field: this.field,
      needed: this.needed,
    });
  }
}

function formatKindDetail(error: FigmentError): string {
  switch (error.kind) {
    case "InvalidLength":
      return error.actualValue !== undefined
        ? ` (length ${error.actualValue}, expected ${error.expected ?? "unknown"})`
        : "";
    case "UnknownVariant":
    case "UnknownField": {
      const actual = error.actualValue !== undefined ? ` '${error.actualValue}'` : "";
      const expected = error.expectedValues?.join(", ") ?? "";
      return expected.length > 0 ? ` (${actual.trim()} expected one of: ${expected})` : "";
    }
    case "DuplicateField":
      return error.field ? ` ('${error.field}')` : "";
    case "Unsupported":
      return error.actual ? ` (${error.actual})` : "";
    case "UnsupportedKey": {
      const actual = error.actual ? ` ${error.actual}` : "";
      const needed = error.needed ? `, need ${error.needed}` : "";
      return ` (${actual.trim()}${needed})`;
    }
    default:
      return "";
  }
}

function stringifyActualValue(value: unknown): string | number | undefined {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return "undefined";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  if (typeof value === "object") {
    return "object";
  }

  return undefined;
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
