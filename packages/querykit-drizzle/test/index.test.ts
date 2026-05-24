import type { BuildQueryConfig, SQL } from "drizzle-orm/sql";
import { defineRelations } from "drizzle-orm/relations";
import { int, mysqlEnum, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { describe, expect, it, vi } from "vitest";

import type { SQLPlan } from "@ypanagidis/querykit";
import {
  createPhysicalRegistryFromDrizzle,
  createPhysicalRegistryFromDrizzleRelations,
  DrizzleExecutionError,
  executeSQLPlanWithDrizzle,
  sqlPlanToDrizzleSQL,
} from "../src/index.js";

describe("Drizzle physical registry creation", () => {
  it("creates a PhysicalRegistry from Drizzle tables and rc3 relations", () => {
    const physical = createPhysicalRegistryFromDrizzle({
      schema: testSchema,
      relations: (r) => ({
        placements: {
          campaign: r.one.campaigns({
            from: r.placements.campaignId,
            to: r.campaigns.id,
          }),
        },
        campaigns: {
          owner: r.one.users({
            from: r.campaigns.ownerUserId,
            to: r.users.id,
          }),
        },
      }),
    });

    expect(physical.sources.placements).toMatchObject({
      kind: "table",
      name: "placements",
      primaryKey: ["id"],
      fields: {
        id: { type: "string", nullable: false },
        name: { type: "string", nullable: false },
        status: {
          type: "enum",
          nullable: false,
          enumValues: ["active", "paused", "archived"],
        },
        budgetCents: { type: "number", nullable: false },
        campaignId: { type: "string", nullable: false },
      },
      relations: {
        campaign: {
          kind: "one",
          target: "campaigns",
          localFields: ["campaignId"],
          foreignFields: ["id"],
          nullable: true,
        },
      },
    });
    expect(physical.sources.campaigns?.relations?.owner).toMatchObject({
      kind: "one",
      target: "users",
      localFields: ["ownerUserId"],
      foreignFields: ["id"],
    });
    expect(physical.sources.users?.fields.displayName).toMatchObject({
      type: "string",
      nullable: true,
    });
  });

  it("creates a PhysicalRegistry from pre-built Drizzle relations", () => {
    const relations = defineRelations(testSchema, (r) => ({
      placements: {
        campaign: r.one.campaigns({
          from: r.placements.campaignId,
          to: r.campaigns.id,
        }),
      },
    }));

    expect(
      createPhysicalRegistryFromDrizzleRelations(relations).sources.placements?.relations,
    ).toMatchObject({
      campaign: {
        target: "campaigns",
        localFields: ["campaignId"],
        foreignFields: ["id"],
      },
    });
  });
});

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

const users = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  displayName: varchar("displayName", { length: 255 }),
});

const campaigns = mysqlTable("campaigns", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  ownerUserId: varchar("ownerUserId", { length: 36 })
    .notNull()
    .references(() => users.id),
});

const placements = mysqlTable("placements", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["active", "paused", "archived"]).notNull(),
  budgetCents: int("budgetCents").notNull(),
  campaignId: varchar("campaignId", { length: 36 })
    .notNull()
    .references(() => campaigns.id),
});

const testSchema = {
  users,
  campaigns,
  placements,
};
