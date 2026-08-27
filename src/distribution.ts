/**
 * @file         distribution.ts
 * @project      dollar-hours
 * @author       John McSwain <john.i.mcswain@gmail.com>
 * @purpose      Let an engineer express an estimate the way they actually hold it —
 *               "about three weeks, maybe two, could be seven if the schema fights
 *               back" — instead of forcing a single fraudulent number.
 * @description  Deterministic, seedable pseudo-random source (sfc32) and the small
 *               family of distributions appropriate to effort estimation, including
 *               beta-PERT sampled through Marsaglia–Tsang gamma variates.
 * @version      0.3.0
 * @since        0.1.0
 * @license      MIT
 * @complexity   Level 3 (expert)
 *
 * @remarks
 * Determinism is a requirement, not a convenience. A forecast that cannot be
 * reproduced from its seed cannot be audited, and an un-auditable forecast has no
 * business informing an architecture decision.
 */

import { type Result, fail, ok } from './result.js';

/** A seeded, reproducible uniform source on [0, 1). */
export interface Rng {
  next(): number;
}

/** cyrb128 — string seed to four 32-bit words. */
const seedWords = (seed: string): [number, number, number, number] => {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];
};

/**
 * sfc32 — small, fast, statistically respectable counter-based generator.
 * Chosen over Math.random because the seed is the audit trail.
 */
export const rngFrom = (seed: string): Rng => {
  let [a, b, c, d] = seedWords(seed);
  return {
    next(): number {
      a >>>= 0;
      b >>>= 0;
      c >>>= 0;
      d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    },
  };
};

export type Distribution =
  | { readonly kind: 'point'; readonly value: number }
  | { readonly kind: 'uniform'; readonly min: number; readonly max: number }
  | {
      readonly kind: 'triangular';
      readonly min: number;
      readonly mode: number;
      readonly max: number;
    }
  | {
      readonly kind: 'pert';
      readonly min: number;
      readonly mode: number;
      readonly max: number;
      readonly lambda: number;
    }
  | { readonly kind: 'lognormal'; readonly median: number; readonly sigma: number };

export const point = (value: number): Result<Distribution> =>
  Number.isFinite(value)
    ? ok({ kind: 'point', value })
    : fail('INVALID_DISTRIBUTION', `point value must be finite, received ${value}`);

export const uniform = (min: number, max: number): Result<Distribution> =>
  Number.isFinite(min) && Number.isFinite(max) && max >= min
    ? ok({ kind: 'uniform', min, max })
    : fail('INVALID_DISTRIBUTION', `uniform requires finite min <= max, got [${min}, ${max}]`);

export const triangular = (
  min: number,
  mode: number,
  max: number,
): Result<Distribution> =>
  min <= mode && mode <= max && max > min
    ? ok({ kind: 'triangular', min, mode, max })
    : fail(
        'INVALID_DISTRIBUTION',
        `triangular requires min <= mode <= max with min < max, got [${min}, ${mode}, ${max}]`,
      );

/**
 * Beta-PERT: the estimator's distribution. `lambda` is the weight placed on the
 * modal estimate; the classical PERT value is 4.
 */
export const pert = (
  min: number,
  mode: number,
  max: number,
  lambda = 4,
): Result<Distribution> =>
  min <= mode && mode <= max && max > min && lambda > 0
    ? ok({ kind: 'pert', min, mode, max, lambda })
    : fail(
        'INVALID_DISTRIBUTION',
        `pert requires min <= mode <= max with min < max and lambda > 0, got [${min}, ${mode}, ${max}] λ=${lambda}`,
      );

/** Heavy right tail — the honest shape for "how bad could the migration get". */
export const lognormal = (median: number, sigma: number): Result<Distribution> =>
  median > 0 && sigma > 0
    ? ok({ kind: 'lognormal', median, sigma })
    : fail(
        'INVALID_DISTRIBUTION',
        `lognormal requires median > 0 and sigma > 0, got median=${median} sigma=${sigma}`,
      );

/** Box–Muller, single variate. */
const standardNormal = (rng: Rng): number => {
  let u = 0;
  while (u === 0) u = rng.next();
  const v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/** Marsaglia–Tsang gamma sampler, shape >= 1 handled directly, shape < 1 by boost. */
const sampleGamma = (rng: Rng, shape: number): number => {
  if (shape < 1) {
    return sampleGamma(rng, shape + 1) * Math.pow(rng.next(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = standardNormal(rng);
    const v = Math.pow(1 + c * x, 3);
    if (v <= 0) continue;
    const u = rng.next();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
};

const sampleBeta = (rng: Rng, alpha: number, beta: number): number => {
  const x = sampleGamma(rng, alpha);
  const y = sampleGamma(rng, beta);
  return x / (x + y);
};

/** Draw one variate. Pure with respect to the supplied Rng's state. */
export const sample = (d: Distribution, rng: Rng): number => {
  switch (d.kind) {
    case 'point':
      return d.value;
    case 'uniform':
      return d.min + rng.next() * (d.max - d.min);
    case 'triangular': {
      const u = rng.next();
      const f = (d.mode - d.min) / (d.max - d.min);
      return u < f
        ? d.min + Math.sqrt(u * (d.max - d.min) * (d.mode - d.min))
        : d.max - Math.sqrt((1 - u) * (d.max - d.min) * (d.max - d.mode));
    }
    case 'pert': {
      const range = d.max - d.min;
      const alpha = 1 + (d.lambda * (d.mode - d.min)) / range;
      const beta = 1 + (d.lambda * (d.max - d.mode)) / range;
      return d.min + sampleBeta(rng, alpha, beta) * range;
    }
    case 'lognormal':
      return d.median * Math.exp(d.sigma * standardNormal(rng));
  }
};

/**
 * Analytic mean where one exists in closed form. Used by the explainer so that a
 * decomposition does not itself depend on sampling noise.
 */
export const meanOf = (d: Distribution): number => {
  switch (d.kind) {
    case 'point':
      return d.value;
    case 'uniform':
      return (d.min + d.max) / 2;
    case 'triangular':
      return (d.min + d.mode + d.max) / 3;
    case 'pert':
      return (d.min + d.lambda * d.mode + d.max) / (d.lambda + 2);
    case 'lognormal':
      return d.median * Math.exp((d.sigma * d.sigma) / 2);
  }
};
