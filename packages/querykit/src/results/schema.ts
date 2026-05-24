import { z } from "zod";

import type { QueryIR, QueryIRFieldRef } from "../query/lower.js";
import { JsonValueSchema } from "../specs/query.js";
import type { FieldType } from "../specs/registries.js";

export type QueryResultRow = Record<string, unknown>;
export type QueryResultRows = readonly QueryResultRow[];

export const buildQueryIRRowSchema = (ir: QueryIR) => {
  const shape: Record<string, z.ZodType> = {};

  for (const field of ir.select) {
    shape[field.path] = fieldSchemaForOutput(field);
  }

  return z.object(shape).strict();
};

export const buildQueryIRResultSchema = (ir: QueryIR) => z.array(buildQueryIRRowSchema(ir));

export const parseQueryIRResultRows = (ir: QueryIR, rows: unknown): QueryResultRows =>
  buildQueryIRResultSchema(ir).parse(rows);

export const safeParseQueryIRResultRows = (ir: QueryIR, rows: unknown) =>
  buildQueryIRResultSchema(ir).safeParse(rows);

const fieldSchemaForOutput = (field: QueryIRFieldRef): z.ZodType => {
  const schema = fieldTypeSchema(field.type);

  if (field.nullable || isRelationPath(field.path)) {
    return schema.nullable();
  }

  return schema;
};

const fieldTypeSchema = (type: FieldType): z.ZodType => {
  switch (type) {
    case "string":
    case "enum":
      return z.string();
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
    case "date":
    case "datetime":
      return z.union([z.string(), z.date()]);
    case "json":
      return JsonValueSchema;
    case "unknown":
      return z.unknown();
  }
};

const isRelationPath = (path: string): boolean => path.includes(".");
