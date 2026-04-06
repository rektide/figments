import { FigmentAggregateError, FigmentError } from "../../src/core/error.ts";
import { metadataFromFile, metadataNamed } from "../../src/core/metadata.ts";
import type { ProfileMap } from "../../src/core/types.ts";
import type { Provider } from "../../src/provider.ts";

export class ThrowingMessageProvider implements Provider {
  public metadata() {
    return metadataFromFile("FixtureFileProvider", "Missing.toml");
  }

  public data(): ProfileMap {
    throw new Error("load exploded");
  }
}

export class ThrowingAggregateProvider implements Provider {
  public metadata() {
    return metadataNamed("AggregateProvider");
  }

  public data(): ProfileMap {
    throw new FigmentAggregateError(
      [FigmentError.message("provider-first"), FigmentError.message("provider-second")],
      "provider failure chain",
    );
  }
}
