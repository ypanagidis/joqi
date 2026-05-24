import { Effect, Schema } from "effect";
import type * as Either from "effect/Either";
import { ZodError } from "zod";

import { QuerySpecSchema } from "../specs/query.js";
import type { QueryFilter, QuerySpec } from "../specs/query.js";
import { ResolvedRegistrySchema } from "../specs/registries.js";
import type {
  ResolvedField,
  ResolvedRegistry,
  ResolvedRelation,
  ResolvedSource,
} from "../specs/registries.js";

export type ValidateQuerySpecInput = {
  readonly query: unknown;
  readonly registry: unknown;
};

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

export const QueryValidationIssueSchema = Schema.Union(
  Schema.Struct({
    code: Schema.Literal("unknown_source"),
    source: Schema.String,
  }),
  Schema.Struct({
    code: Schema.Literal("unknown_field"),
    source: Schema.String,
    path: Schema.String,
    field: Schema.String,
  }),
  Schema.Struct({
    code: Schema.Literal("unknown_relation"),
    source: Schema.String,
    path: Schema.String,
    relation: Schema.String,
  }),
  Schema.Struct({
    code: Schema.Literal(
      "field_not_selectable",
      "field_not_filterable",
      "field_not_sortable",
      "field_not_groupable",
    ),
    source: Schema.String,
    path: Schema.String,
    field: Schema.String,
  }),
  Schema.Struct({
    code: Schema.Literal("relation_not_selectable", "relation_not_filterable"),
    source: Schema.String,
    path: Schema.String,
    relation: Schema.String,
  }),
  Schema.Struct({
    code: Schema.Literal("relation_depth_exceeded"),
    source: Schema.String,
    path: Schema.String,
    relation: Schema.String,
    requestedDepth: Schema.Number,
    maxDepth: Schema.Number,
  }),
  Schema.Struct({
    code: Schema.Literal("operator_not_allowed"),
    source: Schema.String,
    path: Schema.String,
    field: Schema.String,
    operator: QueryFilterOperatorErrorSchema,
    allowedOperators: Schema.Array(QueryFilterOperatorErrorSchema),
  }),
  Schema.Struct({
    code: Schema.Literal("limit_exceeds_max"),
    source: Schema.String,
    limit: Schema.Number,
    maxLimit: Schema.Number,
  }),
);

export type QueryValidationIssue = typeof QueryValidationIssueSchema.Type;

export class QueryParseError extends Schema.TaggedError<QueryParseError>()("QueryParseError", {
  input: Schema.Literal("query", "registry"),
  error: Schema.Defect,
}) {}

export class QueryValidationError extends Schema.TaggedError<QueryValidationError>()(
  "QueryValidationError",
  {
    issues: Schema.Array(QueryValidationIssueSchema),
  },
) {}

export type ValidateQuerySpecError = QueryParseError | QueryValidationError;

export const validateQuerySpecEffect: (
  input: ValidateQuerySpecInput,
) => Effect.Effect<QuerySpec, ValidateQuerySpecError> = Effect.fn("validateQuerySpec")(function* (
  input: ValidateQuerySpecInput,
) {
  const query = yield* parseValidationInput("query", () => QuerySpecSchema.parse(input.query));
  const registry = yield* parseValidationInput("registry", () =>
    ResolvedRegistrySchema.parse(input.registry),
  );
  const issues: QueryValidationIssue[] = [];
  const source = registry.sources[query.source];

  if (source === undefined) {
    return yield* new QueryValidationError({
      issues: [{ code: "unknown_source", source: query.source }],
    });
  }

  validateLimit(query, source, issues);

  for (const fieldPath of query.select) {
    validateFieldPath({
      registry,
      source,
      fieldPath,
      fieldCapability: "selectable",
      relationCapability: "selectable",
      issues,
    });
  }

  if (query.where !== undefined) {
    validateFilter({ registry, source, filter: query.where, issues });
  }

  for (const fieldPath of query.groupBy ?? []) {
    validateFieldPath({
      registry,
      source,
      fieldPath,
      fieldCapability: "groupable",
      relationCapability: "selectable",
      issues,
    });
  }

  for (const orderBy of query.orderBy ?? []) {
    validateFieldPath({
      registry,
      source,
      fieldPath: orderBy.field,
      fieldCapability: "sortable",
      relationCapability: "selectable",
      issues,
    });
  }

  if (issues.length > 0) {
    return yield* new QueryValidationError({ issues });
  }

  return query;
});

export const validateQuerySpec = (input: ValidateQuerySpecInput): QuerySpec =>
  unwrapValidateQuerySpecResult(Effect.runSync(Effect.either(validateQuerySpecEffect(input))));

export const validateQuerySpecPromise = async (input: ValidateQuerySpecInput): Promise<QuerySpec> =>
  unwrapValidateQuerySpecResult(
    await Effect.runPromise(Effect.either(validateQuerySpecEffect(input))),
  );

type FieldCapability = "selectable" | "filterable" | "sortable" | "groupable";
type RelationCapability = "selectable" | "filterable";

const parseValidationInput = <Value>(input: "query" | "registry", parse: () => Value) =>
  Effect.try({
    try: parse,
    catch: (error) => {
      if (error instanceof ZodError) {
        return new QueryParseError({ input, error });
      }

      throw error;
    },
  });

const unwrapValidateQuerySpecResult = (
  result: Either.Either<QuerySpec, ValidateQuerySpecError>,
): QuerySpec => {
  if (result._tag === "Left") {
    throw result.left;
  }

  return result.right;
};

const validateLimit = (
  query: QuerySpec,
  source: ResolvedSource,
  issues: QueryValidationIssue[],
) => {
  if (query.limit !== undefined && source.maxLimit !== undefined && query.limit > source.maxLimit) {
    issues.push({
      code: "limit_exceeds_max",
      source: source.publicName,
      limit: query.limit,
      maxLimit: source.maxLimit,
    });
  }
};

const validateFilter = (input: {
  registry: ResolvedRegistry;
  source: ResolvedSource;
  filter: QueryFilter;
  issues: QueryValidationIssue[];
}) => {
  if ("and" in input.filter) {
    for (const filter of input.filter.and) {
      validateFilter({ ...input, filter });
    }
    return;
  }

  if ("or" in input.filter) {
    for (const filter of input.filter.or) {
      validateFilter({ ...input, filter });
    }
    return;
  }

  const result = validateFieldPath({
    registry: input.registry,
    source: input.source,
    fieldPath: input.filter.field,
    fieldCapability: "filterable",
    relationCapability: "filterable",
    issues: input.issues,
  });

  if (result === undefined || !result.field.filterable) {
    return;
  }

  if (!result.field.operators.includes(input.filter.op)) {
    input.issues.push({
      code: "operator_not_allowed",
      source: result.source.publicName,
      path: input.filter.field,
      field: result.field.publicName,
      operator: input.filter.op,
      allowedOperators: result.field.operators,
    });
  }
};

const validateFieldPath = (input: {
  registry: ResolvedRegistry;
  source: ResolvedSource;
  fieldPath: string;
  fieldCapability: FieldCapability;
  relationCapability: RelationCapability;
  issues: QueryValidationIssue[];
}): { source: ResolvedSource; field: ResolvedField } | undefined => {
  const parts = input.fieldPath.split(".");
  const fieldName = parts.at(-1);

  if (fieldName === undefined || fieldName.length === 0) {
    return undefined;
  }

  let source = input.source;
  const relationNames = parts.slice(0, -1);

  for (const [index, relationName] of relationNames.entries()) {
    const relation = source.relations[relationName];

    if (relation === undefined) {
      input.issues.push({
        code: "unknown_relation",
        source: source.publicName,
        path: input.fieldPath,
        relation: relationName,
      });
      return undefined;
    }

    validateRelationPath({
      relation,
      source,
      relationName,
      requestedDepth: relationNames.length - index,
      fieldPath: input.fieldPath,
      relationCapability: input.relationCapability,
      issues: input.issues,
    });

    const targetSource = input.registry.sources[relation.target];

    if (targetSource === undefined) {
      input.issues.push({ code: "unknown_source", source: relation.target });
      return undefined;
    }

    source = targetSource;
  }

  const field = source.fields[fieldName];

  if (field === undefined) {
    input.issues.push({
      code: "unknown_field",
      source: source.publicName,
      path: input.fieldPath,
      field: fieldName,
    });
    return undefined;
  }

  validateFieldCapability({
    source,
    field,
    fieldPath: input.fieldPath,
    fieldCapability: input.fieldCapability,
    issues: input.issues,
  });

  return { source, field };
};

const validateRelationPath = (input: {
  relation: ResolvedRelation;
  source: ResolvedSource;
  relationName: string;
  requestedDepth: number;
  fieldPath: string;
  relationCapability: RelationCapability;
  issues: QueryValidationIssue[];
}) => {
  if (!input.relation[input.relationCapability]) {
    input.issues.push({
      code:
        input.relationCapability === "filterable"
          ? "relation_not_filterable"
          : "relation_not_selectable",
      source: input.source.publicName,
      path: input.fieldPath,
      relation: input.relationName,
    });
  }

  if (input.requestedDepth > input.relation.maxDepth) {
    input.issues.push({
      code: "relation_depth_exceeded",
      source: input.source.publicName,
      path: input.fieldPath,
      relation: input.relationName,
      requestedDepth: input.requestedDepth,
      maxDepth: input.relation.maxDepth,
    });
  }
};

const validateFieldCapability = (input: {
  source: ResolvedSource;
  field: ResolvedField;
  fieldPath: string;
  fieldCapability: FieldCapability;
  issues: QueryValidationIssue[];
}) => {
  if (input.field[input.fieldCapability]) {
    return;
  }

  input.issues.push({
    code: fieldCapabilityIssueCode[input.fieldCapability],
    source: input.source.publicName,
    path: input.fieldPath,
    field: input.field.publicName,
  });
};

const fieldCapabilityIssueCode = {
  selectable: "field_not_selectable",
  filterable: "field_not_filterable",
  sortable: "field_not_sortable",
  groupable: "field_not_groupable",
} as const;
