import { Effect } from "effect";
import type * as Either from "effect/Either";

import type { JsonValue, QueryFilter, QueryFilterOperator, QuerySortDirection } from "./query.js";
import { ResolvedRegistrySchema } from "./registry.js";
import type { FieldType, RelationKind, ResolvedRegistry, ResolvedSource } from "./registry.js";
import {
  validateQuerySpecEffect,
  type ValidateQuerySpecError,
  type ValidateQuerySpecInput,
} from "./validate-query.js";

export type LowerQuerySpecInput = ValidateQuerySpecInput;

export type LowerQuerySpecError = ValidateQuerySpecError;

export type QueryIR = {
  readonly kind: "select";
  readonly source: QueryIRSourceRef;
  readonly select: readonly QueryIRFieldRef[];
  readonly joins: readonly QueryIRJoin[];
  readonly where?: QueryIRFilter | undefined;
  readonly groupBy: readonly QueryIRFieldRef[];
  readonly orderBy: readonly QueryIROrderBy[];
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
};

export type QueryIRSourceRef = {
  readonly publicName: string;
  readonly physicalSource: string;
};

export type QueryIRFieldRef = {
  readonly path: string;
  readonly source: QueryIRSourceRef;
  readonly field: {
    readonly publicName: string;
    readonly physicalField: string;
  };
  readonly type: FieldType;
  readonly nullable: boolean;
};

export type QueryIRJoin = {
  readonly path: string;
  readonly relation: {
    readonly publicName: string;
    readonly physicalRelation: string;
  };
  readonly kind: RelationKind;
  readonly from: QueryIRSourceRef;
  readonly to: QueryIRSourceRef;
  readonly localFields: readonly string[];
  readonly foreignFields: readonly string[];
};

export type QueryIRFilter =
  | {
      readonly and: readonly QueryIRFilter[];
    }
  | {
      readonly or: readonly QueryIRFilter[];
    }
  | {
      readonly field: QueryIRFieldRef;
      readonly op: QueryFilterOperator;
      readonly value?: JsonValue | undefined;
    };

export type QueryIROrderBy = {
  readonly field: QueryIRFieldRef;
  readonly direction: QuerySortDirection;
};

export const lowerQuerySpecToIREffect: (
  input: LowerQuerySpecInput,
) => Effect.Effect<QueryIR, LowerQuerySpecError> = Effect.fn("lowerQuerySpecToIR")(function* (
  input: LowerQuerySpecInput,
) {
  const query = yield* validateQuerySpecEffect(input);
  const registry = ResolvedRegistrySchema.parse(input.registry);
  const source = registry.sources[query.source]!;
  const joins = new Map<string, QueryIRJoin>();
  const context: LoweringContext = { registry, joins };
  const where = query.where === undefined ? undefined : lowerFilter(context, source, query.where);
  const select = query.select.map((fieldPath) => lowerFieldPath(context, source, fieldPath));
  const groupBy = (query.groupBy ?? []).map((fieldPath) =>
    lowerFieldPath(context, source, fieldPath),
  );
  const orderBy = (query.orderBy ?? []).map((orderBy) => ({
    field: lowerFieldPath(context, source, orderBy.field),
    direction: orderBy.direction,
  }));

  return {
    kind: "select",
    source: sourceRef(source),
    select,
    joins: [...joins.values()],
    ...(where === undefined ? {} : { where }),
    groupBy,
    orderBy,
    ...(query.limit === undefined ? {} : { limit: query.limit }),
    ...(query.offset === undefined ? {} : { offset: query.offset }),
  };
});

export const lowerQuerySpecToIR = (input: LowerQuerySpecInput): QueryIR =>
  unwrapLowerQuerySpecResult(Effect.runSync(Effect.either(lowerQuerySpecToIREffect(input))));

export const lowerQuerySpecToIRPromise = async (input: LowerQuerySpecInput): Promise<QueryIR> =>
  unwrapLowerQuerySpecResult(
    await Effect.runPromise(Effect.either(lowerQuerySpecToIREffect(input))),
  );

type LoweringContext = {
  readonly registry: ResolvedRegistry;
  readonly joins: Map<string, QueryIRJoin>;
};

const unwrapLowerQuerySpecResult = (
  result: Either.Either<QueryIR, LowerQuerySpecError>,
): QueryIR => {
  if (result._tag === "Left") {
    throw result.left;
  }

  return result.right;
};

const lowerFilter = (
  context: LoweringContext,
  source: ResolvedSource,
  filter: QueryFilter,
): QueryIRFilter => {
  if ("and" in filter) {
    return {
      and: filter.and.map((child) => lowerFilter(context, source, child)),
    };
  }

  if ("or" in filter) {
    return {
      or: filter.or.map((child) => lowerFilter(context, source, child)),
    };
  }

  return {
    field: lowerFieldPath(context, source, filter.field),
    op: filter.op,
    ...(filter.value === undefined ? {} : { value: filter.value }),
  };
};

const lowerFieldPath = (
  context: LoweringContext,
  source: ResolvedSource,
  fieldPath: string,
): QueryIRFieldRef => {
  const parts = fieldPath.split(".");
  const fieldName = parts.at(-1)!;
  const relationNames = parts.slice(0, -1);
  let currentSource = source;
  const joinPathParts: string[] = [];

  for (const relationName of relationNames) {
    const relation = currentSource.relations[relationName]!;
    const targetSource = context.registry.sources[relation.target]!;
    joinPathParts.push(relationName);
    const joinPath = joinPathParts.join(".");

    if (!context.joins.has(joinPath)) {
      context.joins.set(joinPath, {
        path: joinPath,
        relation: {
          publicName: relation.publicName,
          physicalRelation: relation.physicalRelation,
        },
        kind: relation.kind,
        from: sourceRef(currentSource),
        to: sourceRef(targetSource),
        localFields: relation.localFields,
        foreignFields: relation.foreignFields,
      });
    }

    currentSource = targetSource;
  }

  const field = currentSource.fields[fieldName]!;

  return {
    path: fieldPath,
    source: {
      publicName: currentSource.publicName,
      physicalSource: field.physicalSource,
    },
    field: {
      publicName: field.publicName,
      physicalField: field.physicalField,
    },
    type: field.type,
    nullable: field.nullable,
  };
};

const sourceRef = (source: ResolvedSource): QueryIRSourceRef => ({
  publicName: source.publicName,
  physicalSource: source.physicalSource,
});
