import { describe, expect, it } from "vitest";

import {
  buildQueryIRResultSchema,
  buildQueryIRRowSchema,
  parseQueryIRResultRows,
  safeParseQueryIRResultRows,
  type QueryIR,
} from "../src/index.js";

describe("QueryIR result schemas", () => {
  it("builds a strict row schema from selected fields", () => {
    const schema = buildQueryIRRowSchema(makeIR());

    expect(
      schema.parse({
        name: "Homepage Hero",
        budget: 15000,
        active: true,
        metadata: { channel: "web" },
        "campaign.name": "Spring Launch",
      }),
    ).toEqual({
      name: "Homepage Hero",
      budget: 15000,
      active: true,
      metadata: { channel: "web" },
      "campaign.name": "Spring Launch",
    });

    expect(() =>
      schema.parse({
        name: "Homepage Hero",
        budget: 15000,
        active: true,
        metadata: { channel: "web" },
        "campaign.name": "Spring Launch",
        extra: "unexpected",
      }),
    ).toThrow();
  });

  it("keeps relation-path fields nullable for left joins", () => {
    const rows = parseQueryIRResultRows(makeIR(), [
      {
        name: "Homepage Hero",
        budget: 15000,
        active: true,
        metadata: null,
        "campaign.name": null,
      },
    ]);

    expect(rows).toEqual([
      {
        name: "Homepage Hero",
        budget: 15000,
        active: true,
        metadata: null,
        "campaign.name": null,
      },
    ]);
  });

  it("rejects null for non-null root fields", () => {
    expect(
      safeParseQueryIRResultRows(makeIR(), [
        {
          name: null,
          budget: 15000,
          active: true,
          metadata: null,
          "campaign.name": "Spring Launch",
        },
      ]).success,
    ).toBe(false);
  });

  it("builds a result array schema", () => {
    expect(
      buildQueryIRResultSchema(makeIR()).parse([
        {
          name: "Homepage Hero",
          budget: 15000,
          active: true,
          metadata: ["web"],
          "campaign.name": "Spring Launch",
        },
      ]),
    ).toEqual([
      {
        name: "Homepage Hero",
        budget: 15000,
        active: true,
        metadata: ["web"],
        "campaign.name": "Spring Launch",
      },
    ]);
  });
});

const makeIR = (): QueryIR => ({
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
      path: "active",
      source: { publicName: "placement", physicalSource: "placements" },
      field: { publicName: "active", physicalField: "active" },
      type: "boolean",
      nullable: false,
    },
    {
      path: "metadata",
      source: { publicName: "placement", physicalSource: "placements" },
      field: { publicName: "metadata", physicalField: "metadata" },
      type: "json",
      nullable: true,
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
      relation: { publicName: "campaign", physicalRelation: "campaign" },
      kind: "one",
      from: { publicName: "placement", physicalSource: "placements" },
      to: { publicName: "campaign", physicalSource: "campaigns" },
      localFields: ["campaignId"],
      foreignFields: ["id"],
    },
  ],
  groupBy: [],
  orderBy: [],
});
