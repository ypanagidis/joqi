import { sql, type SQL } from "drizzle-orm/sql";
import {
  defineRelations,
  type AnyRelationsBuilderConfig,
  type ExtractTablesFromSchema,
  type RelationsBuilder,
  type TablesRelationalConfig,
} from "drizzle-orm/relations";

import {
  parsePhysicalRegistry,
  type FieldType,
  type PhysicalRegistry,
  type QueryRuntimeExecutor,
  type SQLPlan,
} from "@ypanagidis/querykit";

type DrizzleColumn = {
  readonly name: string;
  readonly notNull: boolean;
  readonly primary: boolean;
  readonly dataType: string;
  readonly columnType: string;
  readonly enumValues?: readonly string[] | undefined;
};

type DrizzleTable = object;

type DrizzleRelation = {
  readonly relationType: "one" | "many";
  readonly targetTableName: string;
  readonly sourceColumns: readonly DrizzleColumn[];
  readonly targetColumns: readonly DrizzleColumn[];
  readonly optional?: boolean | undefined;
};

export type CreatePhysicalRegistryFromDrizzleInput<TSchema extends Record<string, unknown>> = {
  readonly schema: TSchema;
  readonly relations?: (
    helpers: RelationsBuilder<ExtractTablesFromSchema<TSchema>>,
  ) => AnyRelationsBuilderConfig;
};

export type DrizzleExecutor<TResult = unknown> = {
  readonly execute?: ((query: SQL) => TResult | Promise<TResult>) | undefined;
  readonly all?: ((query: SQL) => TResult | Promise<TResult>) | undefined;
};

export type ExecuteSQLPlanWithDrizzleInput<TResult = unknown> = {
  readonly db: DrizzleExecutor<TResult>;
  readonly plan: SQLPlan;
};

export const drizzleExecutor =
  <TDb extends DrizzleExecutor>(): QueryRuntimeExecutor<TDb> =>
  async ({ db, plan }) =>
    rowsFromDrizzleResult(await executeSQLPlanWithDrizzle({ db, plan }));

export class DrizzleExecutionError extends Error {
  override readonly cause: unknown;
  readonly sql: string;

  constructor(input: { readonly sql: string; readonly cause: unknown }) {
    super("Drizzle SQLPlan execution failed", { cause: input.cause });
    this.name = "DrizzleExecutionError";
    this.cause = input.cause;
    this.sql = input.sql;
  }
}

const tableNameSymbol = Symbol.for("drizzle:Name");
const tableSchemaSymbol = Symbol.for("drizzle:Schema");
const tableColumnsSymbol = Symbol.for("drizzle:Columns");
const tableBaseNameSymbol = Symbol.for("drizzle:BaseName");

export const createPhysicalRegistryFromDrizzle = <TSchema extends Record<string, unknown>>(
  input: CreatePhysicalRegistryFromDrizzleInput<TSchema>,
): PhysicalRegistry =>
  createPhysicalRegistryFromDrizzleRelations(
    input.relations === undefined
      ? (defineRelations(input.schema) as TablesRelationalConfig)
      : (defineRelations(input.schema, input.relations) as TablesRelationalConfig),
  );

export const createPhysicalRegistryFromDrizzleRelations = (
  relations: TablesRelationalConfig,
): PhysicalRegistry => {
  const sourceNamesByRelationName = new Map(
    Object.entries(relations).map(([relationName, tableConfig]) => [
      relationName,
      tableName(tableConfig.table as DrizzleTable),
    ]),
  );

  const sources = Object.fromEntries(
    Object.values(relations).map((tableConfig) => {
      const table = tableConfig.table as DrizzleTable;
      const columns = tableColumns(table);
      const fields = Object.fromEntries(
        columns.map((column) => [
          column.name,
          {
            type: mapDrizzleColumnType(column),
            nullable: !column.notNull,
            ...(column.enumValues === undefined ? {} : { enumValues: [...column.enumValues] }),
            adapterMeta: {
              drizzle: {
                columnType: column.columnType,
                dataType: column.dataType,
              },
            },
          },
        ]),
      );
      const primaryKey = unique(
        columns.filter((column) => column.primary).map((column) => column.name),
      );
      const tableRelations = Object.fromEntries(
        Object.entries(tableConfig.relations).map(([relationName, relation]) => [
          relationName,
          toPhysicalRelation(relation as DrizzleRelation, sourceNamesByRelationName),
        ]),
      );

      return [
        tableName(table),
        {
          kind: "table",
          name: tableName(table),
          ...(tableSchema(table) === undefined ? {} : { schema: tableSchema(table) }),
          ...(primaryKey.length === 0 ? {} : { primaryKey }),
          fields,
          ...(Object.keys(tableRelations).length === 0 ? {} : { relations: tableRelations }),
          adapterMeta: {
            drizzle: {
              relationName: tableConfig.name,
              baseName: tableBaseName(table),
            },
          },
        },
      ];
    }),
  );

  return parsePhysicalRegistry({
    version: "v1",
    sources,
  });
};

export const sqlPlanToDrizzleSQL = (plan: SQLPlan): SQL => {
  if (plan.dialect === "postgres") {
    return postgresSQLPlanToDrizzleSQL(plan);
  }

  const textParts = plan.sql.split("?");

  if (textParts.length - 1 !== plan.params.length) {
    throw new Error("SQLPlan placeholder count does not match params count");
  }

  return sql.join(
    textParts.flatMap((textPart, index) => {
      if (index === plan.params.length) {
        return [sql.raw(textPart)];
      }

      return [sql.raw(textPart), sql.param(plan.params[index])];
    }),
  );
};

const postgresSQLPlanToDrizzleSQL = (plan: SQLPlan): SQL => {
  const chunks: Parameters<typeof sql.join>[0] = [];
  const placeholders = plan.sql.matchAll(/\$(\d+)/g);
  let lastIndex = 0;
  let expectedParamIndex = 1;

  for (const placeholder of placeholders) {
    const placeholderIndex = Number(placeholder[1]);

    if (placeholderIndex !== expectedParamIndex) {
      throw new Error("SQLPlan placeholder count does not match params count");
    }

    const param = plan.params[expectedParamIndex - 1];

    if (param === undefined) {
      throw new Error("SQLPlan placeholder count does not match params count");
    }

    chunks.push(sql.raw(plan.sql.slice(lastIndex, placeholder.index)));
    chunks.push(sql.param(param));
    lastIndex = placeholder.index + placeholder[0].length;
    expectedParamIndex += 1;
  }

  if (expectedParamIndex - 1 !== plan.params.length) {
    throw new Error("SQLPlan placeholder count does not match params count");
  }

  chunks.push(sql.raw(plan.sql.slice(lastIndex)));

  return sql.join(chunks);
};

const toPhysicalRelation = (
  relation: DrizzleRelation,
  sourceNamesByRelationName: ReadonlyMap<string, string>,
) => ({
  kind: relation.relationType,
  target: sourceNamesByRelationName.get(relation.targetTableName) ?? relation.targetTableName,
  localFields: relation.sourceColumns.map((column) => column.name),
  foreignFields: relation.targetColumns.map((column) => column.name),
  ...(relation.relationType === "one" ? { nullable: relation.optional ?? false } : {}),
});

const mapDrizzleColumnType = (column: DrizzleColumn): FieldType => {
  if (column.enumValues !== undefined) {
    return "enum";
  }

  if (column.dataType === "boolean") {
    return "boolean";
  }

  if (column.dataType.startsWith("number")) {
    return "number";
  }

  if (column.dataType === "json") {
    return "json";
  }

  if (column.columnType === "MySqlDate") {
    return "date";
  }

  if (column.columnType === "MySqlDateTime" || column.columnType === "MySqlTimestamp") {
    return "datetime";
  }

  if (column.dataType.startsWith("string")) {
    return "string";
  }

  return "unknown";
};

const tableName = (table: DrizzleTable): string => tableValue(table, tableNameSymbol);

const tableSchema = (table: DrizzleTable): string | undefined =>
  tableValue(table, tableSchemaSymbol);

const tableBaseName = (table: DrizzleTable): string => tableValue(table, tableBaseNameSymbol);

const tableColumns = (table: DrizzleTable): DrizzleColumn[] =>
  Object.values(tableValue<Record<string, DrizzleColumn>>(table, tableColumnsSymbol));

const tableValue = <Value>(table: DrizzleTable, symbol: symbol): Value =>
  (table as { readonly [key: symbol]: Value })[symbol]!;

const unique = <Value>(values: readonly Value[]): Value[] => [...new Set(values)];

export const executeSQLPlanWithDrizzle = async <TResult = unknown>(
  input: ExecuteSQLPlanWithDrizzleInput<TResult>,
): Promise<Awaited<TResult>> => {
  try {
    const query = sqlPlanToDrizzleSQL(input.plan);

    if (input.db.execute !== undefined) {
      return await input.db.execute(query);
    }

    if (input.db.all !== undefined) {
      return await input.db.all(query);
    }

    throw new Error("Drizzle executor must provide execute(...) or all(...)");
  } catch (cause) {
    throw new DrizzleExecutionError({ sql: input.plan.sql, cause });
  }
};

const rowsFromDrizzleResult = (result: unknown): unknown => {
  if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0])) {
    return result[0];
  }

  if (result !== null && typeof result === "object" && "rows" in result) {
    return result.rows;
  }

  return result;
};
