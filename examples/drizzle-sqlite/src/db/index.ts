import * as schema from "./schema.ts";

import { drizzle } from "drizzle-orm/node-sqlite";

export const databasePath = process.env.DATABASE_PATH ?? "querykit-sqlite.db";

export const db = drizzle(databasePath, { relations: schema.relations });
