/**
 * @file         model.ts
 * @project      dollar-hours
 * @author       John McSwain <john.i.mcswain@gmail.com>
 * @purpose      Force an architecture decision to be written down in a form that can
 *               be argued with. Most bad decisions are not wrong so much as unstated.
 * @description  The declarative decision model: alternatives composed of Build, Carry
 *               and Risk terms, plus total validation returning structured errors.
 * @version      0.3.0
 * @since        0.2.0
 * @license      MIT
 * @complexity   Level 3 (expert)
 *
 * @remarks
 * The three term kinds are not arbitrary. Build cost is what teams estimate; Carry
 * cost is what actually decides the outcome and is almost never estimated; Risk is
 * the tail everyone privately knows about and nobody writes down.
 */

import { type Distribution } from './distribution.js';
import { type ModelError, type Result, all, fail, flatMap, map, ok } from './result.js';

interface TermBase {
  readonly id: string;
  readonly label: string;
}

/** One-time implementation effort. */
export interface BuildTerm extends TermBase {
  readonly kind: 'build';
  readonly hours: Distribution;
  readonly rate: Distribution;
}

/** Recurring effort per period — maintenance, on-call, cognitive overhead. */
export interface CarryTerm extends TermBase {
  readonly kind: 'carry';
  readonly hoursPerPeriod: Distribution;
  readonly rate: Distribution;
}

/** A tail event: `probability` of incurring `impactHours` once within the horizon. */
export interface RiskTerm extends TermBase {
  readonly kind: 'risk';
  readonly probability: number;
  readonly impactHours: Distribution;
  readonly rate: Distribution;
}

export type Term = BuildTerm | CarryTerm | RiskTerm;

export interface Alternative {
  readonly id: string;
  readonly label: string;
  readonly terms: readonly Term[];
}

export interface DecisionModel {
  readonly id: string;
  readonly label: string;
  /** Number of periods over which carry cost accrues. */
  readonly horizonPeriods: number;
  /** Per-period discount rate applied to carry and risk. 0 disables discounting. */
  readonly discountRatePerPeriod: number;
  readonly alternatives: readonly Alternative[];
}

const validateTerm = (t: Term, path: string): Result<Term> => {
  if (!t.id) return fail('EMPTY_MODEL', 'term requires a non-empty id', path);
  if (t.kind === 'risk' && (t.probability < 0 || t.probability > 1)) {
    return fail(
      'INVALID_DISTRIBUTION',
      `risk probability must be within [0, 1], received ${t.probability}`,
      `${path}.probability`,
    );
  }
  return ok(t);
};

const validateAlternative = (a: Alternative, path: string): Result<Alternative> => {
  if (!a.id) return fail('EMPTY_MODEL', 'alternative requires a non-empty id', path);
  if (a.terms.length === 0) {
    return fail('EMPTY_MODEL', `alternative "${a.id}" has no terms`, `${path}.terms`);
  }
  const ids = new Set(a.terms.map((t) => t.id));
  if (ids.size !== a.terms.length) {
    return fail('EMPTY_MODEL', `alternative "${a.id}" has duplicate term ids`, `${path}.terms`);
  }
  return map(
    all(a.terms.map((t, i) => validateTerm(t, `${path}.terms[${i}]`))),
    () => a,
  );
};

/**
 * Validate a model before it is simulated. Returns the first structural problem
 * found, with a path into the model so the caller can point at it.
 */
export const validate = (m: DecisionModel): Result<DecisionModel, ModelError> => {
  if (m.alternatives.length === 0) {
    return fail('EMPTY_MODEL', 'a decision model needs at least one alternative', 'alternatives');
  }
  if (!Number.isInteger(m.horizonPeriods) || m.horizonPeriods < 0) {
    return fail(
      'NEGATIVE_QUANTITY',
      `horizonPeriods must be a non-negative integer, received ${m.horizonPeriods}`,
      'horizonPeriods',
    );
  }
  if (m.discountRatePerPeriod < 0) {
    return fail(
      'NEGATIVE_QUANTITY',
      `discountRatePerPeriod must be >= 0, received ${m.discountRatePerPeriod}`,
      'discountRatePerPeriod',
    );
  }
  const ids = new Set(m.alternatives.map((a) => a.id));
  if (ids.size !== m.alternatives.length) {
    return fail('EMPTY_MODEL', 'alternative ids must be unique', 'alternatives');
  }
  return flatMap(
    all(m.alternatives.map((a, i) => validateAlternative(a, `alternatives[${i}]`))),
    () => ok(m),
  );
};

/** Stable key identifying one sampled input inside a simulation. */
export const inputKey = (altId: string, termId: string, field: string): string =>
  `${altId}::${termId}::${field}`;
