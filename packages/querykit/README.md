# QueryKit

QueryKit is a registry-backed JSON query compiler for TypeScript apps.

At its core, QueryKit should expose two standard contracts:

```txt
1. Query Schema
2. Registry Schema
```

Given an untrusted JSON query and a trusted registry, QueryKit validates what is allowed, lowers the query into a normalized IR, and hands that IR to an adapter such as Drizzle or Prisma.

```txt
unknown JSON
  -> QuerySpecSchema
  -> ResolvedRegistry validation
  -> QueryIR
  -> adapter compiler
  -> adapter execution
```

The package is currently private under the `@ypanagidis` npm scope.

## Install

```bash
pnpm add @ypanagidis/querykit@alpha
```

## Usage

```ts
import {
  parseQuerySpec,
  parsePhysicalRegistry,
  parseRegistryDefaults,
  parseRegistryPolicy,
  parseResolvedRegistry,
  resolveRegistry,
  resolveRegistryPromise,
  validateQuerySpec,
  lowerQuerySpecToIR,
  compileQuerySpecToSQL,
} from "@ypanagidis/querykit";

const query = parseQuerySpec({
  version: "v1",
  source: "placement",
  select: ["name", "budget"],
  where: { field: "budget", op: "gte", value: 10000 },
  orderBy: [{ field: "budget", direction: "desc" }],
  limit: 50,
});

const resolved = resolveRegistry({
  physical,
  defaults,
  policies: [basePolicy, rolePolicy],
});

const resolvedAsync = await resolveRegistryPromise({
  physical,
  defaults,
  policies: [basePolicy, rolePolicy],
});

const validatedQuery = validateQuerySpec({
  query,
  registry: resolved,
});

const ir = lowerQuerySpecToIR({
  query: validatedQuery,
  registry: resolved,
});

const sqlPlan = compileQuerySpecToSQL({
  query: validatedQuery,
  registry: resolved,
});
```

The resolver is implemented as an Effect and exposed from the Effect subpath:

```ts
import { Effect } from "effect";
import { resolveRegistryEffect } from "@ypanagidis/querykit/effect";

const program = resolveRegistryEffect({
  physical,
  defaults,
  policies: [basePolicy, rolePolicy],
});

const resolved = await Effect.runPromise(program);
```

Resolver failures are Effect-native tagged errors:

```ts
program.pipe(
  Effect.catchTags({
    RegistryParseError: (error) => Effect.succeed(error.error),
    RegistryResolutionError: (error) => Effect.succeed(error.issues),
  }),
);
```

Query validation has the same Effect-first shape:

```ts
import { validateQuerySpecEffect } from "@ypanagidis/querykit/effect";

const validatedQuery = await Effect.runPromise(
  validateQuerySpecEffect({ query, registry: resolved }),
);
```

Query lowering validates the query, resolves public paths to physical field refs, and emits deduplicated joins:

```ts
import { lowerQuerySpecToIREffect } from "@ypanagidis/querykit/effect";

const ir = await Effect.runPromise(
  lowerQuerySpecToIREffect({ query, registry: resolved }),
);
```

The current IR is adapter-neutral:

```ts
type QueryIR = {
  kind: "select";
  source: QueryIRSourceRef;
  select: QueryIRFieldRef[];
  joins: QueryIRJoin[];
  where?: QueryIRFilter;
  groupBy: QueryIRFieldRef[];
  orderBy: QueryIROrderBy[];
  limit?: number;
  offset?: number;
};
```

The MySQL SQL compiler returns raw SQL plus bound params:

```ts
import { compileQuerySpecToSQLEffect } from "@ypanagidis/querykit/effect";

const sqlPlan = await Effect.runPromise(
  compileQuerySpecToSQLEffect({ query, registry: resolved }),
);
```

```ts
type SQLPlan = {
  dialect: "mysql";
  sql: string;
  params: readonly JsonValue[];
};
```

All schemas are also exported directly for advanced validation flows:

```ts
import { QuerySpecSchema, ResolvedRegistrySchema } from "@ypanagidis/querykit";

const result = QuerySpecSchema.safeParse(input);
```

## Core Contracts

### Query Schema

The query schema is the public JSON shape accepted by QueryKit.

It should describe query intent, not raw SQL:

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

The query schema should not expose raw table names, raw column names, raw SQL fragments, or arbitrary function names.

### Field Paths And Derived Joins

QueryKit intentionally uses public dotted field paths for relation fields:

```txt
name
budget
campaign.name
```

This keeps UI builders simple: a field picker can emit the selected public path directly into `select`, `where`, `groupBy`, or `orderBy`.

Dotted paths do not create arbitrary joins. During validation, every path segment must exist in the resolved registry and must have the required capability:

```txt
campaign.name
  -> placement has an exposed campaign relation
  -> campaign traversal is selectable/filterable for this query position
  -> campaign is within maxDepth
  -> campaign has an exposed name field
```

After validation, QueryKit derives a deduplicated join plan from those field paths. The join plan is visible in `QueryIR.joins` and is what the SQL compiler uses.

So relation traversal is implicit in the public query for UI ergonomics, but explicit in the compiled plan for inspection and execution.

### Registry Schema

The registry defines the allowed query universe.

QueryKit uses three registry layers:

```txt
PhysicalRegistry
  generated from ORM/schema metadata

RegistryPolicy
  user-authored allowlist and customization layer

ResolvedRegistry
  per-request effective registry used by validation and compilation
```

The physical registry says what exists.

The registry policy says what is exposed.

The resolved registry is generated from both, plus engine defaults and request context.

```ts
const resolved = resolveRegistry({
  physical,
  defaults,
  policies,
  context,
});
```

Resolution should be cheap and deterministic. It can happen on every query call so field visibility, limits, relation depth, and capabilities can vary by tenant, role, feature flag, or UI-managed configuration.

## Registry Shape

The physical registry is adapter-generated and close to the ORM/database model:

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
};
```

The policy is user-authored data. It can come from code, a database, generated configuration, or a future UI.

```ts
const policy = {
  sources: {
    placements: {
      expose: true,
      exposeAs: "placement",
      fields: {
        name: {
          expose: true,
          filterable: true,
          sortable: true,
        },
        budgetCents: {
          expose: true,
          exposeAs: "budget",
          type: "number",
          filterable: true,
          sortable: true,
          aggregations: ["sum", "avg"],
        },
      },
    },
  },
};
```

The resolved registry is what QueryKit actually compiles against. Queries only reference public names from the resolved registry.

```txt
placement.budget -> placements.budgetCents
placement.campaign.name -> join placements.campaignId = campaigns.id, then campaigns.name
```

Resolved relations preserve the physical join keys needed by later IR lowering:

```ts
type ResolvedRelation = {
  physicalSource: string;
  physicalRelation: string;
  target: string;
  kind: "one" | "many";
  localFields: string[];
  foreignFields: string[];
};
```

## Adapters

Adapters have two jobs:

```txt
ORM/schema -> PhysicalRegistry
SQLPlan -> adapter execution
```

For Drizzle:

```txt
Drizzle schema -> PhysicalRegistry
SQLPlan -> db.execute(...)
```

The initial Drizzle execution adapter lives in `@ypanagidis/querykit-drizzle`, not core QueryKit. Core stays ORM-agnostic and produces `SQLPlan`; adapter packages execute or translate that plan.

For Prisma:

```txt
Prisma schema -> PhysicalRegistry
QueryIR -> Prisma raw SQL initially
```

Prisma object-query compilation can be added later for the subset Prisma can represent cleanly. The core should not be shaped around Prisma's `findMany` API.

## Current Alpha

The current alpha exposes the public Zod schema layer for `QuerySpec`, `PhysicalRegistry`, `RegistryPolicy`, `RegistryDefaults`, and `ResolvedRegistry`.

The next implementation should build the runtime pipeline around these contracts:

```txt
QuerySpecSchema.parse
  -> resolveRegistry
  -> validateQuerySpec
  -> lowerQuerySpecToIR
  -> adapter.compile
  -> adapter.execute
```

Drivers remain useful as an optional layer for business-specific specs:

```txt
business JSON
  -> driver
  -> QuerySpec
  -> QueryKit core
```

## Design Constraints

QueryKit should not become:

```txt
- a BI platform
- a no-code backend
- an ORM
- a GraphQL server
- a public SQL-in-JSON language
- an authorization framework
```

The registry controls query shape and field exposure. Per-user row-level authorization and mandatory tenant constraints should be supplied by the host application.
