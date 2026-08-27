/**
 * @file        test/units.test.ts
 * @project     dollar-hours
 * @author      John McSwain <john.i.mcswain@gmail.com>
 * @purpose     Prove the unit algebra is total, closed, and refuses nonsense inputs.
 * @version     0.3.0
 * @license     MIT
 */

import fc from 'fast-check';
import { describe, expect as vexpect, it } from 'vitest';

import { expect as unwrap } from '../src/result.js';
import {
  addDh,
  discountFactor,
  dollarHours,
  hours,
  rate,
  scaleDh,
  sumDh,
  valueOf,
} from '../src/units.js';

const finiteNonNeg = fc.double({ min: 0, max: 1e6, noNaN: true, noDefaultInfinity: true });

describe('smart constructors', () => {
  it('rejects negatives with a structured error', () => {
    const r = hours(-1, 'build.hours');
    vexpect(r.ok).toBe(false);
    if (!r.ok) {
      vexpect(r.error.code).toBe('NEGATIVE_QUANTITY');
      vexpect(r.error.path).toBe('build.hours');
    }
  });

  it('rejects NaN and Infinity', () => {
    vexpect(hours(Number.NaN).ok).toBe(false);
    vexpect(rate(Number.POSITIVE_INFINITY).ok).toBe(false);
  });

  it('accepts zero — a free option is still an option', () => {
    vexpect(unwrap(hours(0))).toBe(0);
  });
});

describe('dollar-hours algebra', () => {
  it('is the product of hours and rate', () => {
    fc.assert(
      fc.property(finiteNonNeg, finiteNonNeg, (h, r) => {
        const dh = dollarHours(unwrap(hours(h)), unwrap(rate(r)));
        vexpect(valueOf(dh)).toBeCloseTo(h * r, 6);
      }),
    );
  });

  it('addition is commutative and associative', () => {
    fc.assert(
      fc.property(finiteNonNeg, finiteNonNeg, finiteNonNeg, (a, b, c) => {
        const one = unwrap(rate(1));
        const A = dollarHours(unwrap(hours(a)), one);
        const B = dollarHours(unwrap(hours(b)), one);
        const C = dollarHours(unwrap(hours(c)), one);
        vexpect(valueOf(addDh(A, B))).toBeCloseTo(valueOf(addDh(B, A)), 6);
        vexpect(valueOf(addDh(addDh(A, B), C))).toBeCloseTo(valueOf(addDh(A, addDh(B, C))), 6);
      }),
    );
  });

  it('sumDh over an empty list is zero, not an error', () => {
    vexpect(valueOf(sumDh([]))).toBe(0);
  });

  it('scaling by one is identity', () => {
    const dh = dollarHours(unwrap(hours(120)), unwrap(rate(185)));
    vexpect(valueOf(scaleDh(dh, 1))).toBe(valueOf(dh));
  });
});

describe('discounting', () => {
  it('is 1 at a zero rate, for any period', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 240 }), (p) => {
        vexpect(discountFactor(0, p)).toBe(1);
      }),
    );
  });

  it('decreases monotonically in the period at a positive rate', () => {
    let prev = Number.POSITIVE_INFINITY;
    for (let p = 0; p < 60; p++) {
      const f = discountFactor(0.01, p);
      vexpect(f).toBeLessThan(prev);
      prev = f;
    }
  });
});
