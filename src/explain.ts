/**
 * @file         explain.ts
 * @project      dollar-hours
 * @author       John McSwain <john.i.mcswain@gmail.com>
 * @purpose      A forecast nobody can interrogate is not evidence, it is decoration.
 *               This module exists so the number can be taken apart in a meeting.
 * @description  Additive decomposition of expected Dollar-Hours into Build, Carry and
 *               Risk contributions, computed from analytic means so the explanation is
 *               stable across seeds, plus a plain-language rendering.
 * @version      0.3.0
 * @since        0.3.0
 * @license      MIT
 * @complexity   Level 3 (expert)
 */

import { meanOf } from './distribution.js';
import { type Alternative, type DecisionModel, type Term } from './model.js';
import { type SimulationResult } from './simulate.js';
import { discountFactor } from './units.js';

export interface TermContribution {
  readonly termId: string;
  readonly label: string;
  readonly kind: Term['kind'];
  /** Expected Dollar-Hours attributable to this term, discounted. */
  readonly expectedDollarHours: number;
  /** Share of the alternative's expected total, in [0, 1]. */
  readonly share: number;
}

export interface Explanation {
  readonly alternativeId: string;
  readonly label: string;
  readonly expectedTotal: number;
  /** Sorted by contribution, descending. */
  readonly contributions: readonly TermContribution[];
  /** Expected Dollar-Hours grouped by term kind. */
  readonly byKind: Readonly<Record<Term['kind'], number>>;
  readonly narrative: string;
}

const carryMultiplier = (m: DecisionModel): number => {
  let sum = 0;
  for (let p = 1; p <= m.horizonPeriods; p++) {
    sum += discountFactor(m.discountRatePerPeriod, p);
  }
  return sum;
};

const expectedTermCost = (t: Term, m: DecisionModel): number => {
  switch (t.kind) {
    case 'build':
      return meanOf(t.hours) * meanOf(t.rate);
    case 'carry':
      return meanOf(t.hoursPerPeriod) * meanOf(t.rate) * carryMultiplier(m);
    case 'risk':
      return (
        t.probability *
        meanOf(t.impactHours) *
        meanOf(t.rate) *
        discountFactor(m.discountRatePerPeriod, Math.max(1, m.horizonPeriods) / 2)
      );
  }
};

const money = (n: number): string =>
  `$${Math.round(n).toLocaleString('en-US')}`;

const pct = (n: number): string => `${(n * 100).toFixed(0)}%`;

/**
 * Decompose one alternative's expected cost.
 *
 * Uses analytic means rather than sample means so that the explanation does not
 * wobble between runs. The simulation tells you the spread; this tells you the shape.
 */
export const explainAlternative = (
  alt: Alternative,
  model: DecisionModel,
): Explanation => {
  const rows = alt.terms.map((t) => ({
    termId: t.id,
    label: t.label,
    kind: t.kind,
    expectedDollarHours: expectedTermCost(t, model),
  }));

  const expectedTotal = rows.reduce((s, r) => s + r.expectedDollarHours, 0);

  const contributions: TermContribution[] = rows
    .map((r) => ({
      ...r,
      share: expectedTotal === 0 ? 0 : r.expectedDollarHours / expectedTotal,
    }))
    .sort((a, b) => b.expectedDollarHours - a.expectedDollarHours);

  const byKind = contributions.reduce(
    (acc, c) => ({ ...acc, [c.kind]: acc[c.kind] + c.expectedDollarHours }),
    { build: 0, carry: 0, risk: 0 } as Record<Term['kind'], number>,
  );

  const top = contributions[0];
  const carryShare = expectedTotal === 0 ? 0 : byKind.carry / expectedTotal;

  const narrative = [
    `${alt.label} costs ${money(expectedTotal)} in expected Dollar-Hours over the horizon.`,
    top
      ? `The largest single contributor is "${top.label}" at ${money(top.expectedDollarHours)} (${pct(top.share)}).`
      : '',
    carryShare >= 0.5
      ? `Carry dominates at ${pct(carryShare)} of the total — this is a decision about what the team lives with, not what it builds.`
      : `Build dominates at ${pct(expectedTotal === 0 ? 0 : byKind.build / expectedTotal)} of the total — the cost is mostly incurred once, up front.`,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    alternativeId: alt.id,
    label: alt.label,
    expectedTotal,
    contributions,
    byKind,
    narrative,
  };
};

/** Explain every alternative, in the order they appear in the model. */
export const explain = (
  model: DecisionModel,
): readonly Explanation[] => model.alternatives.map((a) => explainAlternative(a, model));

/**
 * A short report suitable for pasting into a decision record. Deliberately plain
 * text: an architecture decision that only survives inside a dashboard has not
 * actually been communicated.
 */
export const summarise = (model: DecisionModel, result: SimulationResult): string => {
  const lines: string[] = [
    `${model.label} — ${result.trials.toLocaleString('en-US')} trials, seed "${result.seed}"`,
    `Method: ${result.meta.method}`,
    '',
  ];

  for (const o of result.outcomes) {
    const win = result.winProbability.get(o.id) ?? 0;
    const marker = o.id === result.preferredId ? '→' : ' ';
    lines.push(
      `${marker} ${o.label}: mean ${money(o.mean)}  p10 ${money(o.p10)}  p50 ${money(o.p50)}  p90 ${money(o.p90)}`,
    );
    if (o.id !== result.preferredId) {
      lines.push(`    preferred option beats this one in ${pct(win)} of trials`);
    }
  }

  lines.push('');
  for (const e of explain(model)) {
    lines.push(e.narrative);
  }

  const rival = result.outcomes.find((o) => o.id !== result.preferredId);
  if (rival) {
    const win = result.winProbability.get(rival.id) ?? 0;
    if (win < 0.65) {
      lines.push(
        '',
        `Caution: the preferred alternative wins only ${pct(win)} of trials. The model does not separate these options; choose on grounds it does not capture.`,
      );
    }
  }

  return lines.join('\n');
};
