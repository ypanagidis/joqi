# QueryKit Drizzle

Drizzle adapter for QueryKit physical registries and SQL plans.

This package intentionally keeps a small adapter surface:

```txt
Drizzle schema + rc3 relations -> PhysicalRegistry
SQLPlan -> Drizzle SQL object -> db.execute(...)
```

It does not compile QueryKit queries into Drizzle query-builder calls. Core QueryKit already compiles `QuerySpec + ResolvedRegistry` into a MySQL `SQLPlan`; this package creates the trusted physical registry from Drizzle metadata and executes SQL plans through a Drizzle-compatible database object.

## Install

```bash
pnpm add @ypanagidis/querykit @ypanagidis/querykit-drizzle drizzle-orm@1.0.0-rc.3
```

## Usage

```ts
import { compileQuerySpecToSQL } from "@ypanagidis/querykit";
import {
  createPhysicalRegistryFromDrizzle,
  executeSQLPlanWithDrizzle,
} from "@ypanagidis/querykit-drizzle";

const physical = createPhysicalRegistryFromDrizzle({
  schema,
  relations: (r) => ({
    placements: {
      campaign: r.one.campaigns({
        from: r.placements.campaignId,
        to: r.campaigns.id,
      }),
    },
  }),
});

const sqlPlan = compileQuerySpecToSQL({
  query,
  registry,
});

const rows = await executeSQLPlanWithDrizzle({
  db,
  plan: sqlPlan,
});
```

The adapter converts MySQL `?` placeholders and PostgreSQL `$1`, `$2`, ... placeholders in the QueryKit `SQLPlan` into Drizzle params using `sql.param(...)`, then calls `db.execute(...)`.

## API

```ts
type DrizzleExecutor<TResult = unknown> = {
  execute: (query: SQL) => TResult | Promise<TResult>;
};

type ExecuteSQLPlanWithDrizzleInput<TResult = unknown> = {
  db: DrizzleExecutor<TResult>;
  plan: SQLPlan;
};
```

```ts
sqlPlanToDrizzleSQL(plan);
executeSQLPlanWithDrizzle({ db, plan });
createPhysicalRegistryFromDrizzle({ schema, relations });
createPhysicalRegistryFromDrizzleRelations(relations);
```

## Current Scope

Implemented:

- Convert `SQLPlan` to Drizzle `SQL`
- Preserve bound params
- Execute through `db.execute(...)`
- Wrap execution failures in `DrizzleExecutionError`
- Create a QueryKit `PhysicalRegistry` from Drizzle rc3 `defineRelations(...)` metadata

Not implemented yet:

- Drizzle query-builder compilation
- Drizzle-specific row normalization
