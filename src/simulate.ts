/**
 * @file         simulate.ts
 * @project      dollar-hours
 * @author       John McSwain <john.i.mcswain@gmail.com>
 * @purpose      Produce a distribution of outcomes rather than a number, because the
 *               spread between alternatives is usually smaller than the spread within
 *               either one — and that fact should change how the decision is made.
 * @description  Seeded Monte Carlo engine over a validated DecisionModel. Retains
 *               every sampled input so that variance can be attributed afterwards
 *               without re-running the simulation.
 * @version      0.3.0
 * @since        0.2.0
 * @license      MIT
 * @complexity   Level 3 (expert)
 */

import { type Rng, rngFrom, sample } from './distribution.js';
import { META, type ProjectMeta } from './meta.js';
import { type Alternative, type DecisionModel, inputKey, validate } from './model.js';
import { type Result, fail, flatMap, ok } from './result.js';
import { discountFactor } from './units.js';

export interface AlternativeOutcome {
  readonly id: string;
  readonly label: string;
  /** Expected total cost, in Dollar-Hours. */
  readonly mean: number;
  readonly stdDev: number;
  readonly p10: number;
  readonly p50: number;
  readonly p90: number;
  /** Per-trial totals, retained for attribution and plotting. */
  readonly samples: Float64Array;
  /** Every sampled input, keyed by {@link inputKey}. */
  readonly inputs: ReadonlyMap<string, Float64Array>;
}

export interface SimulationResult {
  readonly meta: ProjectMeta;
  readonly modelId: string;
  readonly seed: string;
  readonly trials: number;
  readonly outcomes: readonly AlternativeOutcome[];
  /** Id of the alternative with the lowest expected Dollar-Hours. */
  readonly preferredId: string;
  /**
   * P(the preferred alternative costs less than alternative i), keyed by i's id.
   * The preferred alternative maps to 1 by construction. A preferred alternative
   * that only wins 55% of the time against its rival is not a decision, it is a
   * coin flip with extra steps — and the caller should be told so.
   */
  readonly winProbability: ReadonlyMap<string, number>;
}

export interface SimulateOptions {
  readonly trials?: number;
  readonly seed?: string;
}

/** Nearest-rank quantile over a pre-sorted array. */
const quantile = (sorted: Float64Array, q: number): number => {
  if (sorted.length === 0) return Number.NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx]!;
};

const simulateAlternative = (
  alt: Alternative,
  model: DecisionModel,
  trials: number,
  rng: Rng,
): AlternativeOutcome => {
  const totals = new Float64Array(trials);
  const inputs = new Map<string, Float64Array>();

  const track = (key: string): Float64Array => {
    let arr = inputs.get(key);
    if (!arr) {
      arr = new Float64Array(trials);
      inputs.set(key, arr);
    }
    return arr;
  };

  // Carry accrues once per period; discounting each period separately is the
  // difference between a defensible number and a persuasive one.
  const carryDiscount = (() => {
    let sum = 0;
    for (let p = 1; p <= model.horizonPeriods; p++) {
      sum += discountFactor(model.discountRatePerPeriod, p);
    }
    return sum;
  })();

  // Risk is modelled as occurring once, on average mid-horizon.
  const riskDiscount = discountFactor(
    model.discountRatePerPeriod,
    Math.max(1, model.horizonPeriods) / 2,
  );

  for (let t = 0; t < trials; t++) {
    let total = 0;
    for (const term of alt.terms) {
      switch (term.kind) {
        case 'build': {
          const h = sample(term.hours, rng);
          const r = sample(term.rate, rng);
          track(inputKey(alt.id, term.id, 'hours'))[t] = h;
          track(inputKey(alt.id, term.id, 'rate'))[t] = r;
          total += h * r;
          break;
        }
        case 'carry': {
          const h = sample(term.hoursPerPeriod, rng);
          const r = sample(term.rate, rng);
          track(inputKey(alt.id, term.id, 'hoursPerPeriod'))[t] = h;
          track(inputKey(alt.id, term.id, 'rate'))[t] = r;
          total += h * r * carryDiscount;
          break;
        }
        case 'risk': {
          const occurs = rng.next() < term.probability ? 1 : 0;
          const h = sample(term.impactHours, rng);
          const r = sample(term.rate, rng);
          track(inputKey(alt.id, term.id, 'occurs'))[t] = occurs;
          track(inputKey(alt.id, term.id, 'impactHours'))[t] = h;
          track(inputKey(alt.id, term.id, 'rate'))[t] = r;
          total += occurs * h * r * riskDiscount;
          break;
        }
      }
    }
    totals[t] = total;
  }

  let sum = 0;
  for (let i = 0; i < trials; i++) sum += totals[i]!;
  const mean = sum / trials;

  let ss = 0;
  for (let i = 0; i < trials; i++) {
    const d = totals[i]! - mean;
    ss += d * d;
  }
  const stdDev = Math.sqrt(ss / Math.max(1, trials - 1));

  const sorted = Float64Array.from(totals).sort();

  return {
    id: alt.id,
    label: alt.label,
    mean,
    stdDev,
    p10: quantile(sorted, 0.1),
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    samples: totals,
    inputs,
  };
};

/**
 * Run the forecast.
 *
 * The seed is part of the result, not part of the configuration, because the
 * question an auditor asks six months later is "what exactly did you run".
 */
export const simulate = (
  model: DecisionModel,
  options: SimulateOptions = {},
): Result<SimulationResult> => {
  const trials = options.trials ?? 10_000;
  const seed = options.seed ?? `${model.id}@${META.version}`;

  if (!Number.isInteger(trials) || trials < 1) {
    return fail('INVALID_TRIALS', `trials must be a positive integer, received ${trials}`, 'trials');
  }

  return flatMap(validate(model), (m) => {
    const rng = rngFrom(seed);
    const outcomes = m.alternatives.map((a) => simulateAlternative(a, m, trials, rng));

    const preferred = outcomes.reduce((best, o) => (o.mean < best.mean ? o : best));

    const winProbability = new Map<string, number>();
    for (const o of outcomes) {
      if (o.id === preferred.id) {
        winProbability.set(o.id, 1);
        continue;
      }
      let wins = 0;
      for (let i = 0; i < trials; i++) {
        if (preferred.samples[i]! < o.samples[i]!) wins++;
      }
      winProbability.set(o.id, wins / trials);
    }

    return ok({
      meta: META,
      modelId: m.id,
      seed,
      trials,
      outcomes,
      preferredId: preferred.id,
      winProbability,
    });
  });
};
