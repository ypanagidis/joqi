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

export type QueryRuntimeRunInput = {
  readonly spec: unknown;
  readonly params?: QueryParams | undefined;
  readonly explain?: boolean | undefined;
};

export type QueryRuntimeExplain = {
  readonly registry: ResolvedRegistry;
  readonly ir: QueryIR;
  readonly sqlPlan: SQLPlan;
};

export type QueryRuntimeResult = {
  readonly rows: QueryResultRows;
  readonly explain?: QueryRuntimeExplain | undefined;
};

export type QueryRuntimeRunError = ResolveRegistryError | CompileQuerySpecToSQLError;

export type QueryRuntime = {
  readonly run: (input: QueryRuntimeRunInput) => Promise<QueryRuntimeResult>;
};

export const createQueryRuntime = <TDb, TResult = unknown>(
  input: CreateQueryRuntimeInput<TDb, TResult>,
): QueryRuntime => ({
  run: async (runInput: QueryRuntimeRunInput): Promise<QueryRuntimeResult> => {
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
  },
});
