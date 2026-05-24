import type { SQLDialectCompiler } from "../types.js";

export const sqliteDialectCompiler: SQLDialectCompiler = {
  dialect: "sqlite",
  quoteIdentifier: (identifier) => `"${identifier.replaceAll('"', '""')}"`,
  placeholder: () => "?",
  likeEscapeSql: " escape '\\'",
};
