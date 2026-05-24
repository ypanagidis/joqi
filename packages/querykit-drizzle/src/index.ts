import { sql, type SQL } from "drizzle-orm/sql";

import type { SQLPlan } from "@ypanagidis/querykit";

export type DrizzleExecutor<TResult = unknown> = {
  readonly execute: (query: SQL) => TResult | Promise<TResult>;
};

export type ExecuteSQLPlanWithDrizzleInput<TResult = unknown> = {
  readonly db: DrizzleExecutor<TResult>;
  readonly plan: SQLPlan;
};

export class DrizzleExecutionError extends Error {
  override readonly cause: unknown;
  readonly sql: string;

  constructor(input: { readonly sql: string; readonly cause: unknown }) {
    super("Drizzle SQLPlan execution failed", { cause: input.cause });
    this.name = "DrizzleExecutionError";
    this.cause = input.cause;
    this.sql = input.sql;
  }
}

export const sqlPlanToDrizzleSQL = (plan: SQLPlan): SQL => {
  const textParts = plan.sql.split("?");

  if (textParts.length - 1 !== plan.params.length) {
    throw new Error("SQLPlan placeholder count does not match params count");
  }

  return sql.join(
    textParts.flatMap((textPart, index) => {
      if (index === plan.params.length) {
        return [sql.raw(textPart)];
      }

      return [sql.raw(textPart), sql.param(plan.params[index])];
    }),
  );
};

export const executeSQLPlanWithDrizzle = async <TResult = unknown>(
  input: ExecuteSQLPlanWithDrizzleInput<TResult>,
): Promise<Awaited<TResult>> => {
  try {
    return await input.db.execute(sqlPlanToDrizzleSQL(input.plan));
  } catch (cause) {
    throw new DrizzleExecutionError({ sql: input.plan.sql, cause });
  }
};
