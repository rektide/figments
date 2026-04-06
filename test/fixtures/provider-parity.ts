export type YamlExtendedCircleFixture = {
  readonly source: string;
  readonly expected: {
    readonly circle1: { readonly x: number; readonly y: number; readonly r: number };
    readonly circle2: { readonly x: number; readonly y: number; readonly r: number };
    readonly circle3: { readonly x: number; readonly y: number; readonly r: number };
  };
};

export function yamlExtendedCircleFixture(): YamlExtendedCircleFixture {
  return {
    source: [
      "point: &POINT { x: 1, y: 2 }",
      "radius: &RADIUS",
      "  r: 10",
      "",
      "circle1:",
      "  <<: *POINT",
      "  r: 3",
      "",
      "circle2:",
      "  <<: [ *POINT, *RADIUS ]",
      "",
      "circle3:",
      "  <<: [ *POINT, *RADIUS ]",
      "  y: 14",
      "  r: 20",
      "",
    ].join("\n"),
    expected: {
      circle1: { x: 1, y: 2, r: 3 },
      circle2: { x: 1, y: 2, r: 10 },
      circle3: { x: 1, y: 14, r: 20 },
    },
  };
}

export type EnvArrayFixture = {
  readonly env: Record<string, string>;
  readonly path: string;
  readonly expected: ReadonlyArray<number>;
};

export function envArrayFixture(): EnvArrayFixture {
  return {
    env: {
      APP_ARRAY_0: "4",
      APP_ARRAY_2: "6",
      APP_ARRAY_1: "5",
    },
    path: "array",
    expected: [4, 5, 6],
  };
}

export type SerializedKeyedFixture = {
  readonly defaults: {
    readonly app: {
      readonly name: string;
      readonly debug: boolean;
    };
  };
  readonly keyedPath: string;
  readonly keyedValue: number;
  readonly expected: {
    readonly app: {
      readonly name: string;
      readonly debug: boolean;
      readonly retries: number;
    };
  };
};

export function serializedKeyedFixture(): SerializedKeyedFixture {
  return {
    defaults: {
      app: {
        name: "demo",
        debug: true,
      },
    },
    keyedPath: "app.retries",
    keyedValue: 3,
    expected: {
      app: {
        name: "demo",
        debug: true,
        retries: 3,
      },
    },
  };
}
