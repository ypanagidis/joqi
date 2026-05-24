import { readFile } from "node:fs/promises";

import { createQueryRuntime } from "@ypanagidis/querykit";
import { drizzleExecutor } from "@ypanagidis/querykit-drizzle";

import { db } from "./db/index.ts";
import { defaults, physical, policy } from "./registry.ts";

const input = JSON.parse(await readFile(new URL("../input.json", import.meta.url), "utf8"));
const runtime = createQueryRuntime({
  db,
  physicalRegistry: physical,
  defaults,
  policy,
  dialect: "sqlite",
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
const explain = result.explain!;
db.$client.close();

console.log(
  JSON.stringify({ joins: explain.ir.joins, sqlPlan: explain.sqlPlan, rows: result.rows }, null, 2),
);
