import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  QueryPlanSchema,
  createQueryRuntime,
  defineDriver,
  q,
  type QueryEngine,
  type QueryPlan,
} from "../src/index.js";
import { createEffectQueryRuntime, defineEffectDriver } from "../src/effect.js";

describe("createQueryRuntime", () => {
  it("runs a Promise driver through the Effect-backed runtime", async () => {
    const engine: QueryEngine = {
      execute(query, ctx) {
        expect(ctx.organizationId).toBe("org_1");

        return {
          queryId: query.id,
          rows: [{ id: "row_1" }],
        };
      },
    };

    const driver = defineDriver({
      key: "dashboard",
      version: "v1",
      parse(input) {
        if (typeof input !== "object" || input === null || !("title" in input)) {
          throw new Error("Expected dashboard spec");
        }

        return input as { title: string };
      },
      authorize(ctx, spec) {
        expect(ctx.organizationId).toBe("org_1");
        expect(spec.title).toBe("Revenue");
      },
      plan(_ctx, spec) {
        return { title: spec.title };
      },
      lower(_ctx, plan) {
        return [
          {
            kind: "query-plan",
            id: "metric-card",
            plan: makePlan(plan.title),
            params: { status: "active" },
          },
        ];
      },
      render(_ctx, { results, trace }) {
        return {
          rows: results[0]?.rows ?? [],
          steps: trace.steps.map((step) => step.name),
        };
      },
      getBuilderManifest() {
        return {
          driver: "dashboard",
          widgets: [{ type: "metric-card", label: "Metric Card" }],
        };
      },
    });

    const runtime = createQueryRuntime({ engine, drivers: [driver] });

    const result = await runtime.run({
      driver: "dashboard",
      spec: { title: "Revenue" },
      context: { organizationId: "org_1" },
      explain: true,
    });

    expect(result.data).toEqual({
      rows: [{ id: "row_1" }],
      steps: ["parse", "authorize", "plan", "lower", "execute"],
    });
    expect(result.trace?.steps.map((step) => step.name)).toEqual([
      "parse",
      "authorize",
      "plan",
      "lower",
      "execute",
      "render",
    ]);

    await expect(runtime.getBuilderManifest({ driver: "dashboard" })).resolves.toEqual({
      driver: "dashboard",
      widgets: [{ type: "metric-card", label: "Metric Card" }],
    });
  });
});

describe("createEffectQueryRuntime", () => {
  it("runs an Effect-native driver", async () => {
    const runtime = createEffectQueryRuntime({
      engine: {
        execute: (query) => Effect.succeed({ queryId: query.id, rows: [{ ok: true }] }),
      },
      drivers: [
        defineEffectDriver({
          key: "docgen",
          version: "v1",
          parse: (input) => Effect.succeed(input as { target: string }),
          plan: (_ctx, spec) => Effect.succeed({ target: spec.target }),
          lower: (_ctx, plan) =>
            Effect.succeed([
              {
                kind: "query-plan",
                id: "placeholder-query",
                plan: makePlan(plan.target),
                params: {},
              },
            ]),
          render: (_ctx, { results }) => Effect.succeed({ placeholders: results[0]?.rows ?? [] }),
        }),
      ],
    });

    await expect(
      Effect.runPromise(
        runtime.run({
          driver: "docgen",
          spec: { target: "client_name" },
        }),
      ),
    ).resolves.toEqual({
      data: { placeholders: [{ ok: true }] },
    });
  });
});

describe("query model", () => {
  it("builds query expressions with q helpers", () => {
    expect(
      q.multiply([
        q.divide(q.column("delivery", "spent"), q.column("delivery", "impressions")),
        q.literal(1000),
      ]),
    ).toEqual({
      kind: "multiply",
      expressions: [
        {
          kind: "binary",
          op: "divide",
          left: { kind: "column", table: "delivery", column: "spent" },
          right: { kind: "column", table: "delivery", column: "impressions" },
        },
        { kind: "literal", value: 1000 },
      ],
    });
  });

  it("validates a minimal query plan with Effect Schema", () => {
    const plan = makePlan("placement_name");

    expect(Schema.decodeUnknownSync(QueryPlanSchema)(plan)).toEqual(plan);
  });
});

const makePlan = (alias: string): QueryPlan => ({
  kind: "query-plan",
  from: {
    table: "placements",
    alias: "p",
  },
  select: [
    {
      alias,
      expr: q.column("p", "name"),
    },
  ],
  where: q.eq(q.column("p", "status"), q.param("status")),
  limit: 100,
});
