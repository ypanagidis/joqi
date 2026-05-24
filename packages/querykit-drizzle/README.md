# QueryKit Drizzle

Drizzle execution adapter for QueryKit SQL plans.

This package intentionally starts with the smallest useful adapter surface:

```txt
SQLPlan -> Drizzle SQL object -> db.execute(...)
```

It does not introspect Drizzle schemas yet, and it does not compile QueryKit queries into Drizzle query-builder calls. Core QueryKit already compiles `QuerySpec + ResolvedRegistry` into a MySQL `SQLPlan`; this package executes that plan through a Drizzle-compatible database object.

## Install

```bash
pnpm add @ypanagidis/querykit @ypanagidis/querykit-drizzle drizzle-orm@1.0.0-rc.3
```

## Usage

```ts
import { compileQuerySpecToSQL } from "@ypanagidis/querykit";
import { executeSQLPlanWithDrizzle } from "@ypanagidis/querykit-drizzle";

const sqlPlan = compileQuerySpecToSQL({
  query,
  registry,
});

const rows = await executeSQLPlanWithDrizzle({
  db,
  plan: sqlPlan,
});
```

The adapter converts `?` placeholders in the QueryKit `SQLPlan` into Drizzle params using `sql.param(...)`, then calls `db.execute(...)`.

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
```

## Current Scope

Implemented:

- Convert `SQLPlan` to Drizzle `SQL`
- Preserve bound params
- Execute through `db.execute(...)`
- Wrap execution failures in `DrizzleExecutionError`

Not implemented yet:

- Drizzle schema introspection into `PhysicalRegistry`
- Drizzle query-builder compilation
- Drizzle-specific row normalization
