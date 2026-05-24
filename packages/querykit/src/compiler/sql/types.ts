import type { JsonValue } from "../../specs/query.js";

export type SQLDialect = "mysql" | "postgres";

export type SQLPlan = {
  readonly dialect: SQLDialect;
  readonly sql: string;
  readonly params: readonly JsonValue[];
};

export type SQLDialectCompiler = {
  readonly dialect: SQLDialect;
  readonly quoteIdentifier: (identifier: string) => string;
  readonly placeholder: (index: number) => string;
  readonly likeEscapeSql: string;
};
