import type { BuildQueryConfig, SQL } from "drizzle-orm/sql";
import { describe, expect, it, vi } from "vitest";

import type { SQLPlan } from "@ypanagidis/querykit";
import {
  DrizzleExecutionError,
  executeSQLPlanWithDrizzle,
  sqlPlanToDrizzleSQL,
} from "../src/index.js";

describe("Drizzle SQLPlan execution", () => {
  it("converts SQLPlan placeholders into Drizzle params", () => {
    const query = sqlPlanToDrizzleSQL(makePlan()).toQuery(mysqlQueryConfig);

    expect(query).toEqual({
      sql: "select `t0`.`name` from `placements` as `t0` where `t0`.`status` = ? limit ?",
      params: ["active", 25],
    });
  });

  it("executes SQLPlan through a Drizzle-compatible db", async () => {
    const rows = [{ name: "Spring Placement" }];
    const execute = vi.fn(async (query: SQL) => ({
      rows,
      query: query.toQuery(mysqlQueryConfig),
    }));

    const result = await executeSQLPlanWithDrizzle({
      db: { execute },
      plan: makePlan(),
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(result).toEqual({
      rows,
      query: {
        sql: "select `t0`.`name` from `placements` as `t0` where `t0`.`status` = ? limit ?",
        params: ["active", 25],
      },
    });
  });

  it("wraps execution failures in DrizzleExecutionError", async () => {
    const cause = new Error("database unavailable");

    await expect(
      executeSQLPlanWithDrizzle({
        db: {
          execute: async () => {
            throw cause;
          },
        },
        plan: makePlan(),
      }),
    ).rejects.toMatchObject({
      name: "DrizzleExecutionError",
      cause,
      sql: makePlan().sql,
    });
  });

  it("rejects malformed SQLPlan placeholder counts", () => {
    expect(() =>
      sqlPlanToDrizzleSQL({
        dialect: "mysql",
        sql: "select ? ?",
        params: ["one"],
      }),
    ).toThrow("SQLPlan placeholder count does not match params count");
  });

  it("exports the execution error class", () => {
    expect(new DrizzleExecutionError({ sql: "select 1", cause: "boom" })).toBeInstanceOf(Error);
  });
});

const makePlan = (): SQLPlan => ({
  dialect: "mysql",
  sql: "select `t0`.`name` from `placements` as `t0` where `t0`.`status` = ? limit ?",
  params: ["active", 25],
});

const mysqlQueryConfig: BuildQueryConfig = {
  escapeName: (name) => `\`${name.replaceAll("`", "``")}\``,
  escapeParam: () => "?",
  escapeString: (value) => `'${value.replaceAll("'", "''")}'`,
};
