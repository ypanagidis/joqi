# QueryKit Drizzle PostgreSQL Example

Runs QueryKit through the Drizzle adapter against PostgreSQL.

```bash
pnpm --filter @ypanagidis/querykit build
pnpm --filter @ypanagidis/querykit-drizzle build
pnpm --filter @querykit/example-drizzle-postgres db:up
pnpm --filter @querykit/example-drizzle-postgres db:push
pnpm --filter @querykit/example-drizzle-postgres seed
pnpm --filter @querykit/example-drizzle-postgres start
```

The example reads a public query template with `$param` references from `input.json`, passes params through `runtime.run(...)`, and compiles with `dialect: "postgres"`, so SQLPlan params use `$1`, `$2`, ... placeholders.

Default connection string:

```txt
postgres://querykit:querykit@127.0.0.1:5432/querykit_postgres
```
