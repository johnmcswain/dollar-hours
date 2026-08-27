/**
 * @file         result.ts
 * @project      dollar-hours
 * @author       John McSwain <john.i.mcswain@gmail.com>
 * @purpose      Make failure a value rather than a control-flow event. A forecasting
 *               library that throws is a forecasting library nobody can compose.
 * @description  Minimal Result<T, E> discriminated union with the combinators the
 *               rest of the library actually uses. No dependencies.
 * @version      0.3.0
 * @since        0.1.0
 * @license      MIT
 * @complexity   Level 3 (expert)
 */

export type Result<T, E = ModelError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Structured failure. `path` locates the offending field inside a decision model. */
export interface ModelError {
  readonly code:
    | 'NEGATIVE_QUANTITY'
    | 'NON_FINITE'
    | 'EMPTY_MODEL'
    | 'INVALID_DISTRIBUTION'
    | 'INVALID_TRIALS';
  readonly message: string;
  readonly path?: string | undefined;
}

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const fail = (
  code: ModelError['code'],
  message: string,
  path?: string,
): Result<never, ModelError> => err({ code, message, path });

export const map = <T, U, E>(r: Result<T, E>, f: (t: T) => U): Result<U, E> =>
  r.ok ? ok(f(r.value)) : r;

export const flatMap = <T, U, E>(
  r: Result<T, E>,
  f: (t: T) => Result<U, E>,
): Result<U, E> => (r.ok ? f(r.value) : r);

export const unwrapOr = <T, E>(r: Result<T, E>, fallback: T): T =>
  r.ok ? r.value : fallback;

/**
 * Collect an array of Results into a Result of an array, short-circuiting on the
 * first failure. The workhorse for validating a model's alternatives.
 */
export const all = <T, E>(rs: readonly Result<T, E>[]): Result<T[], E> => {
  const out: T[] = [];
  for (const r of rs) {
    if (!r.ok) return r;
    out.push(r.value);
  }
  return ok(out);
};

/** Escape hatch for tests and examples. Throws on failure — never used in library code. */
export const expect = <T, E>(r: Result<T, E>, context = 'unwrap'): T => {
  if (r.ok) return r.value;
  throw new Error(`${context}: ${JSON.stringify(r.error)}`);
};
