import { describe, expect, it } from "vitest";
import { createQueryRuntime, resolveRegistry } from "../src/index.js";
import type { SQLPlan } from "../src/index.js";

describe("createQueryRuntime", () => {
  it("runs a parameterized query through the executor and validates rows", async () => {
    let executedPlan: SQLPlan | undefined;
    const runtime = createQueryRuntime({
      db: {},
      physicalRegistry: physicalRegistry,
      defaults,
      policy,
      dialect: "mysql",
      executor: ({ plan }) => {
        executedPlan = plan;
        return [{ name: "Homepage Hero", budget: 15000 }];
      },
    });

    const result = await runtime.run({
      spec: {
        version: "v1",
        source: "placement",
        select: ["name", "budget"],
        where: { field: "budget", op: "gte", value: { $param: "minBudget" } },
        limit: { $param: "limit" },
      },
      params: {
        minBudget: 10000,
        limit: 25,
      },
      explain: true,
    });

    expect(executedPlan?.params).toEqual([10000, 25]);
    expect(result.rows).toEqual([{ name: "Homepage Hero", budget: 15000 }]);
    expect(result.explain.sqlPlan).toEqual(executedPlan);
    expect(result.explain.ir.joins).toEqual([]);
  });
});

const physicalRegistry = {
  version: "v1",
  sources: {
    placements: {
      kind: "table",
      name: "placements",
      fields: {
        id: { type: "string", nullable: false },
        name: { type: "string", nullable: false },
        budgetCents: { type: "number", nullable: false },
      },
    },
  },
} as const;

const defaults = {
  exposure: "deny-by-default",
  source: { maxLimit: 100 },
  field: { selectable: true, filterable: false, sortable: false, operators: "byType" },
} as const;

const policy = {
  version: "v1",
  sources: {
    placements: {
      expose: true,
      exposeAs: "placement",
      fields: {
        name: { expose: true },
        budgetCents: {
          expose: true,
          exposeAs: "budget",
          filterable: true,
          operators: ["gte"],
        },
      },
    },
  },
} as const satisfies Parameters<typeof resolveRegistry>[0]["policy"];
