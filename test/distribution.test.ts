/**
 * @file        test/distribution.test.ts
 * @project     dollar-hours
 * @author      John McSwain <john.i.mcswain@gmail.com>
 * @purpose     Determinism is the audit guarantee; support and mean convergence are
 *              the correctness guarantee. Both are tested here rather than assumed.
 * @version     0.3.0
 * @license     MIT
 */

import { describe, expect, it } from 'vitest';

import {
  type Distribution,
  lognormal,
  meanOf,
  pert,
  point,
  rngFrom,
  sample,
  triangular,
  uniform,
} from '../src/distribution.js';
import { expect as unwrap } from '../src/result.js';

const draw = (d: Distribution, n: number, seed = 'test'): number[] => {
  const rng = rngFrom(seed);
  return Array.from({ length: n }, () => sample(d, rng));
};

const mean = (xs: readonly number[]): number =>
  xs.reduce((a, b) => a + b, 0) / xs.length;

describe('rng', () => {
  it('is reproducible from a seed', () => {
    const a = Array.from({ length: 50 }, () => rngFrom('adr-014').next());
    const b = Array.from({ length: 50 }, () => rngFrom('adr-014').next());
    expect(a).toEqual(b);
  });

  it('produces different streams for different seeds', () => {
    const a = Array.from({ length: 50 }, () => rngFrom('a').next());
    const b = Array.from({ length: 50 }, () => rngFrom('b').next());
    expect(a).not.toEqual(b);
  });

  it('stays within [0, 1)', () => {
    const rng = rngFrom('bounds');
    for (let i = 0; i < 20_000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('has an approximately uniform mean', () => {
    const rng = rngFrom('uniformity');
    const xs = Array.from({ length: 100_000 }, () => rng.next());
    expect(mean(xs)).toBeCloseTo(0.5, 2);
  });
});

describe('constructors reject malformed parameters', () => {
  it('rejects an out-of-order triangular', () => {
    expect(triangular(10, 5, 20).ok).toBe(false);
  });

  it('rejects a degenerate uniform range direction', () => {
    expect(uniform(10, 2).ok).toBe(false);
  });

  it('rejects a non-positive lognormal sigma', () => {
    expect(lognormal(100, 0).ok).toBe(false);
  });

  it('rejects a non-positive pert lambda', () => {
    expect(pert(1, 2, 3, 0).ok).toBe(false);
  });
});

describe('sampling', () => {
  it('point is exact and constant', () => {
    expect(draw(unwrap(point(42)), 100)).toEqual(Array(100).fill(42));
  });

  it('bounded distributions stay inside their support', () => {
    for (const d of [
      unwrap(uniform(10, 20)),
      unwrap(triangular(10, 12, 20)),
      unwrap(pert(10, 12, 20)),
    ]) {
      for (const x of draw(d, 20_000)) {
        expect(x).toBeGreaterThanOrEqual(10);
        expect(x).toBeLessThanOrEqual(20);
      }
    }
  });

  it('lognormal is strictly positive and right-skewed', () => {
    const xs = draw(unwrap(lognormal(100, 0.6)), 50_000);
    expect(Math.min(...xs)).toBeGreaterThan(0);
    const sorted = [...xs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    // For a lognormal the mean exceeds the median. That is the whole point of
    // using it for schedule risk.
    expect(mean(xs)).toBeGreaterThan(median);
  });
});

describe('analytic means match sampled means', () => {
  const cases: ReadonlyArray<readonly [string, Distribution]> = [
    ['uniform', unwrap(uniform(10, 20))],
    ['triangular', unwrap(triangular(10, 12, 20))],
    ['pert', unwrap(pert(10, 12, 20))],
    ['lognormal', unwrap(lognormal(100, 0.4))],
  ];

  for (const [name, d] of cases) {
    it(`${name} converges to meanOf within 2%`, () => {
      const empirical = mean(draw(d, 200_000, `converge-${name}`));
      const analytic = meanOf(d);
      expect(Math.abs(empirical - analytic) / analytic).toBeLessThan(0.02);
    });
  }

  it('pert weights the mode more heavily than triangular does', () => {
    // Same three-point estimate, different confidence in the mode.
    const t = meanOf(unwrap(triangular(10, 12, 40)));
    const p = meanOf(unwrap(pert(10, 12, 40)));
    expect(p).toBeLessThan(t);
  });
});
