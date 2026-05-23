import { Schema } from "effect";

export type DriverContext = Record<string, unknown>;

export type QuerySource = {
  table: string;
  alias?: string;
};

export type QueryJoin = {
  kind: "inner" | "left";
  source: QuerySource;
  on: QueryExpression;
};

export type QuerySelectItem = {
  alias: string;
  expr: QueryExpression;
};

export type QueryOrderBy = {
  expr: QueryExpression;
  direction: "asc" | "desc";
};

export type QueryExpression =
  | { kind: "column"; table: string; column: string }
  | { kind: "param"; name: string }
  | { kind: "literal"; value: unknown }
  | {
      kind: "binary";
      op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "divide";
      left: QueryExpression;
      right: QueryExpression;
    }
  | { kind: "and"; expressions: ReadonlyArray<QueryExpression> }
  | { kind: "or"; expressions: ReadonlyArray<QueryExpression> }
  | { kind: "aggregate"; op: "sum" | "count" | "avg"; expr: QueryExpression }
  | { kind: "multiply"; expressions: ReadonlyArray<QueryExpression> };

export type QueryPlan = {
  kind: "query-plan";
  from: QuerySource;
  joins?: ReadonlyArray<QueryJoin>;
  select: ReadonlyArray<QuerySelectItem>;
  where?: QueryExpression;
  groupBy?: ReadonlyArray<QueryExpression>;
  orderBy?: ReadonlyArray<QueryOrderBy>;
  limit?: number;
  offset?: number;
};

export type LoweredQuery =
  | {
      kind: "query-plan";
      id: string;
      plan: QueryPlan;
      params: Readonly<Record<string, unknown>>;
    }
  | {
      kind: "trusted-sql";
      id: string;
      sql: unknown;
      params?: Readonly<Record<string, unknown>>;
      outputColumns?: ReadonlyArray<string>;
    };

export type QueryResultSet = {
  queryId: string;
  rows: ReadonlyArray<Record<string, unknown>>;
};

export type BuilderManifest = Record<string, unknown>;

export type ExplainStep = {
  name: "parse" | "authorize" | "plan" | "lower" | "execute" | "render";
  status: "ok" | "error";
  timingMs?: number;
  summary?: Record<string, unknown>;
};

export type ExplainTrace = {
  driver: string;
  driverVersion: string;
  steps: ExplainStep[];
};

export type RunInput = {
  driver: string;
  spec: unknown;
  context?: DriverContext;
  explain?: boolean;
};

export type RunResult<TOutput = unknown> = {
  data: TOutput;
  trace?: ExplainTrace;
};

export type BuilderManifestInput = {
  driver: string;
  context?: DriverContext;
};

const QuerySourceSchema = Schema.Struct({
  table: Schema.String,
  alias: Schema.optional(Schema.String),
});

const QueryExpressionSchema: Schema.Schema<QueryExpression> = Schema.suspend(() =>
  Schema.Union(
    Schema.Struct({
      kind: Schema.Literal("column"),
      table: Schema.String,
      column: Schema.String,
    }),
    Schema.Struct({
      kind: Schema.Literal("param"),
      name: Schema.String,
    }),
    Schema.Struct({
      kind: Schema.Literal("literal"),
      value: Schema.Unknown,
    }),
    Schema.Struct({
      kind: Schema.Literal("binary"),
      op: Schema.Literal("eq", "neq", "gt", "gte", "lt", "lte", "in", "divide"),
      left: QueryExpressionSchema,
      right: QueryExpressionSchema,
    }),
    Schema.Struct({
      kind: Schema.Literal("and"),
      expressions: Schema.Array(QueryExpressionSchema),
    }),
    Schema.Struct({
      kind: Schema.Literal("or"),
      expressions: Schema.Array(QueryExpressionSchema),
    }),
    Schema.Struct({
      kind: Schema.Literal("aggregate"),
      op: Schema.Literal("sum", "count", "avg"),
      expr: QueryExpressionSchema,
    }),
    Schema.Struct({
      kind: Schema.Literal("multiply"),
      expressions: Schema.Array(QueryExpressionSchema),
    }),
  ),
);

export const QueryPlanSchema = Schema.Struct({
  kind: Schema.Literal("query-plan"),
  from: QuerySourceSchema,
  joins: Schema.optional(
    Schema.Array(
      Schema.Struct({
        kind: Schema.Literal("inner", "left"),
        source: QuerySourceSchema,
        on: QueryExpressionSchema,
      }),
    ),
  ),
  select: Schema.Array(
    Schema.Struct({
      alias: Schema.String,
      expr: QueryExpressionSchema,
    }),
  ),
  where: Schema.optional(QueryExpressionSchema),
  groupBy: Schema.optional(Schema.Array(QueryExpressionSchema)),
  orderBy: Schema.optional(
    Schema.Array(
      Schema.Struct({
        expr: QueryExpressionSchema,
        direction: Schema.Literal("asc", "desc"),
      }),
    ),
  ),
  limit: Schema.optional(Schema.Number),
  offset: Schema.optional(Schema.Number),
});

const binary = (
  op: Extract<QueryExpression, { kind: "binary" }>["op"],
  left: QueryExpression,
  right: QueryExpression,
): QueryExpression => ({ kind: "binary", op, left, right });

export const q = {
  column: (table: string, column: string): QueryExpression => ({ kind: "column", table, column }),
  param: (name: string): QueryExpression => ({ kind: "param", name }),
  literal: (value: unknown): QueryExpression => ({ kind: "literal", value }),
  eq: (left: QueryExpression, right: QueryExpression): QueryExpression => binary("eq", left, right),
  neq: (left: QueryExpression, right: QueryExpression): QueryExpression =>
    binary("neq", left, right),
  gt: (left: QueryExpression, right: QueryExpression): QueryExpression => binary("gt", left, right),
  gte: (left: QueryExpression, right: QueryExpression): QueryExpression =>
    binary("gte", left, right),
  lt: (left: QueryExpression, right: QueryExpression): QueryExpression => binary("lt", left, right),
  lte: (left: QueryExpression, right: QueryExpression): QueryExpression =>
    binary("lte", left, right),
  in: (left: QueryExpression, right: QueryExpression): QueryExpression => binary("in", left, right),
  and: (expressions: ReadonlyArray<QueryExpression>): QueryExpression => ({
    kind: "and",
    expressions,
  }),
  or: (expressions: ReadonlyArray<QueryExpression>): QueryExpression => ({
    kind: "or",
    expressions,
  }),
  sum: (expr: QueryExpression): QueryExpression => ({ kind: "aggregate", op: "sum", expr }),
  count: (expr: QueryExpression): QueryExpression => ({ kind: "aggregate", op: "count", expr }),
  avg: (expr: QueryExpression): QueryExpression => ({ kind: "aggregate", op: "avg", expr }),
  divide: (left: QueryExpression, right: QueryExpression): QueryExpression =>
    binary("divide", left, right),
  multiply: (expressions: ReadonlyArray<QueryExpression>): QueryExpression => ({
    kind: "multiply",
    expressions,
  }),
};
