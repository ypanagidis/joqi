# QueryKit Sandbox

Runs the registry resolver, query validator, IR lowerer, and MySQL SQL compiler
against `input.json`.

The sample query selects and filters `campaign.name`, so the output includes a
top-level `joins` field plus `sqlPlan.sql` and `sqlPlan.params`.

`campaign.name` is a public field path. QueryKit validates that `campaign` is an
exposed relation in the resolved registry, then derives the join plan shown in
the output.

```bash
pnpm --filter @ypanagidis/querykit build
pnpm --filter @querykit/example-sandbox start
```
