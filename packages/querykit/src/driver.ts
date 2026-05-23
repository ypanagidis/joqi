import type { Effect } from "effect";
import type {
  AuthorizationError,
  InvalidSpecError,
  LoweringError,
  PlanningError,
  QueryExecutionError,
  RenderError,
} from "./errors.js";
import type {
  BuilderManifest,
  DriverContext,
  ExplainTrace,
  LoweredQuery,
  QueryResultSet,
} from "./model.js";

export type QueryDriver<TSpec = unknown, TPlan = unknown, TOutput = unknown> = {
  key: string;
  version: string;
  parse: (input: unknown) => TSpec;
  authorize?: (ctx: DriverContext, spec: TSpec) => Promise<void> | void;
  plan: (ctx: DriverContext, spec: TSpec) => Promise<TPlan> | TPlan;
  lower: (ctx: DriverContext, plan: TPlan) => Promise<LoweredQuery[]> | LoweredQuery[];
  render: (
    ctx: DriverContext,
    args: {
      spec: TSpec;
      plan: TPlan;
      results: QueryResultSet[];
      trace: ExplainTrace;
    },
  ) => Promise<TOutput> | TOutput;
  getBuilderManifest?: (ctx: DriverContext) => Promise<BuilderManifest> | BuilderManifest;
};

export type AnyQueryDriver = QueryDriver<any, any, any>;

export type EffectQueryDriver<TSpec = unknown, TPlan = unknown, TOutput = unknown, R = never> = {
  key: string;
  version: string;
  parse: (input: unknown) => Effect.Effect<TSpec, InvalidSpecError, R>;
  authorize?: (ctx: DriverContext, spec: TSpec) => Effect.Effect<void, AuthorizationError, R>;
  plan: (ctx: DriverContext, spec: TSpec) => Effect.Effect<TPlan, PlanningError, R>;
  lower: (ctx: DriverContext, plan: TPlan) => Effect.Effect<LoweredQuery[], LoweringError, R>;
  render: (
    ctx: DriverContext,
    args: {
      spec: TSpec;
      plan: TPlan;
      results: QueryResultSet[];
      trace: ExplainTrace;
    },
  ) => Effect.Effect<TOutput, RenderError, R>;
  getBuilderManifest?: (ctx: DriverContext) => Effect.Effect<BuilderManifest, never, R>;
};

export type AnyEffectQueryDriver<R = never> = EffectQueryDriver<any, any, any, R>;

export type QueryEngine = {
  execute: (query: LoweredQuery, ctx: DriverContext) => Promise<QueryResultSet> | QueryResultSet;
};

export type EffectQueryEngine<R = never> = {
  execute: (
    query: LoweredQuery,
    ctx: DriverContext,
  ) => Effect.Effect<QueryResultSet, QueryExecutionError, R>;
};

export const defineDriver = <TSpec, TPlan, TOutput>(
  driver: QueryDriver<TSpec, TPlan, TOutput>,
): QueryDriver<TSpec, TPlan, TOutput> => driver;

export const defineEffectDriver = <TSpec, TPlan, TOutput, R = never>(
  driver: EffectQueryDriver<TSpec, TPlan, TOutput, R>,
): EffectQueryDriver<TSpec, TPlan, TOutput, R> => driver;
