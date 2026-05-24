import type { QueryIR } from "./query/lower.js";
import { lowerQuerySpecToIRPromise } from "./query/lower.js";
import type { ResolveRegistryError } from "./registry/resolve.js";
import { resolveRegistryPromise } from "./registry/resolve.js";
import { parseQueryIRResultRows, type QueryResultRows } from "./results/schema.js";
import type { QueryParams } from "./specs/query.js";
import type { ResolvedRegistry } from "./specs/registries.js";
import type { CompileQuerySpecToSQLError } from "./compiler/sql/index.js";
import { compileQuerySpecToSQLPromise } from "./compiler/sql/index.js";
import type { SQLDialect, SQLPlan } from "./compiler/sql/types.js";

export type QueryRuntimeExecutor<TDb, TResult = unknown> = (input: {
  readonly db: TDb;
  readonly plan: SQLPlan;
}) => TResult | Promise<TResult>;

export type CreateQueryRuntimeInput<TDb, TResult = unknown> = {
  readonly db: TDb;
  readonly physicalRegistry: unknown;
  readonly defaults?: unknown;
  readonly policy?: unknown;
  readonly policies?: readonly unknown[] | undefined;
  readonly dialect?: SQLDialect | undefined;
  readonly executor: QueryRuntimeExecutor<TDb, TResult>;
};

export type QueryRuntimeRunInputBase = {
  readonly spec: unknown;
  readonly params?: QueryParams | undefined;
};

export type QueryRuntimeRunInput = QueryRuntimeRunInputBase & {
  readonly explain?: boolean | undefined;
};

export type QueryRuntimeRunInputWithExplain = QueryRuntimeRunInputBase & {
  readonly explain: true;
};

export type QueryRuntimeRunInputWithoutExplain = QueryRuntimeRunInputBase & {
  readonly explain?: false | undefined;
};

export type QueryRuntimeExplain = {
  readonly registry: ResolvedRegistry;
  readonly ir: QueryIR;
  readonly sqlPlan: SQLPlan;
};

export type QueryRuntimeResult = {
  readonly rows: QueryResultRows;
};

export type QueryRuntimeResultWithExplain = QueryRuntimeResult & {
  readonly explain: QueryRuntimeExplain;
};

export type QueryRuntimeRunError = ResolveRegistryError | CompileQuerySpecToSQLError;

export type QueryRuntime = {
  run(input: QueryRuntimeRunInputWithExplain): Promise<QueryRuntimeResultWithExplain>;
  run(input: QueryRuntimeRunInputWithoutExplain): Promise<QueryRuntimeResult>;
  run(input: QueryRuntimeRunInput): Promise<QueryRuntimeResult | QueryRuntimeResultWithExplain>;
};

export const createQueryRuntime = <TDb, TResult = unknown>(
  input: CreateQueryRuntimeInput<TDb, TResult>,
): QueryRuntime => {
  async function run(
    input: QueryRuntimeRunInputWithExplain,
  ): Promise<QueryRuntimeResultWithExplain>;
  async function run(input: QueryRuntimeRunInputWithoutExplain): Promise<QueryRuntimeResult>;
  async function run(
    input: QueryRuntimeRunInput,
  ): Promise<QueryRuntimeResult | QueryRuntimeResultWithExplain>;
  async function run(
    runInput: QueryRuntimeRunInput,
  ): Promise<QueryRuntimeResult | QueryRuntimeResultWithExplain> {
    const registry = await resolveRegistryPromise({
      physical: input.physicalRegistry,
      ...(input.defaults === undefined ? {} : { defaults: input.defaults }),
      ...(input.policy === undefined ? {} : { policy: input.policy }),
      ...(input.policies === undefined ? {} : { policies: input.policies }),
    });
    const queryInput = {
      query: runInput.spec,
      registry,
      params: runInput.params,
    };
    const ir = await lowerQuerySpecToIRPromise(queryInput);
    const sqlPlan = await compileQuerySpecToSQLPromise({
      ...queryInput,
      ...(input.dialect === undefined ? {} : { dialect: input.dialect }),
    });
    const result = await input.executor({ db: input.db, plan: sqlPlan });
    const rows = parseQueryIRResultRows(ir, result);

    if (runInput.explain === true) {
      return {
        rows,
        explain: {
          registry,
          ir,
          sqlPlan,
        },
      };
    }

    return { rows };
  }

  return { run };
};
