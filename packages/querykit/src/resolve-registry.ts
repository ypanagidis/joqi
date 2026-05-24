import { Effect, Schema } from "effect";
import type * as Either from "effect/Either";
import { ZodError } from "zod";

import type { QueryFilterOperator } from "./query.js";
import {
  PhysicalRegistrySchema,
  RegistryDefaultsSchema,
  RegistryPolicySchema,
  ResolvedRegistrySchema,
} from "./registry.js";
import type {
  FieldPolicy,
  FieldType,
  PhysicalRegistry,
  RegistryDefaults,
  RegistryPolicy,
  RelationPolicy,
  ResolvedField,
  ResolvedRegistry,
  ResolvedRelation,
  ResolvedSource,
  SourcePolicy,
} from "./registry.js";

export type ResolveRegistryInput = {
  physical: unknown;
  defaults?: unknown;
  policy?: unknown;
  policies?: readonly unknown[];
};

const FieldTypeErrorSchema = Schema.Literal(
  "string",
  "number",
  "boolean",
  "date",
  "datetime",
  "json",
  "enum",
  "unknown",
);

const QueryFilterOperatorErrorSchema = Schema.Literal(
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
);

export const RegistryResolutionIssueSchema = Schema.Union(
  Schema.Struct({
    code: Schema.Literal("unknown_source"),
    source: Schema.String,
  }),
  Schema.Struct({
    code: Schema.Literal("unknown_field"),
    source: Schema.String,
    field: Schema.String,
  }),
  Schema.Struct({
    code: Schema.Literal("unknown_relation"),
    source: Schema.String,
    relation: Schema.String,
  }),
  Schema.Struct({
    code: Schema.Literal("duplicate_public_source"),
    publicName: Schema.String,
    sources: Schema.Array(Schema.String),
  }),
  Schema.Struct({
    code: Schema.Literal("duplicate_public_field"),
    source: Schema.String,
    publicName: Schema.String,
    fields: Schema.Array(Schema.String),
  }),
  Schema.Struct({
    code: Schema.Literal("duplicate_public_relation"),
    source: Schema.String,
    publicName: Schema.String,
    relations: Schema.Array(Schema.String),
  }),
  Schema.Struct({
    code: Schema.Literal("source_has_no_fields"),
    source: Schema.String,
    publicName: Schema.String,
  }),
  Schema.Struct({
    code: Schema.Literal("invalid_default_limit"),
    source: Schema.String,
    defaultLimit: Schema.Number,
    maxLimit: Schema.Number,
  }),
  Schema.Struct({
    code: Schema.Literal("unknown_relation_target"),
    source: Schema.String,
    relation: Schema.String,
    target: Schema.String,
  }),
  Schema.Struct({
    code: Schema.Literal("invalid_operator_for_field_type"),
    source: Schema.String,
    field: Schema.String,
    type: FieldTypeErrorSchema,
    operator: QueryFilterOperatorErrorSchema,
  }),
);

export type RegistryResolutionIssue = typeof RegistryResolutionIssueSchema.Type;

export class RegistryResolutionError extends Schema.TaggedError<RegistryResolutionError>()(
  "RegistryResolutionError",
  {
    issues: Schema.Array(RegistryResolutionIssueSchema),
  },
) {}

export class RegistryParseError extends Schema.TaggedError<RegistryParseError>()(
  "RegistryParseError",
  {
    error: Schema.Defect,
  },
) {}

export type ResolveRegistryError = RegistryParseError | RegistryResolutionError;

export const resolveRegistryEffect: (
  input: ResolveRegistryInput,
) => Effect.Effect<ResolvedRegistry, ResolveRegistryError> = Effect.fn("resolveRegistry")(
  function* (input: ResolveRegistryInput) {
    const physical = yield* parseRegistryInput(() => PhysicalRegistrySchema.parse(input.physical));
    const defaults = yield* parseRegistryInput(() =>
      RegistryDefaultsSchema.parse(input.defaults ?? {}),
    );
    const policies = yield* parsePolicies(input);
    const policy = mergePolicies(policies);
    const issues: RegistryResolutionIssue[] = [];

    collectStalePolicyReferenceIssues(physical, policy, issues);

    if (issues.length > 0) {
      return yield* new RegistryResolutionError({ issues });
    }

    const publicSourcesByPhysical = new Map<string, string>();
    const physicalSourcesByPublic = new Map<string, string>();
    const duplicateSourceIssues: RegistryResolutionIssue[] = [];

    for (const sourceName of Object.keys(physical.sources)) {
      const sourcePolicy = policy[sourceName];

      if (!isExposed(defaults, sourcePolicy?.expose)) {
        continue;
      }

      const publicName = sourcePolicy?.exposeAs ?? sourceName;
      const existingSource = physicalSourcesByPublic.get(publicName);

      if (existingSource !== undefined) {
        duplicateSourceIssues.push({
          code: "duplicate_public_source",
          publicName,
          sources: [existingSource, sourceName],
        });
        continue;
      }

      physicalSourcesByPublic.set(publicName, sourceName);
      publicSourcesByPhysical.set(sourceName, publicName);
    }

    const sources: Record<string, ResolvedSource> = {};

    for (const [sourceName, physicalSource] of Object.entries(physical.sources)) {
      const publicName = publicSourcesByPhysical.get(sourceName);

      if (publicName === undefined) {
        continue;
      }

      const sourcePolicy = policy[sourceName];
      const sourceCapabilities = resolveSourceCapabilities(defaults, sourcePolicy);
      const fields = resolveFields({
        sourceName,
        physicalFields: physicalSource.fields,
        defaults,
        sourcePolicy,
        sourceCapabilities,
        issues,
      });

      const relations = resolveRelations({
        sourceName,
        physicalRelations: physicalSource.relations ?? {},
        defaults,
        sourcePolicy,
        sourceCapabilities,
        publicSourcesByPhysical,
        physicalSourcesByPublic,
        issues,
      });

      if (Object.keys(fields).length === 0) {
        issues.push({ code: "source_has_no_fields", source: sourceName, publicName });
        continue;
      }

      const maxLimit = sourcePolicy?.maxLimit ?? defaults.source?.maxLimit;
      const defaultLimit = sourcePolicy?.defaultLimit;

      if (defaultLimit !== undefined && maxLimit !== undefined && defaultLimit > maxLimit) {
        issues.push({ code: "invalid_default_limit", source: sourceName, defaultLimit, maxLimit });
        continue;
      }

      sources[publicName] = {
        physicalSource: sourceName,
        publicName,
        ...(sourcePolicy?.label === undefined ? {} : { label: sourcePolicy.label }),
        ...(sourcePolicy?.description === undefined
          ? {}
          : { description: sourcePolicy.description }),
        ...(maxLimit === undefined ? {} : { maxLimit }),
        ...(defaultLimit === undefined ? {} : { defaultLimit }),
        fields,
        relations,
      };
    }

    issues.push(...duplicateSourceIssues);

    if (issues.length > 0) {
      return yield* new RegistryResolutionError({ issues });
    }

    return yield* parseRegistryInput(() =>
      ResolvedRegistrySchema.parse({
        version: "v1",
        sources,
      }),
    );
  },
);

export const resolveRegistry = (input: ResolveRegistryInput): ResolvedRegistry =>
  unwrapResolveRegistryResult(Effect.runSync(Effect.either(resolveRegistryEffect(input))));

export const resolveRegistryPromise = async (
  input: ResolveRegistryInput,
): Promise<ResolvedRegistry> =>
  unwrapResolveRegistryResult(await Effect.runPromise(Effect.either(resolveRegistryEffect(input))));

type MergedSourcePolicy = Omit<SourcePolicy, "fields" | "relations"> & {
  fields?: Record<string, FieldPolicy> | undefined;
  relations?: Record<string, RelationPolicy> | undefined;
};

type SourceCapabilities = {
  selectable: boolean;
  filterable: boolean;
  sortable: boolean;
};

const parseRegistryInput = <Value>(parse: () => Value) =>
  Effect.try({
    try: parse,
    catch: (error) => {
      if (error instanceof ZodError) {
        return new RegistryParseError({ error });
      }

      throw error;
    },
  });

const unwrapResolveRegistryResult = (
  result: Either.Either<ResolvedRegistry, ResolveRegistryError>,
): ResolvedRegistry => {
  if (result._tag === "Left") {
    throw result.left;
  }

  return result.right;
};

const parsePolicies: (
  input: ResolveRegistryInput,
) => Effect.Effect<RegistryPolicy[], RegistryParseError> = Effect.fn("parseRegistryPolicies")(
  function* (input: ResolveRegistryInput) {
    const policies: RegistryPolicy[] = [];

    if (input.policy !== undefined) {
      policies.push(yield* parseRegistryInput(() => RegistryPolicySchema.parse(input.policy)));
    }

    for (const policy of input.policies ?? []) {
      policies.push(yield* parseRegistryInput(() => RegistryPolicySchema.parse(policy)));
    }

    return policies;
  },
);

const mergePolicies = (policies: readonly RegistryPolicy[]): Record<string, MergedSourcePolicy> => {
  const merged: Record<string, MergedSourcePolicy> = {};

  for (const policy of policies) {
    for (const [sourceName, sourcePolicy] of Object.entries(policy.sources ?? {})) {
      const currentSourcePolicy = merged[sourceName] ?? {};
      const fields = mergeNestedPolicy(currentSourcePolicy.fields, sourcePolicy.fields);
      const relations = mergeNestedPolicy(currentSourcePolicy.relations, sourcePolicy.relations);

      merged[sourceName] = {
        ...currentSourcePolicy,
        ...sourcePolicy,
        ...(fields === undefined ? {} : { fields }),
        ...(relations === undefined ? {} : { relations }),
      };
    }
  }

  return merged;
};

const mergeNestedPolicy = <Policy extends object>(
  current: Record<string, Policy> | undefined,
  next: Record<string, Policy> | undefined,
): Record<string, Policy> | undefined => {
  if (current === undefined && next === undefined) {
    return undefined;
  }

  const merged: Record<string, Policy> = { ...current };

  for (const [name, policy] of Object.entries(next ?? {})) {
    merged[name] = {
      ...merged[name],
      ...policy,
    } as Policy;
  }

  return merged;
};

const collectStalePolicyReferenceIssues = (
  physical: PhysicalRegistry,
  policy: Record<string, MergedSourcePolicy>,
  issues: RegistryResolutionIssue[],
) => {
  for (const [sourceName, sourcePolicy] of Object.entries(policy)) {
    const physicalSource = physical.sources[sourceName];

    if (physicalSource === undefined) {
      issues.push({ code: "unknown_source", source: sourceName });
      continue;
    }

    for (const fieldName of Object.keys(sourcePolicy.fields ?? {})) {
      if (physicalSource.fields[fieldName] === undefined) {
        issues.push({ code: "unknown_field", source: sourceName, field: fieldName });
      }
    }

    for (const relationName of Object.keys(sourcePolicy.relations ?? {})) {
      if (physicalSource.relations?.[relationName] === undefined) {
        issues.push({ code: "unknown_relation", source: sourceName, relation: relationName });
      }
    }
  }
};

const isExposed = (defaults: RegistryDefaults, expose: boolean | undefined) => {
  if (expose !== undefined) {
    return expose;
  }

  return defaults.exposure === "allow-by-default";
};

const resolveSourceCapabilities = (
  defaults: RegistryDefaults,
  sourcePolicy: MergedSourcePolicy | undefined,
): SourceCapabilities => ({
  selectable: sourcePolicy?.selectable ?? defaults.source?.selectable ?? true,
  filterable: sourcePolicy?.filterable ?? defaults.source?.filterable ?? true,
  sortable: sourcePolicy?.sortable ?? defaults.source?.sortable ?? true,
});

const resolveFields = (input: {
  sourceName: string;
  physicalFields: PhysicalRegistry["sources"][string]["fields"];
  defaults: RegistryDefaults;
  sourcePolicy: MergedSourcePolicy | undefined;
  sourceCapabilities: SourceCapabilities;
  issues: RegistryResolutionIssue[];
}): Record<string, ResolvedField> => {
  const fields: Record<string, ResolvedField> = {};
  const physicalFieldsByPublic = new Map<string, string>();

  for (const [fieldName, physicalField] of Object.entries(input.physicalFields)) {
    const fieldPolicy = input.sourcePolicy?.fields?.[fieldName];

    if (!isExposed(input.defaults, fieldPolicy?.expose)) {
      continue;
    }

    const publicName = fieldPolicy?.exposeAs ?? fieldName;
    const existingField = physicalFieldsByPublic.get(publicName);

    if (existingField !== undefined) {
      input.issues.push({
        code: "duplicate_public_field",
        source: input.sourceName,
        publicName,
        fields: [existingField, fieldName],
      });
      continue;
    }

    physicalFieldsByPublic.set(publicName, fieldName);

    const type = fieldPolicy?.type ?? physicalField.type;
    const selectable =
      input.sourceCapabilities.selectable &&
      (fieldPolicy?.selectable ?? input.defaults.field?.selectable ?? true);
    const filterable =
      input.sourceCapabilities.filterable &&
      (fieldPolicy?.filterable ?? input.defaults.field?.filterable ?? false);
    const sortable =
      input.sourceCapabilities.sortable &&
      (fieldPolicy?.sortable ?? input.defaults.field?.sortable ?? false);
    const operators = filterable
      ? resolveOperators({
          sourceName: input.sourceName,
          fieldName,
          type,
          fieldPolicy,
          defaults: input.defaults,
          issues: input.issues,
        })
      : [];

    fields[publicName] = {
      physicalSource: input.sourceName,
      physicalField: fieldName,
      publicName,
      type,
      nullable: physicalField.nullable,
      ...(fieldPolicy?.label === undefined ? {} : { label: fieldPolicy.label }),
      ...(fieldPolicy?.description === undefined ? {} : { description: fieldPolicy.description }),
      selectable,
      filterable,
      sortable,
      groupable: fieldPolicy?.groupable ?? input.defaults.field?.groupable ?? false,
      operators,
      aggregations: fieldPolicy?.aggregations ?? [],
    };
  }

  return fields;
};

const resolveRelations = (input: {
  sourceName: string;
  physicalRelations: NonNullable<PhysicalRegistry["sources"][string]["relations"]>;
  defaults: RegistryDefaults;
  sourcePolicy: MergedSourcePolicy | undefined;
  sourceCapabilities: SourceCapabilities;
  publicSourcesByPhysical: Map<string, string>;
  physicalSourcesByPublic: Map<string, string>;
  issues: RegistryResolutionIssue[];
}): Record<string, ResolvedRelation> => {
  const relations: Record<string, ResolvedRelation> = {};
  const physicalRelationsByPublic = new Map<string, string>();

  for (const [relationName, physicalRelation] of Object.entries(input.physicalRelations)) {
    const relationPolicy = input.sourcePolicy?.relations?.[relationName];

    if (!isExposed(input.defaults, relationPolicy?.expose)) {
      continue;
    }

    const publicName = relationPolicy?.exposeAs ?? relationName;
    const existingRelation = physicalRelationsByPublic.get(publicName);

    if (existingRelation !== undefined) {
      input.issues.push({
        code: "duplicate_public_relation",
        source: input.sourceName,
        publicName,
        relations: [existingRelation, relationName],
      });
      continue;
    }

    const target =
      relationPolicy?.target ?? input.publicSourcesByPhysical.get(physicalRelation.target);

    if (target === undefined || !input.physicalSourcesByPublic.has(target)) {
      if (relationPolicy?.expose === true) {
        input.issues.push({
          code: "unknown_relation_target",
          source: input.sourceName,
          relation: relationName,
          target: relationPolicy?.target ?? physicalRelation.target,
        });
      }

      continue;
    }

    physicalRelationsByPublic.set(publicName, relationName);

    relations[publicName] = {
      physicalSource: input.sourceName,
      physicalRelation: relationName,
      publicName,
      target,
      kind: physicalRelation.kind,
      localFields: physicalRelation.localFields,
      foreignFields: physicalRelation.foreignFields,
      selectable:
        input.sourceCapabilities.selectable &&
        (relationPolicy?.selectable ?? input.defaults.relation?.selectable ?? false),
      filterable:
        input.sourceCapabilities.filterable &&
        (relationPolicy?.filterable ?? input.defaults.relation?.filterable ?? false),
      maxDepth: relationPolicy?.maxDepth ?? input.defaults.relation?.maxDepth ?? 1,
    };
  }

  return relations;
};

const resolveOperators = (input: {
  sourceName: string;
  fieldName: string;
  type: FieldType;
  fieldPolicy: FieldPolicy | undefined;
  defaults: RegistryDefaults;
  issues: RegistryResolutionIssue[];
}): QueryFilterOperator[] => {
  const requestedOperators =
    input.fieldPolicy?.operators ?? input.defaults.field?.operators ?? "byType";
  const operators =
    requestedOperators === "byType" ? defaultOperatorsByType[input.type] : requestedOperators;
  const validOperators = new Set(defaultOperatorsByType[input.type]);

  for (const operator of operators) {
    if (!validOperators.has(operator)) {
      input.issues.push({
        code: "invalid_operator_for_field_type",
        source: input.sourceName,
        field: input.fieldName,
        type: input.type,
        operator,
      });
    }
  }

  return [...operators];
};

const nullableOperators = ["isNull", "isNotNull"] as const;
const equalityOperators = ["eq", "neq", "in", ...nullableOperators] as const;
const comparableOperators = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  ...nullableOperators,
] as const;

const defaultOperatorsByType: Record<FieldType, readonly QueryFilterOperator[]> = {
  string: ["eq", "neq", "in", "contains", "startsWith", "endsWith", ...nullableOperators],
  number: comparableOperators,
  boolean: ["eq", "neq", ...nullableOperators],
  date: comparableOperators,
  datetime: comparableOperators,
  json: ["eq", "neq", ...nullableOperators],
  enum: equalityOperators,
  unknown: [],
};
