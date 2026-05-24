export const queryKitVersion = "0.0.2-alpha.0";

export {
  JsonValueSchema,
  parseQuerySpec,
  QueryFilterOperatorSchema,
  QueryFilterSchema,
  QueryOrderBySchema,
  QuerySortDirectionSchema,
  QuerySpecSchema,
  QueryVersionSchema,
  safeParseQuerySpec,
} from "./specs/query.js";
export type {
  JsonValue,
  QueryFilter,
  QueryFilterOperator,
  QueryOrderBy,
  QuerySortDirection,
  QuerySpec,
} from "./specs/query.js";

export {
  AdapterMetaSchema,
  AggregationSchema,
  ExposureModeSchema,
  FieldDefaultsSchema,
  FieldPolicySchema,
  FieldTypeSchema,
  parsePhysicalRegistry,
  parseRegistryDefaults,
  parseRegistryPolicy,
  parseResolvedRegistry,
  PhysicalFieldSchema,
  PhysicalRegistrySchema,
  PhysicalRelationSchema,
  PhysicalSourceKindSchema,
  PhysicalSourceSchema,
  RegistryDefaultsSchema,
  RegistryPolicySchema,
  RegistryVersionSchema,
  RelationDefaultsSchema,
  RelationKindSchema,
  RelationPolicySchema,
  ResolvedFieldSchema,
  ResolvedRegistrySchema,
  ResolvedRelationSchema,
  ResolvedSourceSchema,
  safeParsePhysicalRegistry,
  safeParseRegistryDefaults,
  safeParseRegistryPolicy,
  safeParseResolvedRegistry,
  SourceDefaultsSchema,
  SourcePolicySchema,
} from "./specs/registries.js";
export type {
  Aggregation,
  FieldPolicy,
  FieldType,
  PhysicalRegistryLike,
  PhysicalField,
  PhysicalRegistry,
  PhysicalRelation,
  PhysicalSource,
  PhysicalSourceLike,
  Policy,
  PolicySource,
  RegistryDefaults,
  RegistryPolicy,
  RelationPolicy,
  ResolvedField,
  ResolvedRegistry,
  ResolvedRelation,
  ResolvedSource,
  SourcePolicy,
} from "./specs/registries.js";

export {
  RegistryParseError,
  RegistryResolutionError,
  RegistryResolutionIssueSchema,
  resolveRegistry,
  resolveRegistryEffect,
  resolveRegistryPromise,
} from "./registry/resolve.js";
export type {
  RegistryResolutionIssue,
  ResolveRegistryError,
  ResolveRegistryInput,
} from "./registry/resolve.js";

export {
  QueryParseError,
  QueryValidationError,
  QueryValidationIssueSchema,
  validateQuerySpec,
  validateQuerySpecEffect,
  validateQuerySpecPromise,
} from "./query/validate.js";
export type {
  QueryValidationIssue,
  ValidateQuerySpecError,
  ValidateQuerySpecInput,
} from "./query/validate.js";

export {
  lowerQuerySpecToIR,
  lowerQuerySpecToIREffect,
  lowerQuerySpecToIRPromise,
} from "./query/lower.js";
export type {
  LowerQuerySpecError,
  LowerQuerySpecInput,
  QueryIR,
  QueryIRFieldRef,
  QueryIRFilter,
  QueryIRJoin,
  QueryIROrderBy,
  QueryIRSourceRef,
} from "./query/lower.js";

export {
  compileQuerySpecToSQL,
  compileQuerySpecToSQLEffect,
  compileQuerySpecToSQLPromise,
} from "./compiler/sql/index.js";
export type {
  CompileQuerySpecToSQLError,
  CompileQuerySpecToSQLInput,
  SQLDialect,
  SQLPlan,
} from "./compiler/sql/index.js";

export {
  buildQueryIRResultSchema,
  buildQueryIRRowSchema,
  parseQueryIRResultRows,
  safeParseQueryIRResultRows,
} from "./results/schema.js";
export type { QueryResultRow, QueryResultRows } from "./results/schema.js";
