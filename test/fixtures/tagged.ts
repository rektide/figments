import { metadataNamed, type Metadata } from "../../src/core/metadata.ts";
import { taggedProvider } from "../../src/providers/tagged.ts";
import { appHostTokenConfig } from "./config.ts";

export function createTaggedAppTokenProvider(options?: {
  name?: string;
  tokenMetadata?: Metadata;
}) {
  const name = options?.name ?? "TaggedApp";
  const tokenMetadata = options?.tokenMetadata ?? metadataNamed("TokenSource");
  return taggedProvider({
    name,
    data: {
      default: appHostTokenConfig(),
    },
    rules: [{ path: "app.token", metadata: tokenMetadata, mode: "node" }],
  });
}

export function createTaggedPortProvider(options?: {
  name?: string;
  port?: string;
  portMetadata?: Metadata;
}) {
  const name = options?.name ?? "TaggedPort";
  const port = options?.port ?? "8080";
  const portMetadata = options?.portMetadata ?? metadataNamed("PortSource");
  return taggedProvider({
    name,
    data: {
      default: {
        app: {
          port,
        },
      },
    },
    rules: [{ path: "app.port", metadata: portMetadata, mode: "node" }],
  });
}
