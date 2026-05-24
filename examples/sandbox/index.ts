import { readFile } from "node:fs/promises";

import {
  compileQuerySpecToSQL,
  lowerQuerySpecToIR,
  resolveRegistry,
  validateQuerySpec,
} from "@ypanagidis/querykit";

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

console.log(
  JSON.stringify(
    {
      // resolved,
      // validatedQuery,
      // joins: ir.joins,
      sqlPlan,
      // ir,
    },
    null,
    2,
  ),
);
