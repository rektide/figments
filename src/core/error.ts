import type { Metadata } from "./metadata.ts";
import { formatMetadataSource } from "./metadata.ts";
import type { Tag } from "./tag.ts";

export class FigmentError extends Error {
  readonly kind: string;
  readonly tag?: Tag;
  readonly path: string[];
  readonly profile?: string;
  readonly metadata?: Metadata;
  readonly previous?: FigmentError;

  public constructor(
    kind: string,
    message: string,
    options?: {
      path?: string[];
      tag?: Tag;
      profile?: string;
      metadata?: Metadata;
      previous?: FigmentError;
    },
  ) {
    super(message);
    this.name = "FigmentError";
    this.kind = kind;
    this.tag = options?.tag;
    this.path = options?.path ?? [];
    this.profile = options?.profile;
    this.metadata = options?.metadata;
    this.previous = options?.previous;
  }

  public withPath(path: string): FigmentError {
    return new FigmentError(this.kind, this.message, {
      path: [...this.path, ...path.split(".").filter(Boolean)],
      tag: this.tag,
      profile: this.profile,
      metadata: this.metadata,
      previous: this.previous,
    });
  }

  public chain(previous: FigmentError): FigmentError {
    return new FigmentError(this.kind, this.message, {
      path: this.path,
      tag: this.tag,
      profile: this.profile,
      metadata: this.metadata,
      previous,
    });
  }

  public toString(): string {
    const keySuffix = this.path.length > 0 ? ` for key '${this.path.join(".")}'` : "";
    const source = formatMetadataSource(this.metadata?.source);
    const sourceSuffix = this.metadata?.source
      ? ` in ${source} ${this.metadata.name}`
      : this.metadata
        ? ` in ${this.metadata.name}`
        : "";
    const base = `${this.message}${keySuffix}${sourceSuffix}`;
    if (!this.previous) {
      return base;
    }

    return `${base}\n${this.previous.toString()}`;
  }

  public static missingField(path: string): FigmentError {
    return new FigmentError("MissingField", `missing field '${path}'`, {
      path: path.split(".").filter(Boolean),
    });
  }

  public static message(message: string): FigmentError {
    return new FigmentError("Message", message);
  }

  public withContext(options: { tag?: Tag; profile?: string; metadata?: Metadata }): FigmentError {
    return new FigmentError(this.kind, this.message, {
      path: this.path,
      tag: options.tag ?? this.tag,
      profile: options.profile ?? this.profile,
      metadata: options.metadata ?? this.metadata,
      previous: this.previous,
    });
  }
}
