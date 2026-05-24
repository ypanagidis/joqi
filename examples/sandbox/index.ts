import { readFile } from "node:fs/promises";

import {
  compileQuerySpecToSQL,
  lowerQuerySpecToIR,
  parseQueryIRResultRows,
  resolveRegistry,
  validateQuerySpec,
} from "@ypanagidis/querykit";
import { executeSQLPlanWithDrizzle } from "@ypanagidis/querykit-drizzle";
import { drizzle } from "drizzle-orm/mysql2";

const input = JSON.parse(await readFile(new URL("./input.json", import.meta.url), "utf8"));

const resolved = resolveRegistry({
  physical: input.physical,
  defaults: input.defaults,
  policies: input.policies,
});

const validatedQuery = validateQuerySpec({
  query: input.query,
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

const databaseUrl =
  process.env.DATABASE_URL ?? "mysql://querykit:querykit@127.0.0.1:3307/querykit_sandbox";
const db = drizzle(databaseUrl);
const result = await executeSQLPlanWithDrizzle({ db, plan: sqlPlan });
const rows = Array.isArray(result) ? result[0] : result;
const validatedRows = parseQueryIRResultRows(ir, rows);
await db.$client.end();

console.log(
  JSON.stringify(
    {
      // resolved,
      // validatedQuery,
      joins: ir.joins,
      sqlPlan,
      rows: validatedRows,
      // ir,
    },
    null,
    2,
  ),
);
