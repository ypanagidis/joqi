# QueryKit Sandbox

Runs the registry resolver, query validator, IR lowerer, MySQL SQL compiler, and
Drizzle execution adapter against `input.json`.

The sample query selects and filters `campaign.name`, so the output includes a
top-level `joins` field plus `sqlPlan.sql` and `sqlPlan.params`.

`campaign.name` is a public field path. QueryKit validates that `campaign` is an
exposed relation in the resolved registry, then derives the join plan shown in
the output.

```bash
pnpm --filter @ypanagidis/querykit build
pnpm --filter @ypanagidis/querykit-drizzle build
pnpm --filter @querykit/example-sandbox db:up
pnpm --filter @querykit/example-sandbox db:push
pnpm --filter @querykit/example-sandbox seed
pnpm --filter @querykit/example-sandbox start
```

The sandbox uses MySQL from `docker-compose.yml`. Set `DATABASE_URL` to override
the default connection string:

```txt
mysql://querykit:querykit@127.0.0.1:3307/querykit_sandbox
```
