/**
 * @file         units.ts
 * @project      dollar-hours
 * @author       John McSwain <john.i.mcswain@gmail.com>
 * @purpose      Prevent the single most common error in cost modelling — adding a
 *               quantity to another quantity that is not the same kind of thing —
 *               at compile time rather than in a spreadsheet review.
 * @description  Nominal (branded) numeric types for Hours, Usd, Rate and DollarHours,
 *               with validated smart constructors and the only arithmetic that is
 *               dimensionally legal between them.
 * @version      0.3.0
 * @since        0.1.0
 * @license      MIT
 * @complexity   Level 3 (expert)
 *
 * @remarks
 * A Dollar-Hour ($h) is one engineer-hour valued at a blended, fully loaded rate.
 * It is deliberately *not* just "money": carrying the hour provenance is what lets
 * the explainer say "this decision is expensive because of recurring toil", rather
 * than only "this decision is expensive".
 */

import { type Result, fail, ok } from './result.js';

declare const BRAND: unique symbol;

/** Nominal type helper. Two Brands over `number` are not assignable to each other. */
type Brand<T, B extends string> = T & { readonly [BRAND]: B };

/** A duration of engineering effort. */
export type Hours = Brand<number, 'Hours'>;
/** Money, in United States dollars. */
export type Usd = Brand<number, 'Usd'>;
/** A blended, fully loaded cost per engineer-hour. */
export type Rate = Brand<number, 'UsdPerHour'>;
/** The library's unit of account: hours × rate, retaining hour provenance. */
export type DollarHours = Brand<number, 'DollarHours'>;

const finiteNonNegative = <B extends string>(
  n: number,
  kind: B,
  path?: string,
): Result<Brand<number, B>> => {
  if (!Number.isFinite(n)) {
    return fail('NON_FINITE', `${kind} must be a finite number, received ${n}`, path);
  }
  if (n < 0) {
    return fail('NEGATIVE_QUANTITY', `${kind} must be >= 0, received ${n}`, path);
  }
  return ok(n as Brand<number, B>);
};

export const hours = (n: number, path?: string): Result<Hours> =>
  finiteNonNegative(n, 'Hours', path);

export const usd = (n: number, path?: string): Result<Usd> =>
  finiteNonNegative(n, 'Usd', path);

export const rate = (n: number, path?: string): Result<Rate> =>
  finiteNonNegative(n, 'UsdPerHour', path);

/**
 * The defining product of the library.
 *
 * @example
 * const h = expect(hours(120));
 * const r = expect(rate(185));
 * valueOf(dollarHours(h, r)); // 22200
 */
export const dollarHours = (h: Hours, r: Rate): DollarHours =>
  ((h as number) * (r as number)) as DollarHours;

/** Sum of Dollar-Hours. The only addition the type system permits. */
export const addDh = (a: DollarHours, b: DollarHours): DollarHours =>
  ((a as number) + (b as number)) as DollarHours;

export const sumDh = (xs: readonly DollarHours[]): DollarHours =>
  xs.reduce((a, b) => addDh(a, b), 0 as DollarHours);

/** Scale by a dimensionless factor (a discount factor, a probability, a count). */
export const scaleDh = (a: DollarHours, factor: number): DollarHours =>
  ((a as number) * factor) as DollarHours;

export const scaleHours = (h: Hours, factor: number): Hours =>
  ((h as number) * factor) as Hours;

/** Unwrap a branded value for display or serialisation. */
export const valueOf = (x: Hours | Usd | Rate | DollarHours): number => x as number;

/**
 * Present-value discount factor for a cost incurred `period` periods from now.
 * Carry costs land in the future; pretending otherwise overstates them.
 */
export const discountFactor = (annualRate: number, period: number): number =>
  1 / Math.pow(1 + annualRate, period);
