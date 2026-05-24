import { describe, expect, it } from "vitest";
import {
  parsePhysicalRegistry,
  parseRegistryDefaults,
  parseRegistryPolicy,
  parseResolvedRegistry,
  safeParsePhysicalRegistry,
  safeParseRegistryPolicy,
  safeParseResolvedRegistry,
} from "../src/index.js";

describe("PhysicalRegistrySchema", () => {
  it("parses a generated physical registry", () => {
    expect(parsePhysicalRegistry(makePhysicalRegistry())).toEqual(makePhysicalRegistry());
  });

  it("rejects sources without fields", () => {
    expect(
      safeParsePhysicalRegistry({
        version: "v1",
        sources: {
          placements: {
            kind: "table",
            name: "placements",
            fields: {},
          },
        },
      }).success,
    ).toBe(false);
  });
});

describe("RegistryPolicySchema", () => {
  it("parses a user-authored policy", () => {
    expect(parseRegistryPolicy(makeRegistryPolicy())).toEqual(makeRegistryPolicy());
  });

  it("rejects negative maxDepth values", () => {
    expect(
      safeParseRegistryPolicy({
        version: "v1",
        sources: {
          placements: {
            relations: {
              campaign: {
                maxDepth: -1,
              },
            },
          },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects unknown filter operators", () => {
    expect(
      safeParseRegistryPolicy({
        version: "v1",
        sources: {
          placements: {
            fields: {
              name: {
                operators: ["raw"],
              },
            },
          },
        },
      }).success,
    ).toBe(false);
  });
});

describe("RegistryDefaultsSchema", () => {
  it("defaults exposure to deny-by-default", () => {
    expect(parseRegistryDefaults({})).toEqual({
      exposure: "deny-by-default",
    });
  });
});

describe("ResolvedRegistrySchema", () => {
  it("parses an effective registry", () => {
    expect(parseResolvedRegistry(makeResolvedRegistry())).toEqual(makeResolvedRegistry());
  });

  it("rejects effective sources without fields", () => {
    expect(
      safeParseResolvedRegistry({
        version: "v1",
        sources: {
          placement: {
            physicalSource: "placements",
            publicName: "placement",
            fields: {},
            relations: {},
          },
        },
      }).success,
    ).toBe(false);
  });
});

const makePhysicalRegistry = () => ({
  version: "v1",
  sources: {
    placements: {
      kind: "table",
      name: "placements",
      primaryKey: ["id"],
      fields: {
        id: { type: "string", nullable: false },
        name: { type: "string", nullable: false },
        status: {
          type: "enum",
          nullable: false,
          enumValues: ["active", "paused"],
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
        },
      },
    },
  },
});

const makeRegistryPolicy = () => ({
  version: "v1",
  sources: {
    placements: {
      expose: true,
      exposeAs: "placement",
      label: "Placement",
      defaultLimit: 100,
      maxLimit: 500,
      fields: {
        name: {
          expose: true,
          filterable: true,
          sortable: true,
        },
        budgetCents: {
          expose: true,
          exposeAs: "budget",
          type: "number",
          filterable: true,
          sortable: true,
          aggregations: ["sum", "avg"],
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
  },
});

const makeResolvedRegistry = () => ({
  version: "v1",
  sources: {
    placement: {
      physicalSource: "placements",
      publicName: "placement",
      label: "Placement",
      defaultLimit: 100,
      maxLimit: 500,
      fields: {
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
          filterable: true,
          maxDepth: 1,
        },
      },
    },
  },
});
