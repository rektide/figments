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

export interface DecoderIssue {
  message: string;
  path?: string | Array<string | number>;
  code?: string;
  expected?: string;
  received?: unknown;
  options?: string[];
  keys?: string[];
}

export interface FigmentErrorContext {
  tag?: Tag;
  profile?: string;
  selectedProfiles?: string[];
  effectiveProfileOrder?: string[];
  metadata?: Metadata;
}

interface FigmentErrorOptions extends FigmentErrorContext {
  path?: string[];
  expected?: string;
  actual?: ActualType;
  actualValue?: string | number;
  expectedValues?: string[];
  field?: string;
  needed?: string;
}

export type FigmentFailure = FigmentError | FigmentAggregateError;

export class FigmentError extends Error {
  readonly kind: FigmentErrorKind;
  readonly tag?: Tag;
  readonly path: string[];
  readonly profile?: string;
  readonly selectedProfiles?: string[];
  readonly effectiveProfileOrder?: string[];
  readonly metadata?: Metadata;
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
      expected: this.expected,
      actual: this.actual,
      actualValue: this.actualValue,
      expectedValues: this.expectedValues,
      field: this.field,
      needed: this.needed,
    });
  }

  public withContext(options: FigmentErrorContext): FigmentError {
    return new FigmentError(this.kind, this.message, {
      path: this.path,
      tag: options.tag ?? this.tag,
      profile: options.profile ?? this.profile,
      selectedProfiles: options.selectedProfiles ?? this.selectedProfiles,
      effectiveProfileOrder: options.effectiveProfileOrder ?? this.effectiveProfileOrder,
      metadata: options.metadata ?? this.metadata,
      expected: this.expected,
      actual: this.actual,
      actualValue: this.actualValue,
      expectedValues: this.expectedValues,
      field: this.field,
      needed: this.needed,
    });
  }

  public missing(): boolean {
    return this.kind === "MissingField";
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
    return (
      `${this.message}${mismatchSuffix}${detailSuffix}${keySuffix}${sourceSuffix}${providerKeySuffix}` +
      profileOrderSuffix
    );
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

  public static decode(scope: string, error: unknown): FigmentFailure {
    const issues = decodeIssues(error);
    if (issues.length > 0) {
      return FigmentError.decodeIssues(scope, issues);
    }

    const detail = error instanceof Error ? error.message : String(error);
    return new FigmentError("Decode", `failed to decode ${scope}: ${detail}`);
  }

  public static decodeIssues(scope: string, issues: DecoderIssue[]): FigmentFailure {
    if (issues.length === 0) {
      return new FigmentError("Decode", `failed to decode ${scope}: unknown decoder issue`);
    }

    const mapped = issues.map((issue) => fromDecoderIssue(scope, issue));
    if (mapped.length === 1) {
      return mapped[0];
    }

    return new FigmentAggregateError(mapped, `failed to decode ${scope} with ${mapped.length} issues`);
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
}

export class FigmentAggregateError extends AggregateError {
  declare readonly errors: FigmentError[];

  public constructor(errors: Iterable<FigmentError>, message = "multiple figment errors") {
    const normalized = [...errors];
    super(normalized, message);
    this.name = "FigmentAggregateError";
    this.errors = normalized;
  }

  public withPath(path: string): FigmentAggregateError {
    return new FigmentAggregateError(this.errors.map((error) => error.withPath(path)), this.message);
  }

  public withContext(context: FigmentErrorContext): FigmentAggregateError {
    return new FigmentAggregateError(
      this.errors.map((error) => error.withContext(context)),
      this.message,
    );
  }

  public count(): number {
    return this.errors.length;
  }

  public missing(): boolean {
    return this.errors.some((error) => error.missing());
  }

  public *values(): IterableIterator<FigmentError> {
    for (const error of this.errors) {
      yield error;
    }
  }

  public [Symbol.iterator](): IterableIterator<FigmentError> {
    return this.values();
  }

  public toArray(): FigmentError[] {
    return [...this.errors];
  }

  public toString(): string {
    return [this.message, ...this.errors.map((error) => error.toString())].join("\n");
  }
}

export function isFigmentFailure(error: unknown): error is FigmentFailure {
  return error instanceof FigmentError || error instanceof FigmentAggregateError;
}

export function flattenFigmentFailure(error: FigmentFailure): FigmentError[] {
  if (error instanceof FigmentAggregateError) {
    return error.toArray();
  }

  return [error];
}

export function mergeFigmentFailures(
  incoming: FigmentFailure,
  previous: FigmentFailure | undefined,
): FigmentFailure {
  if (!previous) {
    return incoming;
  }

  return new FigmentAggregateError(
    [...flattenFigmentFailure(incoming), ...flattenFigmentFailure(previous)],
  );
}

function decodeIssues(error: unknown): DecoderIssue[] {
  if (!error || typeof error !== "object") {
    return [];
  }

  const maybeIssues = (error as { issues?: unknown }).issues;
  if (!Array.isArray(maybeIssues)) {
    return [];
  }

  return maybeIssues.flatMap((issue) => normalizeDecoderIssue(issue));
}

function normalizeDecoderIssue(issue: unknown): DecoderIssue[] {
  if (!issue || typeof issue !== "object") {
    return [];
  }

  const input = issue as Record<string, unknown>;
  if (typeof input.message !== "string") {
    return [];
  }

  const path =
    typeof input.path === "string" || Array.isArray(input.path)
      ? (input.path as string | Array<string | number>)
      : undefined;
  const options = Array.isArray(input.options)
    ? input.options.filter((item): item is string => typeof item === "string")
    : undefined;
  const keys = Array.isArray(input.keys)
    ? input.keys.filter((item): item is string => typeof item === "string")
    : undefined;

  return [
    {
      message: input.message,
      path,
      code: typeof input.code === "string" ? input.code : undefined,
      expected: typeof input.expected === "string" ? input.expected : undefined,
      received: input.received,
      options,
      keys,
    },
  ];
}

function fromDecoderIssue(scope: string, issue: DecoderIssue): FigmentError {
  const path = normalizeDecoderIssuePath(issue.path);
  let error: FigmentError;

  switch (issue.code) {
    case "invalid_type":
      error = new FigmentError("InvalidType", `failed to decode ${scope}: ${issue.message}`, {
        expected: issue.expected,
        actual: actualType(issue.received),
        actualValue: stringifyActualValue(issue.received),
      });
      break;
    case "invalid_enum_value":
    case "invalid_union_discriminator":
      error = new FigmentError("UnknownVariant", `failed to decode ${scope}: ${issue.message}`, {
        actualValue: stringifyActualValue(issue.received) ?? "unknown",
        expectedValues: issue.options,
      });
      break;
    case "unrecognized_keys": {
      const first = issue.keys?.[0] ?? stringifyActualValue(issue.received) ?? "unknown";
      error = new FigmentError("UnknownField", `failed to decode ${scope}: ${issue.message}`, {
        actualValue: typeof first === "number" ? String(first) : first,
        expectedValues: issue.keys,
      });
      break;
    }
    default:
      error = new FigmentError("Decode", `failed to decode ${scope}: ${issue.message}`);
      break;
  }

  return path ? error.withPath(path) : error;
}

function normalizeDecoderIssuePath(path: DecoderIssue["path"]): string | undefined {
  if (path === undefined) {
    return undefined;
  }

  if (typeof path === "string") {
    const trimmed = path.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  const parts = path.map((part) => String(part).trim()).filter((part) => part.length > 0);
  if (parts.length === 0) {
    return undefined;
  }

  return parts.join(".");
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
