import { Effect } from "effect";
import {
  AuthorizationError,
  InvalidSpecError,
  LoweringError,
  PlanningError,
  QueryExecutionError,
  RenderError,
} from "./errors.js";
import type {
  AnyQueryDriver,
  EffectQueryDriver,
  EffectQueryEngine,
  QueryEngine,
} from "./driver.js";
import { createEffectQueryRuntime } from "./effect-runtime.js";
import type { BuilderManifest, BuilderManifestInput, RunInput, RunResult } from "./model.js";

export type RuntimeConfig = {
  engine: QueryEngine;
  drivers: ReadonlyArray<AnyQueryDriver>;
  redactParams?: (params: Record<string, unknown>) => Record<string, unknown>;
};

export type PromiseQueryRuntime = {
  run: (input: RunInput) => Promise<RunResult>;
  explain: (input: Omit<RunInput, "explain">) => Promise<NonNullable<RunResult["trace"]>>;
  getBuilderManifest: (input: BuilderManifestInput) => Promise<BuilderManifest>;
};

export const createQueryRuntime = (config: RuntimeConfig): PromiseQueryRuntime => {
  const effectRuntime = createEffectQueryRuntime({
    engine: adaptEngine(config.engine),
    drivers: config.drivers.map(adaptDriver),
    ...(config.redactParams ? { redactParams: config.redactParams } : {}),
  });

  return {
    run: (input) => Effect.runPromise(effectRuntime.run(input)),
    explain: (input) => Effect.runPromise(effectRuntime.explain(input)),
    getBuilderManifest: (input) => Effect.runPromise(effectRuntime.getBuilderManifest(input)),
  };
};

const adaptEngine = (engine: QueryEngine): EffectQueryEngine => ({
  execute: (query, ctx) =>
    Effect.tryPromise({
      try: () => Promise.resolve(engine.execute(query, ctx)),
      catch: (cause) => new QueryExecutionError("Query execution failed", { cause }),
    }),
});

const adaptDriver = (driver: AnyQueryDriver): EffectQueryDriver => {
  const effectDriver: EffectQueryDriver = {
    key: driver.key,
    version: driver.version,
    parse: (input) =>
      Effect.try({
        try: () => driver.parse(input),
        catch: (cause) => new InvalidSpecError("Invalid query spec", { cause }),
      }),
    plan: (ctx, spec) =>
      Effect.tryPromise({
        try: () => Promise.resolve(driver.plan(ctx, spec)),
        catch: (cause) => new PlanningError("Query planning failed", { cause }),
      }),
    lower: (ctx, plan) =>
      Effect.tryPromise({
        try: () => Promise.resolve(driver.lower(ctx, plan)),
        catch: (cause) => new LoweringError("Query lowering failed", { cause }),
      }),
    render: (ctx, args) =>
      Effect.tryPromise({
        try: () => Promise.resolve(driver.render(ctx, args)),
        catch: (cause) => new RenderError("Query rendering failed", { cause }),
      }),
  };

  if (driver.authorize) {
    const authorize = driver.authorize;
    effectDriver.authorize = (ctx, spec) =>
      Effect.tryPromise({
        try: () => Promise.resolve(authorize(ctx, spec)),
        catch: (cause) => new AuthorizationError("Query authorization failed", { cause }),
      });
  }

  if (driver.getBuilderManifest) {
    const getBuilderManifest = driver.getBuilderManifest;
    effectDriver.getBuilderManifest = (ctx) =>
      Effect.promise(() => Promise.resolve(getBuilderManifest(ctx)));
  }

  return effectDriver;
};
