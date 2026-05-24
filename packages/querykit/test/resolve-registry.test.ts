import { describe, expect, it } from "vitest";
import { RegistryResolutionError, resolveRegistry } from "../src/index.js";

describe("resolveRegistry", () => {
  it("can resolve to an empty registry when nothing is exposed", () => {
    expect(resolveRegistry({ physical: makePhysicalRegistry() })).toEqual({
      version: "v1",
      sources: {},
    });
  });

  it("resolves exposed physical metadata into a public registry", () => {
    const resolved = resolveRegistry({
      physical: makePhysicalRegistry(),
      defaults: {
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
          operators: "byType",
        },
        relation: {
          selectable: false,
          filterable: false,
          maxDepth: 1,
        },
      },
      policies: [
        {
          version: "v1",
          sources: {
            placements: {
              expose: true,
              exposeAs: "placement",
              label: "Placement",
              defaultLimit: 50,
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
            campaigns: {
              expose: true,
              exposeAs: "campaign",
              fields: {
                name: {
                  expose: true,
                },
              },
            },
          },
        },
      ],
    });

    expect(Object.keys(resolved.sources)).toEqual(["placement", "campaign"]);
    expect(Object.keys(resolved.sources.placement!.fields)).toEqual(["name", "budget"]);
    expect(resolved.sources.placement!.fields.budget).toMatchObject({
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
    });
    expect(resolved.sources.placement!.relations.campaign).toMatchObject({
      target: "campaign",
      localFields: ["campaignId"],
      foreignFields: ["id"],
      selectable: true,
      filterable: true,
      maxDepth: 1,
    });
  });

  it("supports allow-by-default with explicit opt-outs", () => {
    const resolved = resolveRegistry({
      physical: makePhysicalRegistry(),
      defaults: {
        exposure: "allow-by-default",
        source: {
          selectable: true,
          filterable: false,
          sortable: true,
        },
        field: {
          selectable: true,
          filterable: true,
          sortable: true,
          operators: "byType",
        },
      },
      policies: [
        {
          version: "v1",
          sources: {
            placements: {
              fields: {
                id: {
                  expose: false,
                },
              },
            },
            campaigns: {
              expose: false,
            },
          },
        },
      ],
    });

    expect(Object.keys(resolved.sources)).toEqual(["placements"]);
    expect(Object.keys(resolved.sources.placements!.fields)).toEqual([
      "name",
      "budgetCents",
      "campaignId",
    ]);
    expect(resolved.sources.placements!.fields.name!.filterable).toBe(false);
    expect(resolved.sources.placements!.fields.name!.sortable).toBe(true);
  });

  it("lets later policies override earlier policies", () => {
    const resolved = resolveRegistry({
      physical: makePhysicalRegistry(),
      policies: [
        {
          version: "v1",
          sources: {
            placements: {
              expose: true,
              fields: {
                name: {
                  expose: true,
                  filterable: false,
                },
              },
            },
          },
        },
        {
          version: "v1",
          sources: {
            placements: {
              fields: {
                name: {
                  filterable: true,
                },
              },
            },
          },
        },
      ],
    });

    expect(resolved.sources.placements!.fields.name!.filterable).toBe(true);
  });

  it("throws structured errors for stale policy references", () => {
    const error = captureRegistryResolutionError(() =>
      resolveRegistry({
        physical: makePhysicalRegistry(),
        policies: [
          {
            version: "v1",
            sources: {
              missing: {
                expose: true,
              },
              placements: {
                expose: true,
                fields: {
                  missing: {
                    expose: true,
                  },
                },
                relations: {
                  missing: {
                    expose: true,
                  },
                },
              },
            },
          },
        ],
      }),
    );

    expect(error._tag).toBe("RegistryResolutionError");
    expect(error.issues).toEqual([
      { code: "unknown_source", source: "missing" },
      { code: "unknown_field", source: "placements", field: "missing" },
      { code: "unknown_relation", source: "placements", relation: "missing" },
    ]);
  });

  it("throws structured errors for public name collisions", () => {
    const error = captureRegistryResolutionError(() =>
      resolveRegistry({
        physical: makePhysicalRegistry(),
        policies: [
          {
            version: "v1",
            sources: {
              placements: {
                expose: true,
                exposeAs: "placement",
                fields: {
                  name: {
                    expose: true,
                    exposeAs: "label",
                  },
                  budgetCents: {
                    expose: true,
                    exposeAs: "label",
                  },
                },
              },
              campaigns: {
                expose: true,
                exposeAs: "placement",
                fields: {
                  name: {
                    expose: true,
                  },
                },
              },
            },
          },
        ],
      }),
    );

    expect(error._tag).toBe("RegistryResolutionError");
    expect(error.issues).toEqual([
      {
        code: "duplicate_public_field",
        source: "placements",
        publicName: "label",
        fields: ["name", "budgetCents"],
      },
      {
        code: "duplicate_public_source",
        publicName: "placement",
        sources: ["placements", "campaigns"],
      },
    ]);
  });

  it("rejects operators that do not match the resolved field type", () => {
    const error = captureRegistryResolutionError(() =>
      resolveRegistry({
        physical: makePhysicalRegistry(),
        policies: [
          {
            version: "v1",
            sources: {
              placements: {
                expose: true,
                fields: {
                  budgetCents: {
                    expose: true,
                    filterable: true,
                    operators: ["contains"],
                  },
                },
              },
            },
          },
        ],
      }),
    );

    expect(error._tag).toBe("RegistryResolutionError");
    expect(error.issues).toEqual([
      {
        code: "invalid_operator_for_field_type",
        source: "placements",
        field: "budgetCents",
        type: "number",
        operator: "contains",
      },
    ]);
  });
});

const captureRegistryResolutionError = (callback: () => unknown) => {
  try {
    callback();
  } catch (error) {
    expect(error).toBeInstanceOf(RegistryResolutionError);
    return error as RegistryResolutionError;
  }

  throw new Error("Expected RegistryResolutionError");
};

const makePhysicalRegistry = () =>
  ({
    version: "v1",
    sources: {
      placements: {
        kind: "table",
        name: "placements",
        primaryKey: ["id"],
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
        primaryKey: ["id"],
        fields: {
          id: { type: "string", nullable: false },
          name: { type: "string", nullable: false },
        },
      },
    },
  }) as const;
