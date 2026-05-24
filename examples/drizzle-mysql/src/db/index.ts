import * as schema from "./schema.ts";

import { drizzle } from "drizzle-orm/mysql2";

const databaseUrl =
  process.env.DATABASE_URL ?? "mysql://querykit:querykit@127.0.0.1:3307/querykit_mysql";

export const db = drizzle(databaseUrl, { relations: schema.relations });
