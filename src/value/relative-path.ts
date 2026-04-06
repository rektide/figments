import { dirname, isAbsolute, resolve } from "node:path";

import type { Metadata } from "../core/metadata.ts";

/**
 * A path value that can resolve itself relative to the configuration file that
 * produced it, when file-source metadata is available.
 */
export class RelativePathBuf {
  readonly pathValue: string;
  readonly metadataFilePathValue?: string;

  public constructor(pathValue: string, metadataFilePathValue?: string) {
    this.pathValue = pathValue;
    this.metadataFilePathValue = metadataFilePathValue;
  }

  /**
   * Creates a relative path buffer from a string value and optional metadata.
   */
  public static from(path: string, metadata?: Metadata): RelativePathBuf {
    return new RelativePathBuf(path, metadataFilePath(metadata));
  }

  /**
   * Returns the original configured path exactly as provided.
   */
  public original(): string {
    return this.pathValue;
  }

  /**
   * Returns the metadata file path used as a resolution anchor, if available.
   */
  public metadataPath(): string | undefined {
    return this.metadataFilePathValue;
  }

  /**
   * Resolves this path relative to the metadata file location when possible.
   *
   * - Absolute paths stay unchanged.
   * - Non-file metadata returns the original path.
   * - File metadata resolves against the file's parent directory.
   */
  public relative(): string {
    if (isAbsolute(this.pathValue)) {
      return this.pathValue;
    }

    if (!this.metadataFilePathValue) {
      return this.pathValue;
    }

    return resolve(dirname(this.metadataFilePathValue), this.pathValue);
  }
}

/**
 * Decodes a configuration value as a `RelativePathBuf`.
 */
export function decodeRelativePathBuf(value: unknown, metadata?: Metadata): RelativePathBuf {
  if (typeof value !== "string") {
    throw new Error("relative path value must be a string");
  }

  return RelativePathBuf.from(value, metadata);
}

function metadataFilePath(metadata: Metadata | undefined): string | undefined {
  if (!metadata || metadata.source?.kind !== "file") {
    return undefined;
  }

  return metadata.source.path;
}
