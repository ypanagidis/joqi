import { z } from "zod";

import { QueryFilterOperatorSchema } from "./query.js";

export const RegistryVersionSchema = z.literal("v1");

export const FieldTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "date",
  "datetime",
  "json",
  "enum",
  "unknown",
]);

export const PhysicalSourceKindSchema = z.enum(["table", "view", "model"]);

export const RelationKindSchema = z.enum(["one", "many"]);

export const AggregationSchema = z.enum(["count", "sum", "avg", "min", "max"]);

export const ExposureModeSchema = z.enum(["deny-by-default", "allow-by-default"]);

const nonEmptyRecord = <ValueSchema extends z.ZodType>(valueSchema: ValueSchema) =>
  z.record(z.string().min(1), valueSchema).refine((value) => Object.keys(value).length > 0, {
    message: "Expected at least one entry",
  });

export const AdapterMetaSchema = z.record(z.string().min(1), z.unknown());

export const PhysicalFieldSchema = z.object({
  type: FieldTypeSchema,
  nullable: z.boolean(),
  enumValues: z.array(z.string()).optional(),
  adapterMeta: AdapterMetaSchema.optional(),
});

export const PhysicalRelationSchema = z.object({
  kind: RelationKindSchema,
  target: z.string().min(1),
  localFields: z.array(z.string().min(1)).min(1),
  foreignFields: z.array(z.string().min(1)).min(1),
  nullable: z.boolean().optional(),
  adapterMeta: AdapterMetaSchema.optional(),
});

export const PhysicalSourceSchema = z.object({
  kind: PhysicalSourceKindSchema,
  name: z.string().min(1),
  schema: z.string().min(1).optional(),
  primaryKey: z.array(z.string().min(1)).optional(),
  fields: nonEmptyRecord(PhysicalFieldSchema),
  relations: z.record(z.string().min(1), PhysicalRelationSchema).optional(),
  adapterMeta: AdapterMetaSchema.optional(),
});

export const PhysicalRegistrySchema = z.object({
  version: RegistryVersionSchema,
  sources: nonEmptyRecord(PhysicalSourceSchema),
});

export const FieldPolicySchema = z.object({
  expose: z.boolean().optional(),
  exposeAs: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  type: FieldTypeSchema.exclude(["unknown"]).optional(),
  selectable: z.boolean().optional(),
  filterable: z.boolean().optional(),
  sortable: z.boolean().optional(),
  groupable: z.boolean().optional(),
  operators: z.array(QueryFilterOperatorSchema).optional(),
  aggregations: z.array(AggregationSchema).optional(),
});

export const RelationPolicySchema = z.object({
  expose: z.boolean().optional(),
  exposeAs: z.string().min(1).optional(),
  target: z.string().min(1).optional(),
  selectable: z.boolean().optional(),
  filterable: z.boolean().optional(),
  maxDepth: z.number().int().nonnegative().optional(),
});

export const SourcePolicySchema = z.object({
  expose: z.boolean().optional(),
  exposeAs: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  selectable: z.boolean().optional(),
  filterable: z.boolean().optional(),
  sortable: z.boolean().optional(),
  maxLimit: z.number().int().nonnegative().optional(),
  defaultLimit: z.number().int().nonnegative().optional(),
  fields: z.record(z.string().min(1), FieldPolicySchema).optional(),
  relations: z.record(z.string().min(1), RelationPolicySchema).optional(),
});

export const RegistryPolicySchema = z.object({
  version: RegistryVersionSchema,
  sources: z.record(z.string().min(1), SourcePolicySchema).optional(),
});

export const SourceDefaultsSchema = z.object({
  selectable: z.boolean().optional(),
  filterable: z.boolean().optional(),
  sortable: z.boolean().optional(),
  maxLimit: z.number().int().nonnegative().optional(),
});

export const FieldDefaultsSchema = z.object({
  selectable: z.boolean().optional(),
  filterable: z.boolean().optional(),
  sortable: z.boolean().optional(),
  groupable: z.boolean().optional(),
  operators: z.union([z.literal("byType"), z.array(QueryFilterOperatorSchema)]).optional(),
});

export const RelationDefaultsSchema = z.object({
  selectable: z.boolean().optional(),
  filterable: z.boolean().optional(),
  maxDepth: z.number().int().nonnegative().optional(),
});

export const RegistryDefaultsSchema = z.object({
  exposure: ExposureModeSchema.default("deny-by-default"),
  source: SourceDefaultsSchema.optional(),
  field: FieldDefaultsSchema.optional(),
  relation: RelationDefaultsSchema.optional(),
});

export const ResolvedFieldSchema = z.object({
  physicalSource: z.string().min(1),
  physicalField: z.string().min(1),
  publicName: z.string().min(1),
  type: FieldTypeSchema,
  nullable: z.boolean(),
  label: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  selectable: z.boolean(),
  filterable: z.boolean(),
  sortable: z.boolean(),
  groupable: z.boolean(),
  operators: z.array(QueryFilterOperatorSchema),
  aggregations: z.array(AggregationSchema),
});

export const ResolvedRelationSchema = z.object({
  physicalSource: z.string().min(1),
  physicalRelation: z.string().min(1),
  publicName: z.string().min(1),
  target: z.string().min(1),
  kind: RelationKindSchema,
  localFields: z.array(z.string().min(1)).min(1),
  foreignFields: z.array(z.string().min(1)).min(1),
  selectable: z.boolean(),
  filterable: z.boolean(),
  maxDepth: z.number().int().nonnegative(),
});

export const ResolvedSourceSchema = z.object({
  physicalSource: z.string().min(1),
  publicName: z.string().min(1),
  label: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  maxLimit: z.number().int().nonnegative().optional(),
  defaultLimit: z.number().int().nonnegative().optional(),
  fields: nonEmptyRecord(ResolvedFieldSchema),
  relations: z.record(z.string().min(1), ResolvedRelationSchema),
});

export const ResolvedRegistrySchema = z.object({
  version: RegistryVersionSchema,
  sources: z.record(z.string().min(1), ResolvedSourceSchema),
});

export type FieldType = z.infer<typeof FieldTypeSchema>;
export type Aggregation = z.infer<typeof AggregationSchema>;
export type PhysicalRegistry = z.infer<typeof PhysicalRegistrySchema>;
export type PhysicalSource = z.infer<typeof PhysicalSourceSchema>;
export type PhysicalField = z.infer<typeof PhysicalFieldSchema>;
export type PhysicalRelation = z.infer<typeof PhysicalRelationSchema>;
export type RelationKind = z.infer<typeof RelationKindSchema>;
export type RegistryPolicy = z.infer<typeof RegistryPolicySchema>;
export type SourcePolicy = z.infer<typeof SourcePolicySchema>;
export type FieldPolicy = z.infer<typeof FieldPolicySchema>;
export type RelationPolicy = z.infer<typeof RelationPolicySchema>;
export type RegistryDefaults = z.infer<typeof RegistryDefaultsSchema>;
export type ResolvedRegistry = z.infer<typeof ResolvedRegistrySchema>;
export type ResolvedSource = z.infer<typeof ResolvedSourceSchema>;
export type ResolvedField = z.infer<typeof ResolvedFieldSchema>;
export type ResolvedRelation = z.infer<typeof ResolvedRelationSchema>;

export type PhysicalRegistryLike = {
  readonly sources: Readonly<Record<string, PhysicalSourceLike>>;
};

export type PhysicalSourceLike = {
  readonly fields: Readonly<Record<string, unknown>>;
  readonly relations?: Readonly<Record<string, unknown>> | undefined;
};

export type Policy<TPhysical extends PhysicalRegistryLike> = Omit<RegistryPolicy, "sources"> & {
  readonly sources?: {
    readonly [SourceName in StringKeyOf<TPhysical["sources"]>]?: PolicySource<
      TPhysical["sources"][SourceName]
    >;
  };
};

export type PolicySource<TSource extends PhysicalSourceLike> = Omit<
  SourcePolicy,
  "fields" | "relations"
> & {
  readonly fields?: {
    readonly [FieldName in StringKeyOf<TSource["fields"]>]?: FieldPolicy;
  };
  readonly relations?: PolicyRelations<TSource>;
};

type PolicyRelations<TSource extends PhysicalSourceLike> = TSource extends {
  readonly relations?: infer Relations;
}
  ? NonNullable<Relations> extends Readonly<Record<string, unknown>>
    ? {
        readonly [RelationName in StringKeyOf<NonNullable<Relations>>]?: RelationPolicy;
      }
    : never
  : never;

type StringKeyOf<Value> = Extract<keyof Value, string>;

export const parsePhysicalRegistry = (input: unknown): PhysicalRegistry =>
  PhysicalRegistrySchema.parse(input);

export const parseRegistryPolicy = (input: unknown): RegistryPolicy =>
  RegistryPolicySchema.parse(input);

export const parseRegistryDefaults = (input: unknown): RegistryDefaults =>
  RegistryDefaultsSchema.parse(input);

export const parseResolvedRegistry = (input: unknown): ResolvedRegistry =>
  ResolvedRegistrySchema.parse(input);

export const safeParsePhysicalRegistry = (input: unknown) =>
  PhysicalRegistrySchema.safeParse(input);

export const safeParseRegistryPolicy = (input: unknown) => RegistryPolicySchema.safeParse(input);

export const safeParseRegistryDefaults = (input: unknown) =>
  RegistryDefaultsSchema.safeParse(input);

export const safeParseResolvedRegistry = (input: unknown) =>
  ResolvedRegistrySchema.safeParse(input);
