/**
 * Result Type
 * 
 * Discriminated union type for explicit error handling.
 * Provides type-safe success/failure handling without exceptions.
 */

/**
 * Represents a successful result.
 */
export interface Success<T> {
  readonly success: true
  readonly value: T
}

/**
 * Represents a failed result.
 */
export interface Failure<E = Error> {
  readonly success: false
  readonly error: E
}

/**
 * Result type - either Success<T> or Failure<E>.
 */
export type Result<T, E = Error> = Success<T> | Failure<E>

/**
 * Create a successful result.
 */
export function ok<T>(value: T): Success<T> {
  return { success: true, value }
}

/**
 * Create a failed result.
 */
export function err<E = Error>(error: E): Failure<E> {
  return { success: false, error }
}

/**
 * Type guard for successful results.
 */
export function isOk<T, E>(result: Result<T, E>): result is Success<T> {
  return result.success === true
}

/**
 * Type guard for failed results.
 */
export function isErr<T, E>(result: Result<T, E>): result is Failure<E> {
  return result.success === false
}

/**
 * Unwrap a result, throwing on error.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.value
  }
  throw result.error
}

/**
 * Unwrap a result with a default value for errors.
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (isOk(result)) {
    return result.value
  }
  return defaultValue
}

/**
 * Unwrap a result with a lazy default value for errors.
 */
export function unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T {
  if (isOk(result)) {
    return result.value
  }
  return fn(result.error)
}

/**
 * Map the success value of a result.
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (isOk(result)) {
    return ok(fn(result.value))
  }
  return result
}

/**
 * Map the error of a result.
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (isErr(result)) {
    return err(fn(result.error))
  }
  return result
}

/**
 * Flat map (chain) results.
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (isOk(result)) {
    return fn(result.value)
  }
  return result
}

/**
 * Apply a function that might fail.
 */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  return flatMap(result, fn)
}

/**
 * Try running a function and capture any thrown errors.
 */
export function tryCatch<T>(fn: () => T): Result<T, Error> {
  try {
    return ok(fn())
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)))
  }
}

/**
 * Try running an async function and capture any thrown errors.
 */
export async function tryCatchAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    const value = await fn()
    return ok(value)
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)))
  }
}

/**
 * Combine multiple results into a single result.
 * Returns the first error encountered, or all successes.
 */
export function all<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = []
  
  for (const result of results) {
    if (isErr(result)) {
      return result
    }
    values.push(result.value)
  }
  
  return ok(values)
}

/**
 * Match on a result with handlers for success and failure.
 */
export function match<T, E, U>(
  result: Result<T, E>,
  handlers: {
    ok: (value: T) => U
    err: (error: E) => U
  }
): U {
  if (isOk(result)) {
    return handlers.ok(result.value)
  }
  return handlers.err(result.error)
}

/**
 * Convert a nullable value to a result.
 */
export function fromNullable<T>(
  value: T | null | undefined,
  error: Error = new Error('Value is null or undefined')
): Result<T, Error> {
  if (value === null || value === undefined) {
    return err(error)
  }
  return ok(value)
}

/**
 * Convert a result to a nullable value.
 */
export function toNullable<T, E>(result: Result<T, E>): T | null {
  if (isOk(result)) {
    return result.value
  }
  return null
}

/**
 * AsyncResult type alias for Promise<Result>.
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>

/**
 * Create a typed error for result failures.
 */
export class ResultError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'ResultError'
  }
}

/**
 * Common error codes.
 */
export const ErrorCodes = {
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION: 'VALIDATION',
  PERMISSION: 'PERMISSION',
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
  UNKNOWN: 'UNKNOWN',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

/**
 * Create a typed error with code.
 */
export function typedErr(
  code: ErrorCode,
  message: string,
  cause?: unknown
): Failure<ResultError> {
  return err(new ResultError(message, code, cause))
}
