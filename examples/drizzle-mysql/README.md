# QueryKit Drizzle MySQL Example

Runs Drizzle schema-to-registry creation, the registry resolver, query validator,
IR lowerer, MySQL SQL compiler, Drizzle execution adapter, and result validation
against `input.json`.

This is the MySQL Drizzle example. PostgreSQL and SQLite variants live in
`examples/drizzle-postgres` and `examples/drizzle-sqlite`.

`input.json` contains only the public query template with `$param` references.
Runtime params, the physical registry, and policy live in TypeScript under `src/`.

The sample query selects and filters `campaign.name`, so the output includes a
top-level `joins` field plus `sqlPlan.sql` and `sqlPlan.params`.

`campaign.name` is a public field path. QueryKit validates that `campaign` is an
exposed relation in the resolved registry, then derives the join plan shown in
the output.

```bash
pnpm --filter @ypanagidis/querykit build
pnpm --filter @ypanagidis/querykit-drizzle build
pnpm --filter @querykit/example-drizzle-mysql db:up
pnpm --filter @querykit/example-drizzle-mysql db:push
pnpm --filter @querykit/example-drizzle-mysql seed
pnpm --filter @querykit/example-drizzle-mysql start
```

The example uses MySQL from `docker-compose.yml`. Set `DATABASE_URL` to override
the default connection string:

```txt
mysql://querykit:querykit@127.0.0.1:3307/querykit_mysql
```
