import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  QueryParseError,
  QueryValidationError,
  validateQuerySpec,
  validateQuerySpecEffect,
  validateQuerySpecPromise,
} from "../src/index.js";

describe("validateQuerySpec", () => {
  it("accepts a query using exposed fields and relations", () => {
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
      orderBy: [{ field: "budget", direction: "desc" }],
      limit: 25,
    };

    expect(validateQuerySpec({ query, registry: makeRegistry() })).toEqual(query);
  });

  it("provides Effect and promise facades", async () => {
    const query = {
      version: "v1",
      source: "placement",
      select: ["name"],
    };

    await expect(validateQuerySpecPromise({ query, registry: makeRegistry() })).resolves.toEqual(
      query,
    );
    await expect(
      Effect.runPromise(validateQuerySpecEffect({ query, registry: makeRegistry() })),
    ).resolves.toEqual(query);
  });

  it("fails with typed parse errors", async () => {
    const error = await Effect.runPromise(
      validateQuerySpecEffect({
        query: {
          version: "v1",
          source: "placement",
          select: [],
        },
        registry: makeRegistry(),
      }).pipe(Effect.flip),
    );

    expect(error).toBeInstanceOf(QueryParseError);
    expect(error._tag).toBe("QueryParseError");
    expect((error as QueryParseError).input).toBe("query");
  });

  it("reports unknown sources, fields, relations, limits, and capabilities", () => {
    const error = captureQueryValidationError(() =>
      validateQuerySpec({
        query: {
          version: "v1",
          source: "placement",
          select: ["missing", "privateNote", "missingRelation.name"],
          where: { field: "name", op: "eq", value: "placement" },
          groupBy: ["name"],
          orderBy: [{ field: "name", direction: "asc" }],
          limit: 101,
        },
        registry: makeRegistry(),
      }),
    );

    expect(error.issues).toEqual([
      { code: "limit_exceeds_max", source: "placement", limit: 101, maxLimit: 100 },
      { code: "unknown_field", source: "placement", path: "missing", field: "missing" },
      {
        code: "field_not_selectable",
        source: "placement",
        path: "privateNote",
        field: "privateNote",
      },
      {
        code: "unknown_relation",
        source: "placement",
        path: "missingRelation.name",
        relation: "missingRelation",
      },
      { code: "field_not_filterable", source: "placement", path: "name", field: "name" },
      { code: "field_not_groupable", source: "placement", path: "name", field: "name" },
      { code: "field_not_sortable", source: "placement", path: "name", field: "name" },
    ]);
  });

  it("reports disallowed operators", () => {
    const error = captureQueryValidationError(() =>
      validateQuerySpec({
        query: {
          version: "v1",
          source: "placement",
          select: ["name"],
          where: { field: "budget", op: "contains", value: "100" },
        },
        registry: makeRegistry(),
      }),
    );

    expect(error.issues).toEqual([
      {
        code: "operator_not_allowed",
        source: "placement",
        path: "budget",
        field: "budget",
        operator: "contains",
        allowedOperators: ["eq", "gt", "gte", "lt", "lte"],
      },
    ]);
  });

  it("reports relation filter capability and depth failures", () => {
    const error = captureQueryValidationError(() =>
      validateQuerySpec({
        query: {
          version: "v1",
          source: "placement",
          select: ["campaign.owner.email"],
          where: { field: "campaign.name", op: "contains", value: "spring" },
        },
        registry: makeRegistry({ campaignFilterable: false }),
      }),
    );

    expect(error.issues).toEqual([
      {
        code: "relation_depth_exceeded",
        source: "placement",
        path: "campaign.owner.email",
        relation: "campaign",
        requestedDepth: 2,
        maxDepth: 1,
      },
      {
        code: "relation_not_filterable",
        source: "placement",
        path: "campaign.name",
        relation: "campaign",
      },
    ]);
  });

  it("reports unknown source", () => {
    const error = captureQueryValidationError(() =>
      validateQuerySpec({
        query: {
          version: "v1",
          source: "missing",
          select: ["name"],
        },
        registry: makeRegistry(),
      }),
    );

    expect(error.issues).toEqual([{ code: "unknown_source", source: "missing" }]);
  });
});

const captureQueryValidationError = (callback: () => unknown) => {
  try {
    callback();
  } catch (error) {
    expect(error).toBeInstanceOf(QueryValidationError);
    expect((error as QueryValidationError)._tag).toBe("QueryValidationError");
    return error as QueryValidationError;
  }

  throw new Error("Expected QueryValidationError");
};

const makeRegistry = (options: { campaignFilterable?: boolean } = {}) =>
  ({
    version: "v1",
    sources: {
      placement: {
        physicalSource: "placements",
        publicName: "placement",
        maxLimit: 100,
        fields: {
          name: {
            physicalSource: "placements",
            physicalField: "name",
            publicName: "name",
            type: "string",
            nullable: false,
            selectable: true,
            filterable: false,
            sortable: false,
            groupable: false,
            operators: [],
            aggregations: [],
          },
          privateNote: {
            physicalSource: "placements",
            physicalField: "privateNote",
            publicName: "privateNote",
            type: "string",
            nullable: true,
            selectable: false,
            filterable: false,
            sortable: false,
            groupable: false,
            operators: [],
            aggregations: [],
          },
          budget: {
            physicalSource: "placements",
            physicalField: "budgetCents",
            publicName: "budget",
            type: "number",
            nullable: false,
            selectable: true,
            filterable: true,
            sortable: true,
            groupable: false,
            operators: ["eq", "gt", "gte", "lt", "lte"],
            aggregations: ["sum", "avg"],
          },
        },
        relations: {
          campaign: {
            physicalSource: "placements",
            physicalRelation: "campaign",
            publicName: "campaign",
            target: "campaign",
            kind: "one",
            localFields: ["campaignId"],
            foreignFields: ["id"],
            selectable: true,
            filterable: options.campaignFilterable ?? true,
            maxDepth: 1,
          },
        },
      },
      campaign: {
        physicalSource: "campaigns",
        publicName: "campaign",
        fields: {
          name: {
            physicalSource: "campaigns",
            physicalField: "name",
            publicName: "name",
            type: "string",
            nullable: false,
            selectable: true,
            filterable: true,
            sortable: true,
            groupable: false,
            operators: ["eq", "neq", "contains"],
            aggregations: [],
          },
        },
        relations: {
          owner: {
            physicalSource: "campaigns",
            physicalRelation: "owner",
            publicName: "owner",
            target: "user",
            kind: "one",
            localFields: ["ownerUserId"],
            foreignFields: ["id"],
            selectable: true,
            filterable: false,
            maxDepth: 1,
          },
        },
      },
      user: {
        physicalSource: "users",
        publicName: "user",
        fields: {
          email: {
            physicalSource: "users",
            physicalField: "email",
            publicName: "email",
            type: "string",
            nullable: false,
            selectable: true,
            filterable: false,
            sortable: false,
            groupable: false,
            operators: [],
            aggregations: [],
          },
        },
        relations: {},
      },
    },
  }) as const;
