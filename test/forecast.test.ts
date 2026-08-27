/**
 * @file        test/forecast.test.ts
 * @project     dollar-hours
 * @author      John McSwain <john.i.mcswain@gmail.com>
 * @purpose     Test the properties that make the forecast trustworthy — reproducibility,
 *              validation, ordering of quantiles, and that the explanation actually
 *              reconciles with the simulation — rather than snapshotting numbers.
 * @version     0.3.0
 * @license     MIT
 */

import { describe, expect, it } from 'vitest';

import { explainAlternative, summarise } from '../src/explain.js';
import { validate } from '../src/model.js';
import { sensitivity } from '../src/sensitivity.js';
import { simulate } from '../src/simulate.js';
import { forecast } from '../src/index.js';
import { expect as unwrap } from '../src/result.js';
import { adr014, deterministic } from './fixtures.js';

describe('validation', () => {
  it('accepts a well-formed model', () => {
    expect(validate(adr014).ok).toBe(true);
  });

  it('rejects a model with no alternatives', () => {
    const r = validate({ ...adr014, alternatives: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('EMPTY_MODEL');
  });

  it('rejects a fractional horizon and points at the field', () => {
    const r = validate({ ...adr014, horizonPeriods: 3.5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.path).toBe('horizonPeriods');
  });

  it('rejects a risk probability outside [0, 1]', () => {
    const alt = adr014.alternatives[0]!;
    const terms = alt.terms.map((t) =>
      t.kind === 'risk' ? { ...t, probability: 1.4 } : t,
    );
    const r = validate({ ...adr014, alternatives: [{ ...alt, terms }] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('INVALID_DISTRIBUTION');
      expect(r.error.path).toContain('probability');
    }
  });

  it('rejects duplicate term ids within an alternative', () => {
    const alt = adr014.alternatives[0]!;
    const first = alt.terms[0]!;
    const r = validate({
      ...adr014,
      alternatives: [{ ...alt, terms: [first, { ...first }] }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('duplicate term ids');
  });

  it('rejects a non-positive trial count before doing any work', () => {
    const r = simulate(adr014, { trials: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INVALID_TRIALS');
  });
});

describe('simulation', () => {
  it('is bit-for-bit reproducible from its seed', () => {
    const a = unwrap(simulate(adr014, { trials: 3_000, seed: 'fixed' }));
    const b = unwrap(simulate(adr014, { trials: 3_000, seed: 'fixed' }));
    expect(Array.from(a.outcomes[0]!.samples)).toEqual(Array.from(b.outcomes[0]!.samples));
    expect(a.preferredId).toBe(b.preferredId);
  });

  it('produces different results for a different seed', () => {
    const a = unwrap(simulate(adr014, { trials: 3_000, seed: 'one' }));
    const b = unwrap(simulate(adr014, { trials: 3_000, seed: 'two' }));
    expect(a.outcomes[0]!.mean).not.toBe(b.outcomes[0]!.mean);
  });

  it('records its own provenance', () => {
    const r = unwrap(simulate(adr014, { trials: 500, seed: 'prov' }));
    expect(r.meta.name).toBe('dollar-hours');
    expect(r.meta.author).toContain('John McSwain');
    expect(r.seed).toBe('prov');
    expect(r.trials).toBe(500);
  });

  it('orders quantiles p10 <= p50 <= p90', () => {
    const r = unwrap(simulate(adr014, { trials: 8_000, seed: 'quantiles' }));
    for (const o of r.outcomes) {
      expect(o.p10).toBeLessThanOrEqual(o.p50);
      expect(o.p50).toBeLessThanOrEqual(o.p90);
    }
  });

  it('collapses to an exact answer when every input is a point estimate', () => {
    const r = unwrap(simulate(deterministic, { trials: 200, seed: 'det' }));
    const o = r.outcomes[0]!;
    expect(o.mean).toBeCloseTo(20_000, 9);
    expect(o.stdDev).toBeCloseTo(0, 9);
    expect(o.p10).toBeCloseTo(o.p90, 9);
  });

  it('assigns the preferred option a win probability of 1 against itself', () => {
    const r = unwrap(simulate(adr014, { trials: 2_000, seed: 'win' }));
    expect(r.winProbability.get(r.preferredId)).toBe(1);
  });

  it('reports win probabilities inside [0, 1]', () => {
    const r = unwrap(simulate(adr014, { trials: 5_000, seed: 'range' }));
    for (const [, p] of r.winProbability) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('converges: the sample mean approaches the analytic expectation', () => {
    const r = unwrap(simulate(adr014, { trials: 120_000, seed: 'converge' }));
    for (const o of r.outcomes) {
      const alt = adr014.alternatives.find((a) => a.id === o.id)!;
      const analytic = explainAlternative(alt, adr014).expectedTotal;
      expect(Math.abs(o.mean - analytic) / analytic).toBeLessThan(0.03);
    }
  });
});

describe('explanation', () => {
  it('contributions sum to the expected total', () => {
    for (const alt of adr014.alternatives) {
      const e = explainAlternative(alt, adr014);
      const sum = e.contributions.reduce((s, c) => s + c.expectedDollarHours, 0);
      expect(sum).toBeCloseTo(e.expectedTotal, 6);
    }
  });

  it('shares sum to one', () => {
    for (const alt of adr014.alternatives) {
      const e = explainAlternative(alt, adr014);
      expect(e.contributions.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 9);
    }
  });

  it('is sorted by contribution, descending', () => {
    const e = explainAlternative(adr014.alternatives[0]!, adr014);
    const values = e.contributions.map((c) => c.expectedDollarHours);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  it('byKind partitions the total', () => {
    const e = explainAlternative(adr014.alternatives[1]!, adr014);
    const sum = e.byKind.build + e.byKind.carry + e.byKind.risk;
    expect(sum).toBeCloseTo(e.expectedTotal, 6);
  });

  it('names carry as the driver when carry dominates', () => {
    // The monolith option is cheap to build and expensive to live with. If the
    // narrative does not say so, the library has failed at its actual job.
    const e = explainAlternative(adr014.alternatives[0]!, adr014);
    expect(e.byKind.carry).toBeGreaterThan(e.byKind.build);
    expect(e.narrative).toContain('Carry dominates');
  });

  it('summarise flags a decision the model cannot separate', () => {
    const twins = {
      ...adr014,
      alternatives: [
        adr014.alternatives[0]!,
        { ...adr014.alternatives[0]!, id: 'twin', label: 'Identical twin' },
      ],
    };
    const sim = unwrap(simulate(twins, { trials: 4_000, seed: 'twins' }));
    expect(summarise(twins, sim)).toContain('does not separate');
  });
});

describe('sensitivity', () => {
  it('variance shares sum to one and are non-negative', () => {
    const r = unwrap(simulate(adr014, { trials: 20_000, seed: 'sens' }));
    for (const o of r.outcomes) {
      const s = sensitivity(o);
      expect(s.inputs.reduce((acc, i) => acc + i.varianceShare, 0)).toBeCloseTo(1, 6);
      for (const i of s.inputs) expect(i.varianceShare).toBeGreaterThanOrEqual(0);
    }
  });

  it('is sorted by variance share, descending', () => {
    const r = unwrap(simulate(adr014, { trials: 20_000, seed: 'sorted' }));
    const shares = sensitivity(r.outcomes[0]!).inputs.map((i) => i.varianceShare);
    expect(shares).toEqual([...shares].sort((a, b) => b - a));
  });

  it('identifies the risk trigger as the dominant driver for the monolith option', () => {
    const r = unwrap(simulate(adr014, { trials: 40_000, seed: 'driver' }));
    const monolith = r.outcomes.find((o) => o.id === 'extend-monolith')!;
    const top = sensitivity(monolith).inputs[0]!;
    // A 35% chance of an ~900-hour forced extraction swamps everything else.
    expect(top.termId).toBe('rewrite');
    expect(top.swingDollarHours).toBeGreaterThan(0);
  });

  it('gives a constant input zero influence rather than NaN', () => {
    const r = unwrap(simulate(deterministic, { trials: 1_000, seed: 'const' }));
    for (const i of sensitivity(r.outcomes[0]!).inputs) {
      expect(Number.isNaN(i.rankCorrelation)).toBe(false);
      expect(i.rankCorrelation).toBe(0);
    }
  });
});

describe('forecast pipeline', () => {
  it('returns simulation, explanations, sensitivities and a report together', () => {
    const f = unwrap(forecast(adr014, { trials: 5_000, seed: 'pipeline' }));
    expect(f.simulation.outcomes).toHaveLength(2);
    expect(f.explanations).toHaveLength(2);
    expect(f.sensitivities).toHaveLength(2);
    expect(f.report).toContain('ADR-014');
    expect(f.report).toContain('seed "pipeline"');
  });

  it('propagates validation failure without throwing', () => {
    const r = forecast({ ...adr014, alternatives: [] });
    expect(r.ok).toBe(false);
  });
});
