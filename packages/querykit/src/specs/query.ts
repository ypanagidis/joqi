import { z } from "zod";

export const QueryVersionSchema = z.literal("v1");

export const QuerySortDirectionSchema = z.enum(["asc", "desc"]);

export const QueryFilterOperatorSchema = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "contains",
  "startsWith",
  "endsWith",
  "isNull",
  "isNotNull",
]);

const JsonScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const QueryParamRefSchema = z
  .object({
    $param: z.string().min(1),
  })
  .strict();

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([JsonScalarSchema, z.array(JsonValueSchema), z.record(z.string(), JsonValueSchema)]),
);

export type QueryParamRef = z.infer<typeof QueryParamRefSchema>;

export type QueryValue = JsonValue | QueryParamRef;

export type QueryParams = Record<string, JsonValue>;

export type QueryLimitValue = number | QueryParamRef;

const QueryValueSchema = z.union([QueryParamRefSchema, JsonValueSchema]);

const QueryLimitValueSchema = z.union([z.number().int().nonnegative(), QueryParamRefSchema]);

export const QueryParamsSchema: z.ZodType<QueryParams> = z.record(z.string(), JsonValueSchema);

export type QueryFilter =
  | {
      and: QueryFilter[];
    }
  | {
      or: QueryFilter[];
    }
  | {
      field: string;
      op: z.infer<typeof QueryFilterOperatorSchema>;
      value?: QueryValue | undefined;
    };

export const QueryFilterSchema: z.ZodType<QueryFilter> = z.lazy(() =>
  z.union([
    z.object({
      and: z.array(QueryFilterSchema).min(1),
    }),
    z.object({
      or: z.array(QueryFilterSchema).min(1),
    }),
    z.object({
      field: z.string().min(1),
      op: QueryFilterOperatorSchema,
      value: QueryValueSchema.optional(),
    }),
  ]),
);

export const QueryOrderBySchema = z.object({
  field: z.string().min(1),
  direction: QuerySortDirectionSchema,
});

export const QuerySpecSchema = z.object({
  version: QueryVersionSchema,
  source: z.string().min(1),
  select: z.array(z.string().min(1)).min(1),
  where: QueryFilterSchema.optional(),
  groupBy: z.array(z.string().min(1)).optional(),
  orderBy: z.array(QueryOrderBySchema).optional(),
  limit: QueryLimitValueSchema.optional(),
  offset: QueryLimitValueSchema.optional(),
});

export type QuerySpec = z.infer<typeof QuerySpecSchema>;

export type QueryOrderBy = z.infer<typeof QueryOrderBySchema>;

export type QueryFilterOperator = z.infer<typeof QueryFilterOperatorSchema>;

export type QuerySortDirection = z.infer<typeof QuerySortDirectionSchema>;

export const parseQuerySpec = (input: unknown): QuerySpec => QuerySpecSchema.parse(input);

export const safeParseQuerySpec = (input: unknown) => QuerySpecSchema.safeParse(input);
