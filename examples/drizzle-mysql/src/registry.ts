import type { Policy, RegistryDefaults } from "@ypanagidis/querykit";
import { createPhysicalRegistryFromDrizzleRelations } from "@ypanagidis/querykit-drizzle";

import { relations } from "./db/schema.ts";

export const physical = createPhysicalRegistryFromDrizzleRelations(relations);

export const defaults = {
  exposure: "deny-by-default",
  source: {
    selectable: true,
    filterable: true,
    sortable: true,
    maxLimit: 100,
  },
  field: {
    selectable: true,
    filterable: false,
    sortable: false,
    groupable: false,
    operators: "byType",
  },
  relation: {
    selectable: false,
    filterable: false,
    maxDepth: 1,
  },
} satisfies RegistryDefaults;

export const policy = {
  version: "v1",
  sources: {
    placements: {
      expose: true,
      exposeAs: "placement",
      label: "Placement",
      defaultLimit: 25,
      fields: {
        name: {
          expose: true,
          filterable: true,
          sortable: true,
        },
        status: {
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
    campaigns: {
      expose: true,
      exposeAs: "campaign",
      label: "Campaign",
      fields: {
        name: {
          expose: true,
          filterable: true,
          sortable: true,
        },
      },
    },
  },
} satisfies Policy<typeof physical>;
