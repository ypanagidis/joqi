export class QueryKitError extends Error {
  readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = new.target.name;
    this.cause = options?.cause;
  }
}

export class DriverNotFoundError extends QueryKitError {
  readonly driver: string;

  constructor(driver: string) {
    super(`Query driver not found: ${driver}`);
    this.driver = driver;
  }
}

export class DuplicateDriverError extends QueryKitError {
  readonly driver: string;

  constructor(driver: string) {
    super(`Duplicate query driver registered: ${driver}`);
    this.driver = driver;
  }
}

export class InvalidSpecError extends QueryKitError {}

export class AuthorizationError extends QueryKitError {}

export class PlanningError extends QueryKitError {}

export class LoweringError extends QueryKitError {}

export class QueryExecutionError extends QueryKitError {}

export class RenderError extends QueryKitError {}

export type RunDriverError =
  | DriverNotFoundError
  | DuplicateDriverError
  | InvalidSpecError
  | AuthorizationError
  | PlanningError
  | LoweringError
  | QueryExecutionError
  | RenderError;
