import { readFile } from "node:fs/promises";

import { createQueryRuntime } from "@ypanagidis/querykit";
import { drizzleExecutor } from "@ypanagidis/querykit-drizzle";

import { defaults, physical, policy } from "./registry.ts";
import { db } from "./db/index.ts";

const input = JSON.parse(await readFile(new URL("../input.json", import.meta.url), "utf8"));

const runtime = createQueryRuntime({
  db,
  physicalRegistry: physical,
  defaults,
  policy,
  dialect: "mysql",
  executor: drizzleExecutor(),
});

const result = await runtime.run({
  spec: input.query,
  params: {
    status: "active",
    minBudget: 10000,
    campaignName: "spring",
    limit: 25,
  },
  explain: true,
});
const { explain } = result;
await db.$client.end();

console.log(
  JSON.stringify(
    {
      joins: explain.ir.joins,
      sqlPlan: explain.sqlPlan,
      rows: result.rows,
    },
    null,
    2,
  ),
);
