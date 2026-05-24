import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  compileQuerySpecToSQL,
  compileQuerySpecToSQLEffect,
  compileQuerySpecToSQLPromise,
  QueryValidationError,
  resolveRegistry,
} from "../src/index.js";

describe("compileQuerySpecToSQL", () => {
  it("compiles a query with a relation path to a MySQL SQL plan", () => {
    const plan = compileQuerySpecToSQL({
      query: {
        version: "v1",
        source: "placement",
        select: ["name", "budget", "campaign.name"],
        where: {
          and: [
            { field: "budget", op: "gte", value: 10000 },
            { field: "campaign.name", op: "contains", value: "spring" },
          ],
        },
        orderBy: [
          { field: "budget", direction: "desc" },
          { field: "campaign.name", direction: "asc" },
        ],
        limit: 25,
        offset: 10,
      },
      registry: makeRegistry(),
    });

    expect(plan).toEqual({
      dialect: "mysql",
      sql: [
        "select `t0`.`name` as `name`, `t0`.`budgetCents` as `budget`, `t1`.`name` as `campaign.name`",
        "from `placements` as `t0`",
        "left join `campaigns` as `t1` on `t0`.`campaignId` = `t1`.`id`",
        "where (`t0`.`budgetCents` >= ?) and (`t1`.`name` like ? escape '\\')",
        "order by `t0`.`budgetCents` desc, `t1`.`name` asc",
        "limit ?",
        "offset ?",
      ].join("\n"),
      params: [10000, "%spring%", 25, 10],
    });
  });

  it("compiles supported predicate operators with params", () => {
    const plan = compileQuerySpecToSQL({
      query: {
        version: "v1",
        source: "placement",
        select: ["name"],
        where: {
          or: [
            { field: "name", op: "startsWith", value: "spring" },
            { field: "status", op: "in", value: ["active", "paused"] },
            { field: "status", op: "isNotNull" },
          ],
        },
      },
      registry: makeRegistry(),
    });

    expect(plan.sql).toBe(
      [
        "select `t0`.`name` as `name`",
        "from `placements` as `t0`",
        "where (`t0`.`name` like ? escape '\\') or (`t0`.`status` in (?, ?)) or (`t0`.`status` is not null)",
      ].join("\n"),
    );
    expect(plan.params).toEqual(["spring%", "active", "paused"]);
  });

  it("escapes MySQL like wildcards in user values", () => {
    const plan = compileQuerySpecToSQL({
      query: {
        version: "v1",
        source: "placement",
        select: ["name"],
        where: { field: "name", op: "contains", value: "100%_ready" },
      },
      registry: makeRegistry(),
    });

    expect(plan.sql).toBe(
      [
        "select `t0`.`name` as `name`",
        "from `placements` as `t0`",
        "where `t0`.`name` like ? escape '\\'",
      ].join("\n"),
    );
    expect(plan.params).toEqual(["%100\\%\\_ready%"]);
  });

  it("provides Effect and promise facades", async () => {
    const input = {
      query: {
        version: "v1",
        source: "placement",
        select: ["name"],
      },
      registry: makeRegistry(),
    };

    const plan = compileQuerySpecToSQL(input);

    await expect(compileQuerySpecToSQLPromise(input)).resolves.toEqual(plan);
    await expect(Effect.runPromise(compileQuerySpecToSQLEffect(input))).resolves.toEqual(plan);
  });

  it("fails with validation errors for invalid queries", async () => {
    const error = await Effect.runPromise(
      compileQuerySpecToSQLEffect({
        query: {
          version: "v1",
          source: "missing",
          select: ["name"],
        },
        registry: makeRegistry(),
      }).pipe(Effect.flip),
    );

    expect(error).toBeInstanceOf(QueryValidationError);
  });
});

const makeRegistry = () =>
  resolveRegistry({
    physical: {
      version: "v1",
      sources: {
        placements: {
          kind: "table",
          name: "placements",
          fields: {
            id: { type: "string", nullable: false },
            name: { type: "string", nullable: false },
            status: { type: "enum", nullable: false, enumValues: ["active", "paused"] },
            budgetCents: { type: "number", nullable: false },
            campaignId: { type: "string", nullable: false },
          },
          relations: {
            campaign: {
              kind: "one",
              target: "campaigns",
              localFields: ["campaignId"],
              foreignFields: ["id"],
            },
          },
        },
        campaigns: {
          kind: "table",
          name: "campaigns",
          fields: {
            id: { type: "string", nullable: false },
            name: { type: "string", nullable: false },
          },
        },
      },
    },
    defaults: {
      exposure: "deny-by-default",
      source: { maxLimit: 100 },
      field: { selectable: true, filterable: false, sortable: false, operators: "byType" },
      relation: { selectable: false, filterable: false, maxDepth: 1 },
    },
    policies: [
      {
        version: "v1",
        sources: {
          placements: {
            expose: true,
            exposeAs: "placement",
            fields: {
              name: { expose: true, filterable: true, operators: ["contains", "startsWith"] },
              status: { expose: true, filterable: true, operators: ["in", "isNotNull"] },
              budgetCents: {
                expose: true,
                exposeAs: "budget",
                filterable: true,
                sortable: true,
                operators: ["eq", "gt", "gte", "lt", "lte"],
              },
            },
            relations: {
              campaign: {
                expose: true,
                target: "campaign",
                selectable: true,
                filterable: true,
                maxDepth: 1,
              },
            },
          },
          campaigns: {
            expose: true,
            exposeAs: "campaign",
            fields: {
              name: { expose: true, filterable: true, sortable: true },
            },
          },
        },
      },
    ],
  });
