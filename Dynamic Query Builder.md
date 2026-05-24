# Design Spec: QueryKit — Registry-Backed JSON Query Compiler

## 1. Summary

QueryKit is an embeddable TypeScript library for validating JSON query specs against a trusted registry and compiling them into safe executable query representations.

The core idea is simple:

```txt
untrusted JSON query
  + trusted resolved registry
  -> validated query
  -> QueryIR
  -> adapter executable
```

QueryKit should provide:

```txt
- Standard query schema
- Standard registry schema
- Physical registry generation from ORM/schema metadata
- Registry policy layer for user customization
- Per-request resolved registry
- Registry-aware query validation
- QueryIR normalization
- Adapter compiler contracts
- Drizzle adapter
- Prisma adapter path
- Builder manifest contracts
- Forensic/explain tracing
- Promise API
- Effect API
```

The strongest architectural boundary is:

```txt
Host applications decide what is exposed.
QueryKit validates and compiles only what the resolved registry allows.
Adapters translate QueryIR into executable backend-specific queries.
```

Business-specific drivers are optional. They sit above QueryKit and translate domain-specific specs into QueryKit's standard query schema.

---

## 2. Core Problem

Many apps repeatedly implement the same technical query work:

```txt
- Validate query input
- Resolve allowed fields
- Apply filters
- Join related tables
- Aggregate values
- Sort and paginate
- Execute SQL
- Format rows
- Debug wrong numbers
- Explain why a field/filter is rejected
```

This appears in:

```txt
- Admin tables
- Saved reports
- Dashboard widgets
- Exports
- Document mappings
- External API reports
- Client portal pages
```

The goal is not to centralize all business logic.

The goal is to centralize the safe technical query contract.

---

## 3. Non-Goals

QueryKit is not:

```txt
- A full BI platform
- A no-code backend
- An ORM
- A GraphQL server
- A REST server
- A public SQL builder
- A SQL-in-JSON language
- An authorization framework
- A replacement for Drizzle or Prisma
```

QueryKit should not know what concepts like “client-visible”, “Finlandia”, “Skyflow”, “Meta Ads”, or “role X can see margin” mean.

Those concepts belong in host application policy, registry policies, mandatory constraints, or optional business drivers.

---

## 4. High-Level Architecture

```txt
ORM / database schema
        ↓
Adapter introspection
        ↓
PhysicalRegistry
        +
Engine defaults
        +
RegistryPolicy from code/db/UI
        +
Request context
        ↓
ResolvedRegistry
        +
Unknown JSON query
        ↓
QuerySpecSchema.parse
        ↓
Registry-aware validation
        ↓
QueryIR
        ↓
Adapter compiler
        ↓
Adapter execution
        ↓
Rows + explain trace
```

The host application owns:

```txt
- Which physical sources are exposed
- Public field names
- Labels and descriptions
- Per-source and per-field capabilities
- Tenant/user/role-specific policy
- Mandatory row constraints
- Business-specific transforms into QuerySpec
- Final application response shape
```

QueryKit owns:

```txt
- Standard query schema
- Standard registry schemas
- Registry resolution
- Registry-aware query validation
- QueryIR lowering
- Adapter compiler contracts
- Parameter binding
- Execution hooks
- Tracing
- Explain output
```

Adapters own:

```txt
- ORM/schema introspection into PhysicalRegistry
- QueryIR compilation into adapter executable form
- Adapter-specific execution
- Adapter-specific row normalization
```

---

## 5. Core Contracts

QueryKit has two primary public contracts:

```txt
1. QuerySpecSchema
2. Registry schemas
```

Everything else exists to parse, validate, resolve, lower, compile, execute, or explain those contracts.

---

## 6. Query Spec Schema

The query spec is the public JSON contract accepted by QueryKit.

It describes query intent, not SQL syntax.

Example:

```json
{
  "version": "v1",
  "source": "placement",
  "select": ["name", "status", "budget", "campaign.name"],
  "where": {
    "and": [
      { "field": "status", "op": "eq", "value": "active" },
      { "field": "budget", "op": "gte", "value": 10000 }
    ]
  },
  "orderBy": [{ "field": "budget", "direction": "desc" }],
  "limit": 50
}
```

Initial TypeScript shape:

```ts
type QuerySpec = {
  version: "v1";
  source: string;
  select: string[];
  where?: QueryFilter;
  groupBy?: string[];
  orderBy?: Array<{
    field: string;
    direction: "asc" | "desc";
  }>;
  limit?: number;
  offset?: number;
};
```

Field references are public registry paths:

```txt
name
budget
campaign.name
client.organization.name
```

Relation fields use derived joins. A query does not declare joins directly; instead, the compiler derives the required join plan from validated public field paths.

This is intentional for UI ergonomics:

```txt
Registry-backed field picker
  -> campaign.name
  -> QuerySpec.select / where / groupBy / orderBy
```

Derived joins are not arbitrary joins. Registry validation must reject a dotted path unless:

```txt
- Every relation segment exists in the resolved registry
- The relation is exposed
- The relation has the required capability for the query position
- The traversal stays within maxDepth
- The target field exists and has the required capability
```

For example, `campaign.name` is accepted only if the resolved `placement` source exposes a `campaign` relation targeting a resolved `campaign` source, and that target exposes `name`.

The derived join plan must be emitted in the compiled representation so users and adapters can inspect the actual work:

```txt
campaign.name
  -> join path: campaign
  -> placements.campaignId = campaigns.id
```

The query schema must not allow:

```txt
- Raw table names
- Raw column names
- Raw SQL fragments
- Arbitrary function names
- Arbitrary joins
- Arbitrary relation conditions
```

Zod validates the JSON shape.

Registry validation checks semantic correctness:

```txt
- Does source exist?
- Does field exist?
- Is field selectable?
- Is field filterable?
- Is operator valid for this field?
- Is value type compatible?
- Is relation traversal allowed?
- Is relation depth allowed?
- Is limit within bounds?
```

---

## 7. Registry Model

QueryKit uses three registry layers:

```txt
PhysicalRegistry
  generated from ORM/schema metadata

RegistryPolicy
  user-authored allowlist and customization layer

ResolvedRegistry
  per-request effective registry used by validation and compilation
```

This gives QueryKit two important properties:

```txt
- The physical schema can be generated automatically.
- The public query surface can be curated safely.
```

---

## 8. Physical Registry

The physical registry contains technical facts only.

It is generated by adapters from ORM/schema metadata.

```ts
type PhysicalRegistry = {
  sources: Record<string, PhysicalSource>;
};

type PhysicalSource = {
  kind: "table" | "view" | "model";
  name: string;
  schema?: string;
  primaryKey?: string[];
  fields: Record<string, PhysicalField>;
  relations?: Record<string, PhysicalRelation>;
  adapterMeta?: Record<string, unknown>;
};

type PhysicalField = {
  type: "string" | "number" | "boolean" | "date" | "datetime" | "json" | "enum" | "unknown";
  nullable: boolean;
  enumValues?: string[];
  adapterMeta?: Record<string, unknown>;
};

type PhysicalRelation = {
  kind: "one" | "many";
  target: string;
  localFields: string[];
  foreignFields: string[];
  nullable?: boolean;
  adapterMeta?: Record<string, unknown>;
};
```

The physical registry does not decide:

```txt
- Visibility
- Labels
- Permissions
- Public field names
- Allowed filters
- Allowed sorts
- Allowed aggregates
- Client-facing availability
```

It only says:

```txt
- This source exists
- This field exists
- This relation exists
- This is the physical name
- This is the inferred value type
- This is nullable or not
```

---

## 9. Registry Policy

The registry policy decides what is exposed and how it is named.

It is plain data, so it can come from:

```txt
- TypeScript code
- JSON config
- Database rows
- Codegen output
- A future QueryKit UI
```

Shape:

```ts
type RegistryPolicy = {
  sources?: Record<string, SourcePolicy>;
};

type SourcePolicy = {
  expose?: boolean;
  exposeAs?: string;
  label?: string;
  description?: string;
  maxLimit?: number;
  defaultLimit?: number;
  fields?: Record<string, FieldPolicy>;
  relations?: Record<string, RelationPolicy>;
};

type FieldPolicy = {
  expose?: boolean;
  exposeAs?: string;
  label?: string;
  description?: string;
  type?: "string" | "number" | "boolean" | "date" | "datetime" | "json" | "enum";
  selectable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  groupable?: boolean;
  operators?: string[];
  aggregations?: Array<"count" | "sum" | "avg" | "min" | "max">;
};

type RelationPolicy = {
  expose?: boolean;
  exposeAs?: string;
  target?: string;
  selectable?: boolean;
  filterable?: boolean;
  maxDepth?: number;
};
```

Example:

```ts
const policy = {
  sources: {
    placements: {
      expose: true,
      exposeAs: "placement",
      label: "Placement",
      defaultLimit: 100,
      maxLimit: 500,
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
          operators: ["eq", "in"],
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
  },
};
```

This policy can be authored in code or stored as JSON. Both paths should produce the same runtime structure.

---

## 10. Resolved Registry

The resolved registry is the effective query surface.

It is generated per request from:

```txt
- PhysicalRegistry
- Engine defaults
- One or more RegistryPolicy objects
- Request context
```

Example:

```ts
const resolved = resolveRegistry({
  physical,
  defaults,
  policies: [basePolicy, rolePolicy, tenantPolicy],
  context: {
    userId,
    organizationId,
    role,
  },
});
```

Resolution should happen conceptually on every query call.

It may be cached later with a key such as:

```txt
physical version + policy version + tenant/user/role scope
```

Resolution rules must be explicit:

```txt
- Deny by default unless configured otherwise
- expose: false disables everything beneath it
- Source not exposed means fields and relations are unavailable
- Field not exposed means it cannot be selected, filtered, sorted, grouped, or aggregated
- Field capability cannot exceed source capability
- Operators must be valid for field type and field policy
- Public source names must not collide
- Public field names must not collide
- Stale policy references must produce structured errors
```

The compiler should only use `ResolvedRegistry`.

---

## 11. Defaults

Defaults should be first-class so policies stay small.

Example:

```ts
const defaults = {
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
};
```

The default mode should be safe:

```txt
deny-by-default
```

Users can opt into convenience modes, but exposure should be explicit.

---

## 12. QueryIR

`QueryIR` is the normalized adapter-facing AST.

```txt
QuerySpec + ResolvedRegistry
  -> QueryIR
  -> adapter executable
```

Adapters compile `QueryIR`, not raw user JSON.

Example shape:

```ts
type QueryIR = {
  kind: "select";
  id: string;
  source: ResolvedSource;
  select: QueryIRSelectItem[];
  joins: QueryIRJoin[];
  where?: QueryIRExpression;
  groupBy: QueryIRExpression[];
  orderBy: QueryIROrderBy[];
  limit?: number;
  offset?: number;
};
```

The IR should contain:

```txt
- Resolved physical references
- Public-to-physical field mapping
- Generated table aliases
- Resolved relation paths
- Bound params
- Normalized arrays
- Validated limit/offset
```

`QueryIR.joins` is a derived join plan. It is generated from validated dotted field paths, deduplicated by relation path, and contains the physical join keys from the resolved registry.

Example:

```txt
select: ["name", "campaign.name"]

derived joins:
  campaign: placements.campaignId = campaigns.id
```

The IR is the point where the query becomes backend-compilable.

---

## 13. Adapter Responsibilities

Each adapter has two jobs:

```txt
ORM/schema -> PhysicalRegistry
QueryIR -> adapter executable
```

For Drizzle:

```txt
Drizzle schema -> PhysicalRegistry
QueryIR -> Drizzle SQL
```

For Prisma:

```txt
Prisma schema / DMMF -> PhysicalRegistry
QueryIR -> Prisma raw SQL initially
```

Prisma object-query compilation can be added later for the subset Prisma can represent cleanly.

The core should not be shaped around Prisma's `findMany` API.

The adapter executable might be:

```txt
- Drizzle SQL object
- Raw SQL + params
- Prisma raw query call
- Kysely query
- External analytics API payload
```

---

## 14. Drizzle Adapter

The Drizzle adapter should:

```txt
- Generate PhysicalRegistry from Drizzle schema
- Compile QueryIR to Drizzle SQL template objects
- Execute through a Drizzle database instance
- Normalize rows
```

Initial compiler scope:

```txt
- select
- from
- joins
- where
- group by
- order by
- limit
- offset
- params
```

It may compile to Drizzle's `sql` template API rather than the fluent query builder because dynamic plans often map more cleanly to SQL fragments.

---

## 15. Prisma Adapter

The Prisma adapter should start conservatively.

Initial support:

```txt
- Generate PhysicalRegistry from Prisma schema / DMMF
- Compile QueryIR to raw SQL + params
- Execute through Prisma raw query APIs
```

Later support:

```txt
- Compile a limited QueryIR subset to Prisma object queries
```

The object-query subset may support:

```txt
- Simple selects
- Simple where filters
- Simple orderBy
- Simple pagination
```

It should reject unsupported QueryIR nodes explicitly.

---

## 16. Builder Manifest

Frontend builders should not consume `PhysicalRegistry`.

They should consume a manifest derived from `ResolvedRegistry`.

Bad:

```txt
Frontend sees every database table and column.
```

Good:

```txt
Frontend asks QueryKit:
What can this user build in this context?
```

The manifest can include:

```txt
- Public sources
- Public fields
- Labels
- Field types
- Operators
- Sortable fields
- Groupable fields
- Aggregate-capable fields
- Relation paths
- Limits
```

The manifest is safe to expose because it is derived from the resolved public registry, not from physical schema facts.

---

## 17. Forensic / Explain Mode

Every execution should be explainable.

Trace steps should include:

```txt
- parse-query
- resolve-registry
- validate-query
- lower-to-ir
- compile
- execute
- render
```

Example:

```json
{
  "steps": [
    { "name": "parse-query", "status": "ok" },
    { "name": "resolve-registry", "status": "ok" },
    { "name": "validate-query", "status": "ok" },
    { "name": "lower-to-ir", "status": "ok" },
    {
      "name": "compile",
      "status": "ok",
      "summary": {
        "adapter": "drizzle",
        "queryId": "placement-table"
      }
    },
    {
      "name": "execute",
      "status": "ok",
      "timingMs": 42,
      "rowCount": 31
    }
  ]
}
```

Useful for:

```txt
- Wrong dashboard numbers
- Wrong exports
- Slow queries
- Unsupported filters
- Permission or policy issues
- Stale registry policy
- Unexpected relation joins
```

Trace output should support redaction.

---

## 18. Security Rules

### 18.1 User JSON Never Becomes SQL

User JSON can only reference public registry names.

Forbidden:

```json
{ "sql": "select * from users" }
```

Allowed:

```json
{ "field": "status", "op": "eq", "value": "active" }
```

### 18.2 Deny By Default

A physical field existing does not mean it is queryable.

```txt
Physical field exists != public field is exposed
```

### 18.3 Registry Is Not Authorization

The registry controls query shape and field exposure.

It does not replace per-user row-level authorization.

Host applications should provide mandatory constraints such as:

```txt
organizationId = ctx.organizationId
tenantId = ctx.tenantId
deletedAt is null
```

### 18.4 Trusted SQL Is Server-Side Only

Trusted SQL escape hatches may exist for migrations and legacy reports.

They must never be available through public JSON query specs.

---

## 19. Optional Business Drivers

Drivers remain useful, but they are no longer the core abstraction.

They translate domain-specific input into `QuerySpec`.

```txt
business JSON
  -> driver.parse
  -> driver.authorize
  -> driver.toQuerySpec
  -> QueryKit core
  -> driver.render
```

Examples:

```txt
- Docgen mappings
- Dashboard widget configs
- External API report params
- Saved report formats
```

The core compiler should not depend on drivers.

---

## 20. Package Structure

Recommended package exports:

```txt
@ypanagidis/querykit
@ypanagidis/querykit/effect
@ypanagidis/querykit/drizzle
@ypanagidis/querykit/drizzle-effect
@ypanagidis/querykit/prisma
@ypanagidis/querykit/codegen
@ypanagidis/querykit/react
```

Core exports:

```ts
QuerySpecSchema
PhysicalRegistrySchema
RegistryPolicySchema
ResolvedRegistrySchema
parseQuerySpec
resolveRegistry
validateQuerySpec
lowerQuerySpecToIR
QueryIR
createQueryKitEngine
defineQuerySpecDriver
```

Drizzle exports:

```ts
generateDrizzlePhysicalRegistry
compileQueryIRToDrizzle
createDrizzleEngine
```

Prisma exports:

```ts
generatePrismaPhysicalRegistry
compileQueryIRToPrismaRaw
createPrismaEngine
```

---

## 21. Implementation Phases

### Phase 1 — Core Contracts

Build:

```txt
- QuerySpecSchema
- PhysicalRegistrySchema
- RegistryPolicySchema
- ResolvedRegistrySchema
- Registry defaults
- Registry resolver
- Registry-aware query validator
- QuerySpec to QueryIR lowering
- Explain trace model
```

### Phase 2 — Drizzle Adapter

Build:

```txt
- Drizzle schema to PhysicalRegistry
- QueryIR to Drizzle SQL
- Drizzle execution
```

### Phase 3 — Prisma Adapter

Build:

```txt
- Prisma schema/DMMF to PhysicalRegistry
- QueryIR to Prisma raw SQL execution
- Later: limited Prisma object query compiler
```

### Phase 4 — Builder Manifest

Build:

```txt
- ResolvedRegistry to builder manifest
- Field/operator metadata for UI builders
- Optional registry policy editor primitives
```

### Phase 5 — Optional Drivers

Build:

```txt
- Driver interface for domain-specific specs
- Docgen driver migration
- Dashboard/report driver helpers
```

---

## 22. MVP Scope

The first useful version should include:

```txt
- Standard QuerySpec schema
- Standard registry schemas
- Registry resolver
- Registry-aware validation
- QueryIR lowering
- Drizzle physical registry generation
- Drizzle QueryIR compiler
- Explain trace
```

Do not include initially:

```txt
- Full BI query compiler
- Complex formula language
- Window functions
- CTE builder
- Public plugin system
- Full dashboard builder UI
- Prisma object-query compiler beyond a small subset
```

---

## 23. Final Position

QueryKit should be:

> A registry-backed JSON query compiler for TypeScript apps. It validates a standard query spec against a trusted per-request resolved registry, lowers it to QueryIR, compiles it through adapters such as Drizzle and Prisma, and provides forensic traces for every step.

The central product is not the ORM adapter.

The central product is the safe query contract:

```txt
QuerySpec + ResolvedRegistry -> QueryIR
```
