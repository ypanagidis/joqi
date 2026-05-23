# Design Spec: `QueryKit` — Driver-Based Dynamic Query Runtime

## 1. Summary

`QueryKit` is an npm package for building dynamic, JSON-driven data features without mixing business logic into the core query engine.

The package provides:

```txt
- Strong driver interface
- Internal neutral query shape
- Query plan schema
- Query compiler
- Drizzle adapter
- Generated physical registry from Drizzle schema
- Builder manifest contracts for frontend UI builders
- Forensic / explain tracing
- Promise API for normal TypeScript users
- Effect API for Effect users
```

The key principle:

```txt
Business domains own business rules.
QueryKit owns technical query execution.
```

A business domain can define its own driver for things like:

```txt
- Docgen template mappings
- Dynamic dashboards
- External API reports
- Admin table views
- Exports
- Alerts
- Saved reports
- Client portal pages
```

Each driver translates its own business-specific JSON spec into a neutral query plan that QueryKit can compile and execute.

---

# 2. Core Problem

Today, many systems hardcode:

```txt
- Dashboard widgets
- Report fields
- Table columns
- Document mappings
- Export formats
- Filter bars
- Chart configs
- API response shapes
- Alert rules
```

This leads to repeated code across apps and domains.

For example:

```txt
Skyflow dashboards
Symphony One dashboards
External API v2 reports
Docgen mappings
Admin tables
Exports
```

all contain different versions of the same technical work:

```txt
- Validate input
- Resolve allowed fields
- Build queries
- Apply filters
- Join tables
- Aggregate metrics
- Execute SQL
- Format output
- Debug wrong numbers
```

The goal is not to centralize all business rules.

The goal is to centralize the technical query runtime.

---

# 3. Non-Goals

QueryKit is **not**:

```txt
- A full BI platform
- A no-code backend for everything
- A replacement for business code
- A public SQL builder
- A generic business rules engine
- A replacement for Drizzle
- A replacement for domain-specific drivers
```

QueryKit should not know what “Finlandia”, “Skyflow”, “Symphony One”, “Meta Ads”, “Google Ads”, or “client-visible field” means.

Those concepts belong in drivers.

---

# 4. High-Level Architecture

```txt
JSON spec / API request / saved template
        ↓
Business driver
        ↓
Business validation + planning
        ↓
Neutral QueryPlan
        ↓
QueryKit runtime
        ↓
Compiler / Drizzle adapter
        ↓
Database
        ↓
Driver renderer
        ↓
Final payload
```

The business driver owns:

```txt
- Allowed fields
- Allowed params
- Allowed combinations
- Permissions
- Metric formulas
- Source selection
- Business-specific validation
- Output shape
```

QueryKit owns:

```txt
- Query plan schema
- Query compilation
- Parameter binding
- Execution
- Projection
- Tracing
- Explain output
- Registry generation
```

---

# 5. Package Structure

Recommended package exports:

```txt
@up/querykit
@up/querykit/effect
@up/querykit/drizzle
@up/querykit/drizzle-effect
@up/querykit/codegen
@up/querykit/react
```

## 5.1 `@up/querykit`

Default Promise-based API.

For normal TypeScript users.

Exports:

```ts
defineDriver
createQueryRuntime
QueryPlan
LoweredQuery
QueryExpression
BuilderManifest
ExplainTrace
q
```

## 5.2 `@up/querykit/effect`

Effect-native API.

Exports:

```ts
defineEffectDriver
createEffectQueryRuntime
QueryRuntime
QueryEngine
DriverRegistry
RunDriverError
Effect services/layers
```

## 5.3 `@up/querykit/drizzle`

Promise-based Drizzle adapter.

Exports:

```ts
createDrizzleEngine
compileQueryPlanToDrizzle
executeDrizzleQuery
```

## 5.4 `@up/querykit/drizzle-effect`

Effect-native Drizzle adapter.

Exports:

```ts
DrizzleQueryEngineLive
makeDrizzleQueryEngine
```

## 5.5 `@up/querykit/codegen`

Physical registry generator.

Exports:

```ts
defineQueryKitConfig
generatePhysicalRegistry
generateRegistryTypes
```

CLI:

```bash
querykit generate
querykit inspect
querykit validate
querykit explain
```

## 5.6 `@up/querykit/react`

Frontend builder helper contracts.

Exports:

```ts
BuilderManifestSchema
validateSpecAgainstManifest
createBuilderState
```

React components should be optional. The important part is the builder manifest contract.

---

# 6. Core Runtime Flow

```ts
const runtime = createQueryRuntime({
  engine,
  drivers: [
    docgenDriver,
    dashboardDriver,
    performanceReportDriver,
  ],
});

const result = await runtime.run({
  driver: "docgen",
  spec,
  context: {
    userId,
    organizationId,
  },
  explain: true,
});
```

Result:

```ts
type RunResult<TOutput> = {
  data: TOutput;
  trace?: ExplainTrace;
};
```

---

# 7. Driver Interface

## 7.1 Promise-Based Driver

```ts
type QueryDriver<TSpec, TPlan, TOutput> = {
  key: string;
  version: string;

  parse: (input: unknown) => TSpec;

  authorize?: (
    ctx: DriverContext,
    spec: TSpec,
  ) => Promise<void> | void;

  plan: (
    ctx: DriverContext,
    spec: TSpec,
  ) => Promise<TPlan> | TPlan;

  lower: (
    ctx: DriverContext,
    plan: TPlan,
  ) => Promise<LoweredQuery[]> | LoweredQuery[];

  render: (
    ctx: DriverContext,
    args: {
      spec: TSpec;
      plan: TPlan;
      results: QueryResultSet[];
      trace: ExplainTrace;
    },
  ) => Promise<TOutput> | TOutput;

  getBuilderManifest?: (
    ctx: DriverContext,
  ) => Promise<BuilderManifest> | BuilderManifest;
};
```

Example:

```ts
export const docgenDriver = defineDriver({
  key: "docgen",
  version: "v1",

  parse(input) {
    return DocgenSpecSchema.parse(input);
  },

  plan(ctx, spec) {
    return buildDocgenPlan(ctx, spec);
  },

  lower(ctx, plan) {
    return lowerDocgenPlanToQueries(ctx, plan);
  },

  render(ctx, { plan, results }) {
    return buildPlaceholderPayload(plan, results);
  },
});
```

---

## 7.2 Effect-Based Driver

Effect users should get an Effect-native interface.

```ts
type EffectQueryDriver<TSpec, TPlan, TOutput, R = never> = {
  key: string;
  version: string;

  parse: (
    input: unknown,
  ) => Effect.Effect<TSpec, InvalidSpecError, R>;

  authorize?: (
    ctx: DriverContext,
    spec: TSpec,
  ) => Effect.Effect<void, AuthorizationError, R>;

  plan: (
    ctx: DriverContext,
    spec: TSpec,
  ) => Effect.Effect<TPlan, PlanningError, R>;

  lower: (
    ctx: DriverContext,
    plan: TPlan,
  ) => Effect.Effect<LoweredQuery[], LoweringError, R>;

  render: (
    ctx: DriverContext,
    args: {
      spec: TSpec;
      plan: TPlan;
      results: QueryResultSet[];
      trace: ExplainTrace;
    },
  ) => Effect.Effect<TOutput, RenderError, R>;

  getBuilderManifest?: (
    ctx: DriverContext,
  ) => Effect.Effect<BuilderManifest, never, R>;
};
```

Effect should be the internal power-user/runtime layer, but non-Effect users should never be forced to touch it.

---

# 8. Internal Runtime Strategy

Recommended implementation:

```txt
Effect runtime internally
Promise facade externally
```

This avoids maintaining two independent runtimes.

The Promise API can wrap the Effect runtime:

```ts
export function createQueryRuntime(config: RuntimeConfig) {
  const effectRuntime = createEffectQueryRuntime(config);

  return {
    async run(input) {
      return Effect.runPromise(effectRuntime.run(input));
    },

    async explain(input) {
      return Effect.runPromise(effectRuntime.explain(input));
    },

    async getBuilderManifest(input) {
      return Effect.runPromise(effectRuntime.getBuilderManifest(input));
    },
  };
}
```

Do **not** build two separate implementations:

```txt
Bad:
PromiseRuntime.ts
EffectRuntime.ts
```

Prefer:

```txt
Good:
EffectRuntime.ts
PromiseFacade.ts
```

---

# 9. Lowered Query Model

Drivers lower business plans into one or more `LoweredQuery` objects.

```ts
type LoweredQuery =
  | {
      kind: "query-plan";
      id: string;
      plan: QueryPlan;
      params: Record<string, unknown>;
    }
  | {
      kind: "trusted-sql";
      id: string;
      sql: unknown;
      params?: Record<string, unknown>;
      outputColumns?: string[];
    };
```

## 9.1 Why support `trusted-sql`?

Some existing reports are too complex to immediately model as neutral query plans.

For example:

```txt
- External API v2 performance reports
- Finlandia-style reports
- Historical correction queries
- Heavy analytical CTE queries
```

These can initially lower to `trusted-sql`.

Important rule:

```txt
Only server-side trusted drivers can emit trusted SQL.
User JSON can never emit trusted SQL.
```

---

# 10. Neutral Query Plan

Initial `QueryPlan` should be intentionally small.

```ts
type QueryPlan = {
  kind: "query-plan";

  from: QuerySource;

  joins?: QueryJoin[];

  select: QuerySelectItem[];

  where?: QueryExpression;

  groupBy?: QueryExpression[];

  orderBy?: QueryOrderBy[];

  limit?: number;

  offset?: number;
};
```

Example:

```ts
const plan: QueryPlan = {
  kind: "query-plan",

  from: {
    table: "placements",
    alias: "p",
  },

  select: [
    {
      alias: "placement_name",
      expr: q.column("p", "name"),
    },
    {
      alias: "budget",
      expr: q.column("p", "budget"),
    },
  ],

  where: q.eq(
    q.column("p", "status"),
    q.param("status"),
  ),

  orderBy: [
    {
      expr: q.column("p", "budget"),
      direction: "desc",
    },
  ],

  limit: 100,
};
```

---

# 11. Query Expression Helpers

The package should provide helpers for constructing valid query expressions.

```ts
q.column("p", "name")
q.param("status")
q.literal(100)
q.eq(left, right)
q.in(left, right)
q.gte(left, right)
q.lte(left, right)
q.and([...])
q.or([...])
q.sum(expr)
q.count(expr)
q.avg(expr)
q.divide(left, right)
q.multiply([...])
```

Example:

```ts
const cpm = q.multiply([
  q.divide(
    q.column("delivery", "spent"),
    q.column("delivery", "impressions"),
  ),
  q.literal(1000),
]);
```

---

# 12. Query Plan Schema

The internal query shape should be schema-backed.

If using Effect internally, prefer Effect Schema.

But drivers should be allowed to use any schema library.

Recommended rule:

```txt
QueryKit internal schemas use Effect Schema.
Project drivers may use Zod, Effect Schema, Valibot, or custom parse functions.
```

This avoids forcing Effect on non-Effect users.

---

# 13. Physical Registry Generation

QueryKit should generate a **physical registry** from Drizzle schema.

This registry contains technical database facts only.

```ts
type PhysicalRegistry = {
  tables: Record<string, PhysicalTable>;
};

type PhysicalTable = {
  id: string;
  tsName: string;
  dbName: string;
  columns: Record<string, PhysicalColumn>;
  primaryKey: string[];
  relations: Record<string, PhysicalRelation>;
};

type PhysicalColumn = {
  tsName: string;
  dbName: string;
  valueType: "string" | "number" | "boolean" | "date" | "json" | "unknown";
  nullable: boolean;
};

type PhysicalRelation =
  | {
      kind: "many-to-one";
      alias: string;
      fromTable: string;
      toTable: string;
      fromColumn: string;
      toColumn: string;
    }
  | {
      kind: "one-to-many";
      alias: string;
      fromTable: string;
      toTable: string;
      fromColumn: string;
      toColumn: string;
    };
```

The physical registry does **not** decide:

```txt
- Visibility
- Labels
- Business permissions
- Allowed fields
- Allowed filters
- Client-facing availability
```

It only says:

```txt
- This table exists
- This column exists
- This relation exists
- This is the DB column name
- This is the inferred value type
```

---

# 14. Codegen Config

Example:

```ts
// querykit.config.ts
import { defineQueryKitConfig } from "@up/querykit/codegen";

export default defineQueryKitConfig({
  schema: "./src/db/schema.ts",
  relations: "./src/db/relations.ts",

  dialect: "mysql",

  output: {
    registry: "./src/querykit/physical-registry.generated.ts",
    json: "./src/querykit/physical-registry.generated.json",
    types: "./src/querykit/physical-registry.generated.d.ts",
  },
});
```

CLI:

```bash
querykit generate
```

Generated output:

```ts
export const physicalRegistry = {
  tables: {
    mediaPlan: {
      tsName: "mediaPlan",
      dbName: "skyflow_media_plan",
      columns: {
        id: {
          tsName: "id",
          dbName: "id",
          valueType: "string",
          nullable: false,
        },
        name: {
          tsName: "name",
          dbName: "name",
          valueType: "string",
          nullable: false,
        },
      },
      relations: {
        client: {
          kind: "many-to-one",
          alias: "client",
          fromTable: "mediaPlan",
          toTable: "client",
          fromColumn: "clientId",
          toColumn: "id",
        },
      },
    },
  },
} as const;
```

---

# 15. Builder Manifest

Frontend UI builders should not consume the physical registry directly.

They should consume a **driver-produced builder manifest**.

Bad:

```txt
Frontend sees every database table and column.
```

Good:

```txt
Frontend asks driver:
“What can this user build in this business context?”
```

Example manifest:

```json
{
  "driver": "symphony-dashboard",
  "specType": "dashboard",
  "widgets": [
    {
      "type": "metric-card",
      "label": "Metric Card"
    },
    {
      "type": "line-chart",
      "label": "Line Chart"
    },
    {
      "type": "table",
      "label": "Table"
    }
  ],
  "metrics": [
    {
      "id": "impressions",
      "label": "Impressions",
      "format": "integer"
    },
    {
      "id": "spent",
      "label": "Spend",
      "format": "currency"
    },
    {
      "id": "cpm",
      "label": "CPM",
      "format": "currency"
    }
  ],
  "dimensions": [
    {
      "id": "date",
      "label": "Date"
    },
    {
      "id": "placement",
      "label": "Placement"
    },
    {
      "id": "platform",
      "label": "Platform"
    }
  ],
  "filters": [
    {
      "id": "dateRange",
      "label": "Date Range",
      "type": "date-range"
    },
    {
      "id": "platform",
      "label": "Platform",
      "type": "multi-select"
    }
  ]
}
```

The manifest is business-safe.

The physical registry is technical.

---

# 16. Forensic / Explain Mode

Forensic tracing should be a first-class feature.

Every execution should be explainable.

```ts
const result = await runtime.run({
  driver: "symphony-dashboard",
  spec,
  context,
  explain: true,
});
```

Trace example:

```json
{
  "driver": "symphony-dashboard",
  "driverVersion": "v1",
  "specVersion": "v1",
  "steps": [
    {
      "name": "parse",
      "status": "ok"
    },
    {
      "name": "authorize",
      "status": "ok"
    },
    {
      "name": "plan",
      "status": "ok",
      "summary": {
        "widgets": 3,
        "metrics": ["impressions", "views", "spent"],
        "dimensions": ["date"]
      }
    },
    {
      "name": "lower",
      "status": "ok",
      "queries": [
        "impressions-card",
        "views-by-day",
        "placement-table"
      ]
    },
    {
      "name": "compile",
      "status": "ok",
      "compiled": [
        {
          "queryId": "views-by-day",
          "sql": "select ...",
          "params": {
            "from": "2026-05-01",
            "to": "2026-05-31"
          }
        }
      ]
    },
    {
      "name": "execute",
      "status": "ok",
      "timingMs": 42,
      "rowCount": 31
    },
    {
      "name": "render",
      "status": "ok"
    }
  ]
}
```

Useful for:

```txt
- Wrong dashboard numbers
- Wrong generated document values
- Wrong external API response
- Wrong export columns
- Slow queries
- Permission issues
- Unsupported spec debugging
```

Trace output should support redaction:

```ts
createQueryRuntime({
  redactParams(params) {
    return {
      ...params,
      apiKey: "[redacted]",
    };
  },
});
```

---

# 17. Drizzle Adapter

The Drizzle adapter should compile `QueryPlan` into executable Drizzle SQL.

It may compile to Drizzle’s SQL template API rather than only using the fluent query builder, because dynamic plans often map more cleanly to SQL fragments.

The adapter owns:

```txt
- Table quoting
- Column quoting
- Params
- Joins
- Where clauses
- Group by
- Order by
- Limit/offset
- Execution
```

Example:

```ts
const engine = createDrizzleEngine({
  db,
  registry: physicalRegistry,
  dialect: "mysql",
});

const result = await engine.execute({
  kind: "query-plan",
  id: "placement-table",
  plan,
  params,
});
```

---

# 18. Example: Docgen Driver

Input JSON:

```json
{
  "version": "v2",
  "type": "document-mapping",
  "anchor": "mediaPlan",
  "bindings": [
    {
      "target": "client_name",
      "field": "mediaPlan.client.name"
    },
    {
      "target": "budget",
      "field": "mediaPlan.budget",
      "format": "currency"
    }
  ],
  "lists": [
    {
      "target": "placements",
      "source": "mediaPlan.placements",
      "fields": [
        {
          "target": "placement_name",
          "field": "mediaPlan.placements.name"
        },
        {
          "target": "units",
          "field": "mediaPlan.placements.units"
        }
      ]
    }
  ]
}
```

Docgen driver owns:

```txt
- Mapping schema
- Anchor validity
- Allowed document fields
- Placeholder formatting
- List source validation
- Output payload shape
```

QueryKit owns:

```txt
- Query plan validation
- Query compilation
- Query execution
- Trace output
```

---

# 19. Example: Dashboard Driver

Input JSON:

```json
{
  "version": "v1",
  "type": "dashboard",
  "title": "Client Performance",
  "filters": {
    "dateRange": {
      "from": "2026-05-01",
      "to": "2026-05-31"
    }
  },
  "widgets": [
    {
      "id": "impressions_card",
      "type": "metric-card",
      "title": "Impressions",
      "metric": "impressions",
      "comparison": "previous_period"
    },
    {
      "id": "views_by_day",
      "type": "line-chart",
      "title": "Views by Day",
      "dimensions": ["date"],
      "metrics": ["views"]
    },
    {
      "id": "placement_table",
      "type": "table",
      "title": "Placement Performance",
      "dimensions": ["placement"],
      "metrics": ["impressions", "views", "clicks", "spent"]
    }
  ]
}
```

Dashboard driver owns:

```txt
- Allowed widgets
- Allowed metrics
- Allowed dimensions
- Organization scope
- Date range behavior
- Previous-period comparison logic
- Output widget payloads
```

QueryKit owns:

```txt
- Executing aggregate/card/chart/table query plans
```

---

# 20. Example: External API Performance Driver

Input JSON/API params:

```json
{
  "version": "v1",
  "type": "performance-report",
  "source": "all",
  "grain": "ad",
  "segments": ["source", "device"],
  "timeGrain": "daily",
  "dateRange": {
    "from": "2026-05-01",
    "to": "2026-05-31"
  },
  "fields": [
    "date",
    "source",
    "campaign_name",
    "line_item_name",
    "ad_name",
    "impressions",
    "views",
    "clicks",
    "budget"
  ]
}
```

Performance driver owns:

```txt
- Allowed output fields
- API capabilities
- Source selection
- Unsupported source/grain/segment combinations
- Google/Meta normalization
- Historical correction
- Budget formulas
- Metric formulas
```

Initially, this driver can lower to:

```ts
{
  kind: "trusted-sql",
  id: "performance-report",
  sql,
  outputColumns,
}
```

Later, parts can migrate to structured `QueryPlan`.

---

# 21. Security Rules

## 21.1 User JSON never becomes SQL

Forbidden:

```json
{
  "sql": "select * from users"
}
```

Allowed:

```json
{
  "field": "status",
  "op": "eq",
  "value": "active"
}
```

## 21.2 Server-side validation always runs

Even saved specs must be revalidated on execution.

Reasons:

```txt
- Schema changed
- Permissions changed
- Driver changed
- Field was deprecated
- User role changed
```

## 21.3 Deny by default

The physical registry exposing a column does not mean the driver exposes the field.

```txt
Column exists != field is allowed
```

## 21.4 Trusted SQL is driver-only

Only server-side trusted drivers can emit `trusted-sql`.

---

# 22. Versioning and Migrations

Every saved JSON spec must include a version.

```json
{
  "version": "v1",
  "type": "dashboard",
  "widgets": []
}
```

Drivers can provide migrations:

```ts
type SpecMigration = {
  from: string;
  to: string;
  migrate: (oldSpec: unknown) => unknown;
};
```

Example:

```ts
const dashboardMigrations = [
  {
    from: "v1",
    to: "v2",
    migrate: migrateDashboardV1ToV2,
  },
];
```

---

# 23. Caching

QueryKit can generate stable cache keys from:

```txt
- driver key
- driver version
- spec version
- context scope
- query plan hash
- params hash
```

Useful for:

```txt
- Dashboards
- External API reports
- Exports
- Document previews
- Scheduled reports
```

Cache behavior should be configurable and optional.

---

# 24. Testing Strategy

## 24.1 Driver Tests

Business behavior.

```txt
- Reject unsupported field combo
- Reject unauthorized field
- Choose correct source families
- Resolve document fields
- Validate widget specs
```

## 24.2 Query Plan Tests

Lowering behavior.

```txt
- Dashboard card lowers to aggregate query
- Table view lowers to select + filters + pagination
- Docgen list lowers to child relation query
```

## 24.3 Engine Tests

Technical compiler behavior.

```txt
- Joins compile correctly
- Params are bound
- Group by works
- Invalid aliases fail
- Unknown table/column fails
```

## 24.4 Integration Tests

End-to-end with seed data.

```txt
- Dashboard returns expected metrics
- Docgen returns expected placeholder payload
- External report returns expected rows
- Export contains expected columns
```

---

# 25. Implementation Phases

## Phase 1 — Core Package Skeleton

Build:

```txt
@up/querykit
@up/querykit/effect
```

Include:

```txt
- Driver interface
- Effect runtime
- Promise facade
- LoweredQuery type
- QueryPlan schema
- q expression helpers
- error classes
- explain trace model
```

---

## Phase 2 — Drizzle Adapter

Build:

```txt
@up/querykit/drizzle
@up/querykit/drizzle-effect
```

Support:

```txt
- select
- from
- joins
- where
- order by
- limit
- offset
- params
```

Do not start with every SQL feature.

---

## Phase 3 — Physical Registry Generator

Build:

```txt
@up/querykit/codegen
```

Support:

```txt
- Load Drizzle schema
- Extract tables
- Extract columns
- Extract primary keys
- Extract relations
- Emit TS registry
- Emit JSON registry
```

---

## Phase 4 — Migrate Docgen

Turn existing docgen into the first real driver.

```txt
Current mapping JSON
  → DocgenDriver
  → QueryPlan[]
  → QueryKit engine
  → placeholder payload
```

This is the safest first use case.

---

## Phase 5 — Add Table View / Dashboard Driver

Start with simple dynamic tables or simple dashboard widgets.

Support:

```txt
- metric cards
- line charts
- tables
- date filters
- basic dimensions
```

---

## Phase 6 — Wrap External API v2

Do not rewrite it immediately.

Wrap current behavior as a driver:

```txt
parse      → current validators
plan       → current planner
lower      → current aggregate query as trusted-sql
render     → current executor/output parser
```

Later, migrate pieces to structured `QueryPlan`.

---

# 26. MVP Scope

The first useful version should include:

```txt
- Promise driver API
- Effect driver API
- QueryPlan schema
- LoweredQuery support
- Drizzle engine
- Physical registry generator
- Explain trace
- Docgen driver migration
```

Do not include initially:

```txt
- Full BI query compiler
- Complex formula language
- Window functions
- Multi-dialect compiler
- Full dashboard builder UI
- Public plugin system
```

---

# 27. Final Position

`QueryKit` should be:

> A driver-based dynamic query runtime for turning trusted business-owned JSON specs into safe executable query plans, with a generated physical registry, a neutral query compiler, Drizzle execution, builder manifests, and forensic tracing.

It should provide both:

```txt
- Normal async/await API
- Effect-native API
```

So non-Effect developers can use it comfortably, while Effect users get typed errors, services, layers, tracing, and composability.

The strongest architectural boundary is:

```txt
Business drivers decide what is allowed and meaningful.
QueryKit decides how to compile, execute, trace, and debug queries.
```