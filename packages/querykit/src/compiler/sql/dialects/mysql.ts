import type { SQLDialectCompiler } from "../types.js";

export const mysqlDialectCompiler: SQLDialectCompiler = {
  dialect: "mysql",
  quoteIdentifier: (identifier) => `\`${identifier.replaceAll("`", "``")}\``,
  placeholder: () => "?",
  likeEscapeSql: " escape '\\\\'",
};
