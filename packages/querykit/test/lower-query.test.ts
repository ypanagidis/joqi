import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  lowerQuerySpecToIR,
  lowerQuerySpecToIREffect,
  lowerQuerySpecToIRPromise,
  QueryValidationError,
  resolveRegistry,
} from "../src/index.js";

describe("lowerQuerySpecToIR", () => {
  it("lowers a valid query into field refs and deduplicated joins", () => {
    const registry = makeRegistry();
    const query = {
      version: "v1",
      source: "placement",
      select: ["name", "budget", "campaign.name"],
      where: {
        and: [
          { field: "budget", op: "gte", value: 10000 },
          { field: "campaign.name", op: "contains", value: "spring" },
        ],
      },
      groupBy: ["campaign.name"],
      orderBy: [
        { field: "budget", direction: "desc" },
        { field: "campaign.name", direction: "asc" },
      ],
      limit: 25,
      offset: 10,
    };

    expect(lowerQuerySpecToIR({ query, registry })).toEqual({
      kind: "select",
      source: {
        publicName: "placement",
        physicalSource: "placements",
      },
      select: [
        {
          path: "name",
          source: { publicName: "placement", physicalSource: "placements" },
          field: { publicName: "name", physicalField: "name" },
          type: "string",
          nullable: false,
        },
        {
          path: "budget",
          source: { publicName: "placement", physicalSource: "placements" },
          field: { publicName: "budget", physicalField: "budgetCents" },
          type: "number",
          nullable: false,
        },
        {
          path: "campaign.name",
          source: { publicName: "campaign", physicalSource: "campaigns" },
          field: { publicName: "name", physicalField: "name" },
          type: "string",
          nullable: false,
        },
      ],
      joins: [
        {
          path: "campaign",
          relation: {
            publicName: "campaign",
            physicalRelation: "campaign",
          },
          kind: "one",
          from: {
            publicName: "placement",
            physicalSource: "placements",
          },
          to: {
            publicName: "campaign",
            physicalSource: "campaigns",
          },
          localFields: ["campaignId"],
          foreignFields: ["id"],
        },
      ],
      where: {
        and: [
          {
            field: {
              path: "budget",
              source: { publicName: "placement", physicalSource: "placements" },
              field: { publicName: "budget", physicalField: "budgetCents" },
              type: "number",
              nullable: false,
            },
            op: "gte",
            value: 10000,
          },
          {
            field: {
              path: "campaign.name",
              source: { publicName: "campaign", physicalSource: "campaigns" },
              field: { publicName: "name", physicalField: "name" },
              type: "string",
              nullable: false,
            },
            op: "contains",
            value: "spring",
          },
        ],
      },
      groupBy: [
        {
          path: "campaign.name",
          source: { publicName: "campaign", physicalSource: "campaigns" },
          field: { publicName: "name", physicalField: "name" },
          type: "string",
          nullable: false,
        },
      ],
      orderBy: [
        {
          field: {
            path: "budget",
            source: { publicName: "placement", physicalSource: "placements" },
            field: { publicName: "budget", physicalField: "budgetCents" },
            type: "number",
            nullable: false,
          },
          direction: "desc",
        },
        {
          field: {
            path: "campaign.name",
            source: { publicName: "campaign", physicalSource: "campaigns" },
            field: { publicName: "name", physicalField: "name" },
            type: "string",
            nullable: false,
          },
          direction: "asc",
        },
      ],
      limit: 25,
      offset: 10,
    });
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

    const ir = lowerQuerySpecToIR(input);

    await expect(lowerQuerySpecToIRPromise(input)).resolves.toEqual(ir);
    await expect(Effect.runPromise(lowerQuerySpecToIREffect(input))).resolves.toEqual(ir);
  });

  it("fails with validation errors for invalid queries", async () => {
    const error = await Effect.runPromise(
      lowerQuerySpecToIREffect({
        query: {
          version: "v1",
          source: "missing",
          select: ["name"],
        },
        registry: makeRegistry(),
      }).pipe(Effect.flip),
    );

    expect(error).toBeInstanceOf(QueryValidationError);
    expect(error._tag).toBe("QueryValidationError");
    expect((error as QueryValidationError).issues).toEqual([
      { code: "unknown_source", source: "missing" },
    ]);
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
              name: { expose: true },
              budgetCents: {
                expose: true,
                exposeAs: "budget",
                filterable: true,
                sortable: true,
                groupable: true,
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
              name: { expose: true, filterable: true, sortable: true, groupable: true },
            },
          },
        },
      },
    ],
  });
