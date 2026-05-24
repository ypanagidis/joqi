import { sql, type SQL } from "drizzle-orm/sql";
import { getTableConfig, type MySqlTable } from "drizzle-orm/mysql-core";
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
  readonly execute: (query: SQL) => TResult | Promise<TResult>;
};

export type ExecuteSQLPlanWithDrizzleInput<TResult = unknown> = {
  readonly db: DrizzleExecutor<TResult>;
  readonly plan: SQLPlan;
};

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
      getTableConfig(tableConfig.table as MySqlTable).name,
    ]),
  );

  const sources = Object.fromEntries(
    Object.values(relations).map((tableConfig) => {
      const table = tableConfig.table as MySqlTable;
      const tableMetadata = getTableConfig(table);
      const fields = Object.fromEntries(
        tableMetadata.columns.map((column) => [
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
      const primaryKey = unique([
        ...tableMetadata.columns.filter((column) => column.primary).map((column) => column.name),
        ...tableMetadata.primaryKeys.flatMap((primaryKey) =>
          primaryKey.columns.map((column) => column.name),
        ),
      ]);
      const tableRelations = Object.fromEntries(
        Object.entries(tableConfig.relations).map(([relationName, relation]) => [
          relationName,
          toPhysicalRelation(relation as DrizzleRelation, sourceNamesByRelationName),
        ]),
      );

      return [
        tableMetadata.name,
        {
          kind: "table",
          name: tableMetadata.name,
          ...(tableMetadata.schema === undefined ? {} : { schema: tableMetadata.schema }),
          ...(primaryKey.length === 0 ? {} : { primaryKey }),
          fields,
          ...(Object.keys(tableRelations).length === 0 ? {} : { relations: tableRelations }),
          adapterMeta: {
            drizzle: {
              relationName: tableConfig.name,
              baseName: tableMetadata.baseName,
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

const unique = <Value>(values: readonly Value[]): Value[] => [...new Set(values)];

export const executeSQLPlanWithDrizzle = async <TResult = unknown>(
  input: ExecuteSQLPlanWithDrizzleInput<TResult>,
): Promise<Awaited<TResult>> => {
  try {
    return await input.db.execute(sqlPlanToDrizzleSQL(input.plan));
  } catch (cause) {
    throw new DrizzleExecutionError({ sql: input.plan.sql, cause });
  }
};
