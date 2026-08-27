/**
 * @file         sensitivity.ts
 * @project      dollar-hours
 * @author       John McSwain <john.i.mcswain@gmail.com>
 * @purpose      Answer the only question that changes behaviour: of everything we
 *               guessed at, which guess actually matters? That is where the next
 *               hour of investigation should go.
 * @description  Post-hoc variance attribution over retained simulation samples.
 *               Spearman rank correlation (monotone, robust to the skew that effort
 *               estimates always have) plus a decile-conditioned swing estimate.
 * @version      0.3.0
 * @since        0.3.0
 * @license      MIT
 * @complexity   Level 3 (expert)
 *
 * @remarks
 * Rank correlation is used rather than Pearson because effort distributions are
 * right-skewed by nature and a handful of tail trials would otherwise dominate the
 * attribution. Neither method is a Sobol index; both are honest about being an
 * approximation, which is why `method` is reported alongside the numbers.
 */

import { type AlternativeOutcome } from './simulate.js';

export interface InputSensitivity {
  readonly key: string;
  readonly alternativeId: string;
  readonly termId: string;
  readonly field: string;
  /** Spearman rank correlation with total cost, in [-1, 1]. */
  readonly rankCorrelation: number;
  /** rho² normalised across inputs — an approximate share of explained variance. */
  readonly varianceShare: number;
  /**
   * Difference in mean total cost between the top and bottom decile of this input.
   * Denominated in Dollar-Hours, which is what makes it actionable.
   */
  readonly swingDollarHours: number;
}

export interface SensitivityReport {
  readonly alternativeId: string;
  readonly method: 'spearman-rank-correlation + decile-swing';
  /** Sorted by |varianceShare|, descending. */
  readonly inputs: readonly InputSensitivity[];
}

/** Fractional ranks with ties averaged. */
const ranks = (xs: Float64Array): Float64Array => {
  const n = xs.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  idx.sort((a, b) => xs[a]! - xs[b]!);

  const r = new Float64Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && xs[idx[j + 1]!]! === xs[idx[i]!]!) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k]!] = avg;
    i = j + 1;
  }
  return r;
};

const pearson = (a: Float64Array, b: Float64Array): number => {
  const n = a.length;
  if (n === 0) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= n;
  mb /= n;

  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]! - ma;
    const y = b[i]! - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const den = Math.sqrt(da * db);
  // A constant input (a point estimate) has zero variance and, correctly, zero
  // influence — not a division by zero.
  return den === 0 ? 0 : num / den;
};

const spearman = (a: Float64Array, b: Float64Array): number =>
  pearson(ranks(a), ranks(b));

/** Mean of `target` over the trials where `driver` falls in the given decile band. */
const conditionalMean = (
  driver: Float64Array,
  target: Float64Array,
  lo: number,
  hi: number,
): number => {
  const n = driver.length;
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (x, y) => driver[x]! - driver[y]!,
  );
  const start = Math.floor(lo * n);
  const end = Math.max(start + 1, Math.floor(hi * n));
  let sum = 0;
  for (let i = start; i < end; i++) sum += target[order[i]!]!;
  return sum / (end - start);
};

/**
 * Attribute the spread in an alternative's total cost to the inputs that drive it.
 *
 * @param outcome A simulated alternative, with its retained input samples.
 */
export const sensitivity = (outcome: AlternativeOutcome): SensitivityReport => {
  const raw = [...outcome.inputs.entries()].map(([key, samples]) => {
    const [alternativeId = '', termId = '', field = ''] = key.split('::');
    const rho = spearman(samples, outcome.samples);
    const swing =
      conditionalMean(samples, outcome.samples, 0.9, 1.0) -
      conditionalMean(samples, outcome.samples, 0.0, 0.1);
    return { key, alternativeId, termId, field, rankCorrelation: rho, swing };
  });

  const totalRhoSq = raw.reduce((s, r) => s + r.rankCorrelation ** 2, 0);

  const inputs: InputSensitivity[] = raw
    .map((r) => ({
      key: r.key,
      alternativeId: r.alternativeId,
      termId: r.termId,
      field: r.field,
      rankCorrelation: r.rankCorrelation,
      varianceShare: totalRhoSq === 0 ? 0 : r.rankCorrelation ** 2 / totalRhoSq,
      swingDollarHours: r.swing,
    }))
    .sort((a, b) => b.varianceShare - a.varianceShare);

  return {
    alternativeId: outcome.id,
    method: 'spearman-rank-correlation + decile-swing',
    inputs,
  };
};
