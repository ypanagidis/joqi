import { Effect } from "effect";
import type * as Either from "effect/Either";

import {
  lowerQuerySpecToIREffect,
  type LowerQuerySpecError,
  type LowerQuerySpecInput,
  type QueryIR,
  type QueryIRFieldRef,
  type QueryIRFilter,
} from "../../query/lower.js";
import type { JsonValue, QueryFilterOperator } from "../../specs/query.js";
import { mysqlDialectCompiler } from "./dialects/mysql.js";
import { postgresDialectCompiler } from "./dialects/postgres.js";
import { sqliteDialectCompiler } from "./dialects/sqlite.js";
import type { SQLDialect, SQLDialectCompiler, SQLPlan } from "./types.js";

export type { SQLDialect, SQLPlan } from "./types.js";

export type CompileQuerySpecToSQLInput = LowerQuerySpecInput & {
  readonly dialect?: SQLDialect;
};

export type CompileQuerySpecToSQLError = LowerQuerySpecError;

export const compileQuerySpecToSQLEffect: (
  input: CompileQuerySpecToSQLInput,
) => Effect.Effect<SQLPlan, CompileQuerySpecToSQLError> = Effect.fn("compileQuerySpecToSQL")(
  function* (input: CompileQuerySpecToSQLInput) {
    const ir = yield* lowerQuerySpecToIREffect(input);

    return compileIRToSQL(ir, dialectCompilerFor(input.dialect ?? "mysql"));
  },
);

export const compileQuerySpecToSQL = (input: CompileQuerySpecToSQLInput): SQLPlan =>
  unwrapCompileQuerySpecToSQLResult(
    Effect.runSync(Effect.either(compileQuerySpecToSQLEffect(input))),
  );

export const compileQuerySpecToSQLPromise = async (
  input: CompileQuerySpecToSQLInput,
): Promise<SQLPlan> =>
  unwrapCompileQuerySpecToSQLResult(
    await Effect.runPromise(Effect.either(compileQuerySpecToSQLEffect(input))),
  );

type SQLCompileContext = {
  readonly compiler: SQLDialectCompiler;
  readonly params: JsonValue[];
  readonly aliasesByPath: Map<string, string>;
};

const dialectCompilers = {
  mysql: mysqlDialectCompiler,
  postgres: postgresDialectCompiler,
  sqlite: sqliteDialectCompiler,
} satisfies Record<SQLDialect, SQLDialectCompiler>;

const dialectCompilerFor = (dialect: SQLDialect): SQLDialectCompiler => dialectCompilers[dialect];

const unwrapCompileQuerySpecToSQLResult = (
  result: Either.Either<SQLPlan, CompileQuerySpecToSQLError>,
): SQLPlan => {
  if (result._tag === "Left") {
    throw result.left;
  }

  return result.right;
};

const compileIRToSQL = (ir: QueryIR, compiler: SQLDialectCompiler): SQLPlan => {
  const context: SQLCompileContext = {
    compiler,
    params: [],
    aliasesByPath: new Map([["", "t0"]]),
  };

  ir.joins.forEach((join, index) => {
    context.aliasesByPath.set(join.path, `t${index + 1}`);
  });

  const sqlParts = [
    compileSelect(ir, context),
    `from ${quoteIdentifier(context, ir.source.physicalSource)} as ${quoteIdentifier(context, "t0")}`,
    ...ir.joins.map((join) => {
      const fromAlias = aliasForPath(context, parentPath(join.path));
      const toAlias = aliasForPath(context, join.path);
      const on = join.localFields
        .map(
          (localField, index) =>
            `${quoteIdentifier(context, fromAlias)}.${quoteIdentifier(context, localField)} = ${quoteIdentifier(
              context,
              toAlias,
            )}.${quoteIdentifier(context, join.foreignFields[index]!)}`,
        )
        .join(" and ");

      return `left join ${quoteIdentifier(context, join.to.physicalSource)} as ${quoteIdentifier(
        context,
        toAlias,
      )} on ${on}`;
    }),
    ...(ir.where === undefined ? [] : [`where ${compileFilter(context, ir.where)}`]),
    ...(ir.groupBy.length === 0
      ? []
      : [`group by ${ir.groupBy.map((field) => compileFieldRef(context, field)).join(", ")}`]),
    ...(ir.orderBy.length === 0
      ? []
      : [
          `order by ${ir.orderBy
            .map((orderBy) => `${compileFieldRef(context, orderBy.field)} ${orderBy.direction}`)
            .join(", ")}`,
        ]),
    ...(ir.limit === undefined ? [] : [`limit ${addParam(context, ir.limit)}`]),
    ...(ir.offset === undefined ? [] : [`offset ${addParam(context, ir.offset)}`]),
  ];

  return {
    dialect: compiler.dialect,
    sql: sqlParts.join("\n"),
    params: context.params,
  };
};

const compileSelect = (ir: QueryIR, context: SQLCompileContext): string =>
  `select ${ir.select
    .map((field) => `${compileFieldRef(context, field)} as ${quoteIdentifier(context, field.path)}`)
    .join(", ")}`;

const compileFilter = (context: SQLCompileContext, filter: QueryIRFilter): string => {
  if ("and" in filter) {
    return filter.and.map((child) => `(${compileFilter(context, child)})`).join(" and ");
  }

  if ("or" in filter) {
    return filter.or.map((child) => `(${compileFilter(context, child)})`).join(" or ");
  }

  return compilePredicate(context, filter.field, filter.op, filter.value);
};

const compilePredicate = (
  context: SQLCompileContext,
  field: QueryIRFieldRef,
  operator: QueryFilterOperator,
  value: JsonValue | undefined,
): string => {
  const fieldRef = compileFieldRef(context, field);

  switch (operator) {
    case "eq":
      if (value === null) {
        return `${fieldRef} is null`;
      }
      return `${fieldRef} = ${addParam(context, value ?? null)}`;
    case "neq":
      if (value === null) {
        return `${fieldRef} is not null`;
      }
      return `${fieldRef} <> ${addParam(context, value ?? null)}`;
    case "gt":
      return `${fieldRef} > ${addParam(context, value ?? null)}`;
    case "gte":
      return `${fieldRef} >= ${addParam(context, value ?? null)}`;
    case "lt":
      return `${fieldRef} < ${addParam(context, value ?? null)}`;
    case "lte":
      return `${fieldRef} <= ${addParam(context, value ?? null)}`;
    case "in":
      return `${fieldRef} in (${compileInList(context, value)})`;
    case "contains":
      return `${fieldRef} like ${addParam(
        context,
        `%${escapeLikePattern(stringValue(value))}%`,
      )}${context.compiler.likeEscapeSql}`;
    case "startsWith":
      return `${fieldRef} like ${addParam(
        context,
        `${escapeLikePattern(stringValue(value))}%`,
      )}${context.compiler.likeEscapeSql}`;
    case "endsWith":
      return `${fieldRef} like ${addParam(
        context,
        `%${escapeLikePattern(stringValue(value))}`,
      )}${context.compiler.likeEscapeSql}`;
    case "isNull":
      return `${fieldRef} is null`;
    case "isNotNull":
      return `${fieldRef} is not null`;
  }
};

const compileInList = (context: SQLCompileContext, value: JsonValue | undefined): string => {
  if (!Array.isArray(value) || value.length === 0) {
    return "null";
  }

  return value.map((item) => addParam(context, item)).join(", ");
};

const compileFieldRef = (context: SQLCompileContext, field: QueryIRFieldRef): string => {
  const fieldRelationPath = parentPath(field.path);
  const alias = aliasForPath(context, fieldRelationPath);

  return `${quoteIdentifier(context, alias)}.${quoteIdentifier(context, field.field.physicalField)}`;
};

const addParam = (context: SQLCompileContext, value: JsonValue): string => {
  context.params.push(value);
  return context.compiler.placeholder(context.params.length);
};

const aliasForPath = (context: SQLCompileContext, path: string): string =>
  context.aliasesByPath.get(path)!;

const parentPath = (path: string): string => {
  const parts = path.split(".");
  parts.pop();

  return parts.join(".");
};

const quoteIdentifier = (context: SQLCompileContext, identifier: string): string =>
  context.compiler.quoteIdentifier(identifier);

const stringValue = (value: JsonValue | undefined): string => {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
};

const escapeLikePattern = (value: string): string => value.replaceAll(/([\\%_])/g, "\\$1");
