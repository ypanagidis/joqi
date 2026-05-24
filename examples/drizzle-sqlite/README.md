# QueryKit Drizzle SQLite Example

Runs QueryKit through the Drizzle adapter against SQLite using Node's built-in `node:sqlite` driver.

```bash
pnpm --filter @ypanagidis/querykit build
pnpm --filter @ypanagidis/querykit-drizzle build
pnpm --filter @querykit/example-drizzle-sqlite seed
pnpm --filter @querykit/example-drizzle-sqlite start
```

The example reads a public query template with `$param` references from `input.json`, passes params through `runtime.run(...)`, and compiles with `dialect: "sqlite"`, so SQLPlan params use `?` placeholders and identifiers use double quotes.

Set `DATABASE_PATH` to override the default database path:

```txt
querykit-sqlite.db
```
