# QueryKit

QueryKit is a registry-backed JSON query compiler for TypeScript apps.

It lets an application accept a small public JSON query shape, validate it against a trusted per-request registry, and compile it into a safe executable query plan.

```txt
Public JSON query
  + ResolvedRegistry
  -> validated query
  -> QueryIR
  -> SQLPlan
  -> adapter execution
```

The important idea is that users and UIs query **public names**, while QueryKit compiles those names to trusted physical tables, columns, joins, and parameters from the registry.

```txt
public:  placement.budget
private: placements.budgetCents

public:  placement.campaign.name
private: left join campaigns on placements.campaignId = campaigns.id, then campaigns.name
```

## Status

QueryKit is early alpha software.

Current package:

```txt
@ypanagidis/querykit@0.0.2-alpha.0
```

## Contents

- [Why QueryKit Exists](#why-querykit-exists)
- [The Mental Model](#the-mental-model)
- [Quick Example](#quick-example)
- [Basic Usage](#basic-usage)
- [Effect API](#effect-api)
- [Field Paths And Derived Joins](#field-paths-and-derived-joins)
- [Where Join Columns Come From](#where-join-columns-come-from)
- [QuerySpec](#queryspec)
- [Registry Layers](#registry-layers)
- [SQLPlan](#sqlplan)
- [Running The Sandbox](#running-the-sandbox)
- [Development](#development)
- [Roadmap](#roadmap)

## Installation

The package is currently published under the private `@ypanagidis` scope.

```bash
pnpm add @ypanagidis/querykit@alpha
```

For local development, clone this repo and install from the workspace:

```bash
pnpm install
pnpm build
```

Currently implemented:

- Zod schemas for public queries and registries
- Registry policy resolution
- Effect-first resolver, validator, IR lowerer, and SQL compiler APIs
- Sync and promise facades
- Registry-aware query validation
- Derived join planning from public dotted field paths
- Adapter-neutral `QueryIR`
- MySQL `SQLPlan` compilation with bound params
- Runnable sandbox example

Not implemented yet:

- Database execution adapters
- Drizzle adapter package
- Prisma adapter package
- PostgreSQL and SQLite SQL dialects
- Aggregation execution semantics
- Forensic/explain output

## Why QueryKit Exists

Many products eventually need some version of dynamic querying:

- Admin tables
- Saved reports
- Dashboard widgets
- Exports
- Client-facing data grids
- API-driven filtering and sorting
- Document mappings

The hard part is not just building SQL. The hard part is safely deciding what a caller is allowed to ask for.

QueryKit centralizes the technical query contract:

- What sources exist?
- Which sources are exposed publicly?
- What public name should each field use?
- Which fields can be selected, filtered, sorted, or grouped?
- Which operators are allowed per field?
- Which relations can be traversed?
- What joins are needed for relation fields?
- What maximum limits apply for this request?

QueryKit is **not** an authorization framework. The host application owns business policy and row-level constraints. QueryKit provides the safe query surface and compiler machinery underneath it.

## The Mental Model

QueryKit has four core shapes.

```txt
PhysicalRegistry
  What physically exists in the database or ORM model.

RegistryPolicy
  What the application chooses to expose and how it should appear publicly.

ResolvedRegistry
  The final per-request public query surface.

QuerySpec
  The user's public JSON query against that resolved surface.
```

Then QueryKit compiles the query:

```txt
QuerySpec + ResolvedRegistry
  -> validateQuerySpec
  -> lowerQuerySpecToIR
  -> compileQuerySpecToSQL
```

## Quick Example

Imagine these physical tables:

```txt
placements
  id
  name
  status
  budgetCents
  campaignId

campaigns
  id
  name
```

The physical registry records the technical facts:

```json
{
  "version": "v1",
  "sources": {
    "placements": {
      "kind": "table",
      "name": "placements",
      "fields": {
        "id": { "type": "string", "nullable": false },
        "name": { "type": "string", "nullable": false },
        "status": { "type": "enum", "nullable": false },
        "budgetCents": { "type": "number", "nullable": false },
        "campaignId": { "type": "string", "nullable": false }
      },
      "relations": {
        "campaign": {
          "kind": "one",
          "target": "campaigns",
          "localFields": ["campaignId"],
          "foreignFields": ["id"]
        }
      }
    },
    "campaigns": {
      "kind": "table",
      "name": "campaigns",
      "fields": {
        "id": { "type": "string", "nullable": false },
        "name": { "type": "string", "nullable": false }
      }
    }
  }
}
```

The policy decides what is public:

```json
{
  "version": "v1",
  "sources": {
    "placements": {
      "expose": true,
      "exposeAs": "placement",
      "fields": {
        "name": { "expose": true, "filterable": true, "sortable": true },
        "status": { "expose": true, "filterable": true, "sortable": true },
        "budgetCents": {
          "expose": true,
          "exposeAs": "budget",
          "filterable": true,
          "sortable": true,
          "operators": ["eq", "gt", "gte", "lt", "lte"]
        }
      },
      "relations": {
        "campaign": {
          "expose": true,
          "target": "campaign",
          "selectable": true,
          "filterable": true,
          "maxDepth": 1
        }
      }
    },
    "campaigns": {
      "expose": true,
      "exposeAs": "campaign",
      "fields": {
        "name": { "expose": true, "filterable": true, "sortable": true }
      }
    }
  }
}
```

Now a UI can send a public query:

```json
{
  "version": "v1",
  "source": "placement",
  "select": ["name", "status", "budget", "campaign.name"],
  "where": {
    "and": [
      { "field": "status", "op": "eq", "value": "active" },
      { "field": "budget", "op": "gte", "value": 10000 },
      { "field": "campaign.name", "op": "contains", "value": "spring" }
    ]
  },
  "orderBy": [{ "field": "budget", "direction": "desc" }],
  "limit": 25
}
```

No raw table names, raw column names, SQL snippets, or arbitrary joins appear in the query.

## Basic Usage

```ts
import {
  compileQuerySpecToSQL,
  lowerQuerySpecToIR,
  resolveRegistry,
  validateQuerySpec,
} from "@ypanagidis/querykit";

const registry = resolveRegistry({
  physical,
  defaults,
  policies: [basePolicy, rolePolicy],
});

const validatedQuery = validateQuerySpec({
  query,
  registry,
});

const ir = lowerQuerySpecToIR({
  query: validatedQuery,
  registry,
});

const sqlPlan = compileQuerySpecToSQL({
  query: validatedQuery,
  registry,
});
```

Example `SQLPlan` output for MySQL:

```ts
{
  dialect: "mysql",
  sql: "select `t0`.`name` as `name`, `t0`.`status` as `status`, `t0`.`budgetCents` as `budget`, `t1`.`name` as `campaign.name`\nfrom `placements` as `t0`\nleft join `campaigns` as `t1` on `t0`.`campaignId` = `t1`.`id`\nwhere (`t0`.`status` = ?) and (`t0`.`budgetCents` >= ?) and (`t1`.`name` like ? escape '\\')\norder by `t0`.`budgetCents` desc\nlimit ?",
  params: ["active", 10000, "%spring%", 25]
}
```

The SQL string uses trusted identifiers from the resolved registry. User values are emitted as bound params.

## Effect API

The core pipeline is Effect-first. Sync and promise helpers are convenience facades.

```ts
import { Effect } from "effect";
import {
  compileQuerySpecToSQLEffect,
  lowerQuerySpecToIREffect,
  resolveRegistryEffect,
  validateQuerySpecEffect,
} from "@ypanagidis/querykit/effect";

const program = Effect.gen(function* () {
  const registry = yield* resolveRegistryEffect({
    physical,
    defaults,
    policies,
  });

  const validatedQuery = yield* validateQuerySpecEffect({
    query,
    registry,
  });

  const ir = yield* lowerQuerySpecToIREffect({
    query: validatedQuery,
    registry,
  });

  const sqlPlan = yield* compileQuerySpecToSQLEffect({
    query: validatedQuery,
    registry,
  });

  return { registry, validatedQuery, ir, sqlPlan };
});

const result = await Effect.runPromise(program);
```

Failures use Effect-native tagged errors:

```ts
program.pipe(
  Effect.catchTags({
    RegistryParseError: (error) => Effect.succeed(error.error),
    RegistryResolutionError: (error) => Effect.succeed(error.issues),
    QueryParseError: (error) => Effect.succeed(error.error),
    QueryValidationError: (error) => Effect.succeed(error.issues),
  }),
);
```

## Field Paths And Derived Joins

QueryKit intentionally supports dotted public field paths:

```txt
name
budget
campaign.name
```

This is primarily for UI ergonomics. A registry-driven field picker can expose `campaign.name` as one selectable public field path, and the query can use that same path in `select`, `where`, `groupBy`, or `orderBy`.

Those dotted paths do **not** create arbitrary joins.

For `campaign.name` to validate, all of this must be true:

- The root source `placement` exists in the resolved registry.
- `placement` exposes a relation named `campaign`.
- The `campaign` relation allows the requested capability, such as `selectable` or `filterable`.
- The traversal stays within `maxDepth`.
- The target source `campaign` exists in the resolved registry.
- The target field `name` exists and has the requested capability.
- The operator is allowed for that target field when used in a filter.

After validation, QueryKit derives an explicit join plan:

```ts
{
  path: "campaign",
  relation: {
    publicName: "campaign",
    physicalRelation: "campaign"
  },
  kind: "one",
  from: {
    publicName: "placement",
    physicalSource: "placements"
  },
  to: {
    publicName: "campaign",
    physicalSource: "campaigns"
  },
  localFields: ["campaignId"],
  foreignFields: ["id"]
}
```

So relation traversal is implicit in the public query for UI simplicity, but explicit in the compiled plan for inspection and execution.

## Where Join Columns Come From

Join columns come from the physical registry, not from the user query.

```json
{
  "relations": {
    "campaign": {
      "kind": "one",
      "target": "campaigns",
      "localFields": ["campaignId"],
      "foreignFields": ["id"]
    }
  }
}
```

That means:

```txt
placements.campaignId = campaigns.id
```

The policy may expose that relation publicly as `campaign`, but it does not let the query author define arbitrary join conditions.

## QuerySpec

The public query shape currently supports `select`, `where`, `groupBy`, `orderBy`, `limit`, and `offset`.

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

Filters support nested boolean expressions:

```json
{
  "and": [
    { "field": "status", "op": "eq", "value": "active" },
    {
      "or": [
        { "field": "budget", "op": "gte", "value": 10000 },
        { "field": "campaign.name", "op": "contains", "value": "spring" }
      ]
    }
  ]
}
```

Supported operators:

```txt
eq
neq
gt
gte
lt
lte
in
contains
startsWith
endsWith
isNull
isNotNull
```

The registry decides which operators are allowed for each field.

## Registry Layers

### PhysicalRegistry

The physical registry is generated by an adapter or written by the host app. It describes technical facts:

- physical sources
- physical fields
- field types
- nullability
- physical relations
- join keys

It does not decide what should be public.

### RegistryPolicy

The registry policy is app-authored data. It decides:

- which physical sources are exposed
- public source names
- public field names
- labels and descriptions
- select/filter/sort/group capabilities
- allowed operators
- exposed relations
- relation depth
- maximum limits

Policies can be layered. Later policies override earlier policy values, which lets the host app compose base, role, tenant, or feature-flag policies.

### ResolvedRegistry

The resolved registry is the final public surface used by validation and compilation.

It is safe to resolve per request:

```ts
const registry = resolveRegistry({
  physical,
  defaults,
  policies: [basePolicy, tenantPolicy, rolePolicy],
  context,
});
```

This allows different users, tenants, roles, or feature flags to see different query surfaces.

## SQLPlan

The current SQL compiler targets MySQL.

```ts
type SQLPlan = {
  dialect: "mysql";
  sql: string;
  params: readonly JsonValue[];
};
```

Safety rules:

- Identifiers are quoted with MySQL backticks.
- Identifiers come from the resolved registry, not from user values.
- Values are emitted as `?` placeholders.
- `contains`, `startsWith`, and `endsWith` escape MySQL `LIKE` wildcards in user input.
- Relation joins use physical join keys from `ResolvedRelation`.

The `SQLPlan` is not executed by core QueryKit yet. A future adapter can execute it through raw SQL APIs, for example Drizzle, Prisma, Kysely, or a direct MySQL client.

## Running The Sandbox

The sandbox is the best way to see the current pipeline.

```bash
pnpm install
pnpm build
pnpm --filter @querykit/example-sandbox start
```

It reads `examples/sandbox/input.json`, then prints a MySQL SQL plan. The sample includes `campaign.name`, which causes QueryKit to validate the relation and derive a join plan.

Expected shape:

```json
{
  "sqlPlan": {
    "dialect": "mysql",
    "sql": "select ...",
    "params": ["active", 10000, "%spring%", 25]
  }
}
```

## Development

This repo uses `pnpm`.

```bash
pnpm install
pnpm format
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

Project layout:

```txt
packages/querykit
  Core package

examples/sandbox
  Runnable pipeline example

apps/docs
  Reserved for future docs app

apps/marketing
  Reserved for future marketing site
```

Tooling:

- `tsdown` for builds
- `vitest` for tests
- `tsgo` via `@typescript/native-preview` for type checking
- `oxlint` and `oxfmt` for linting and formatting
- `effect` for core runtime primitives and Effect-first APIs
- `zod` for public schema validation

## What QueryKit Is Not

QueryKit is not:

- a BI platform
- a no-code backend
- an ORM
- a GraphQL server
- a REST server
- a public SQL-in-JSON language
- an authorization framework
- a replacement for Drizzle or Prisma

The host application still owns business authorization, tenant constraints, row-level predicates, final response shape, and execution context.

## Roadmap

Near-term:

- Add a Prisma raw SQL execution adapter
- Decide how mandatory host constraints are represented
- Add PostgreSQL and SQLite SQL dialects
- Add better explain output for rejected queries and generated joins

Later:

- ORM/schema introspection into `PhysicalRegistry`
- Drizzle schema introspection into `PhysicalRegistry`
- Builder manifest output for UI field pickers
- Aggregation semantics
- Row normalization helpers
- More dialect-specific operators
- Optional Prisma object-query compilation for the subset Prisma can represent cleanly

## Current Design Principle

The core contract should stay small:

```txt
QuerySpec + ResolvedRegistry -> safe query plan
```

Everything else should serve that contract.

The public query describes intent using public names. The registry decides what those names mean. The compiler produces the technical plan needed to execute safely.
