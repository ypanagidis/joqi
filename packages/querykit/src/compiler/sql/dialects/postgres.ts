import type { SQLDialectCompiler } from "../types.js";

export const postgresDialectCompiler: SQLDialectCompiler = {
  dialect: "postgres",
  quoteIdentifier: (identifier) => `"${identifier.replaceAll('"', '""')}"`,
  placeholder: (index) => `$${index}`,
  likeEscapeSql: " escape '\\'",
};
