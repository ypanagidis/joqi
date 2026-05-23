import { Effect } from "effect";
import {
  DriverNotFoundError,
  DuplicateDriverError,
  QueryExecutionError,
  type RunDriverError,
} from "./errors.js";
import type { AnyEffectQueryDriver, EffectQueryEngine } from "./driver.js";
import type {
  BuilderManifest,
  BuilderManifestInput,
  DriverContext,
  ExplainStep,
  ExplainTrace,
  LoweredQuery,
  QueryResultSet,
  RunInput,
  RunResult,
} from "./model.js";

export type EffectRuntimeConfig<R = never> = {
  engine: EffectQueryEngine<R>;
  drivers: ReadonlyArray<AnyEffectQueryDriver<R>>;
  redactParams?: (params: Record<string, unknown>) => Record<string, unknown>;
};

export type QueryRuntime<R = never> = {
  run: (input: RunInput) => Effect.Effect<RunResult, RunDriverError, R>;
  explain: (input: Omit<RunInput, "explain">) => Effect.Effect<ExplainTrace, RunDriverError, R>;
  getBuilderManifest: (
    input: BuilderManifestInput,
  ) => Effect.Effect<BuilderManifest, RunDriverError, R>;
};

export type DriverRegistry<R = never> = ReadonlyMap<string, AnyEffectQueryDriver<R>>;

export type QueryEngine<R = never> = EffectQueryEngine<R>;

export const createEffectQueryRuntime = <R = never>(
  config: EffectRuntimeConfig<R>,
): QueryRuntime<R> => {
  const registry = buildRegistry(config.drivers);

  const getDriver = (key: string) =>
    Effect.fromNullable(registry.get(key)).pipe(
      Effect.mapError(() => new DriverNotFoundError(key)),
    );

  const run = (input: RunInput): Effect.Effect<RunResult, RunDriverError, R> =>
    Effect.gen(function* () {
      const driver = yield* getDriver(input.driver);
      const ctx = input.context ?? {};
      const trace: ExplainTrace = {
        driver: driver.key,
        driverVersion: driver.version,
        steps: [],
      };

      const spec = yield* recordStep(trace, "parse", () => driver.parse(input.spec));

      if (driver.authorize) {
        yield* recordStep(trace, "authorize", () => driver.authorize?.(ctx, spec) ?? Effect.void);
      }

      const plan = yield* recordStep(trace, "plan", () => driver.plan(ctx, spec));
      const loweredQueries = yield* recordStep(
        trace,
        "lower",
        () => driver.lower(ctx, plan),
        (queries) => ({
          queries: queries.map((query) => query.id),
        }),
      );
      const results = yield* executeQueries(config.engine, ctx, loweredQueries, trace);
      const data = yield* recordStep(trace, "render", () =>
        driver.render(ctx, {
          spec,
          plan,
          results,
          trace,
        }),
      );

      return input.explain ? { data, trace } : { data };
    });

  return {
    run,
    explain: (input) =>
      run({ ...input, explain: true }).pipe(Effect.map((result) => result.trace!)),
    getBuilderManifest: (input) =>
      Effect.gen(function* () {
        const driver = yield* getDriver(input.driver);

        if (!driver.getBuilderManifest) {
          return {};
        }

        return yield* driver.getBuilderManifest(input.context ?? {});
      }),
  };
};

const buildRegistry = <R>(drivers: ReadonlyArray<AnyEffectQueryDriver<R>>): DriverRegistry<R> => {
  const registry = new Map<string, AnyEffectQueryDriver<R>>();

  for (const driver of drivers) {
    if (registry.has(driver.key)) {
      throw new DuplicateDriverError(driver.key);
    }

    registry.set(driver.key, driver);
  }

  return registry;
};

const recordStep = <A, E extends RunDriverError, R>(
  trace: ExplainTrace,
  name: ExplainStep["name"],
  run: () => Effect.Effect<A, E, R>,
  summarize?: (value: A) => Record<string, unknown>,
): Effect.Effect<A, E, R> => {
  const startedAt = Date.now();

  return run().pipe(
    Effect.tap((value) =>
      Effect.sync(() => {
        const step: ExplainStep = {
          name,
          status: "ok",
          timingMs: Date.now() - startedAt,
        };

        if (summarize) {
          step.summary = summarize(value);
        }

        trace.steps.push(step);
      }),
    ),
    Effect.tapError(() =>
      Effect.sync(() => {
        trace.steps.push({
          name,
          status: "error",
          timingMs: Date.now() - startedAt,
        });
      }),
    ),
  );
};

const executeQueries = <R>(
  engine: EffectQueryEngine<R>,
  ctx: DriverContext,
  queries: LoweredQuery[],
  trace: ExplainTrace,
): Effect.Effect<QueryResultSet[], QueryExecutionError, R> =>
  recordStep(trace, "execute", () =>
    Effect.forEach(queries, (query) => engine.execute(query, ctx), {
      concurrency: "unbounded",
    }),
  );
