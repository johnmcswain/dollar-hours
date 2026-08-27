/**
 * @file        test/fixtures.ts
 * @project     dollar-hours
 * @author      John McSwain <john.i.mcswain@gmail.com>
 * @purpose     One realistic decision model, shared by the behavioural tests, so the
 *              assertions are about a decision an engineer would recognise.
 * @version     0.3.0
 * @license     MIT
 */

import { lognormal, pert, point, uniform } from '../src/distribution.js';
import { type DecisionModel } from '../src/model.js';
import { expect as unwrap } from '../src/result.js';

const blendedRate = unwrap(uniform(150, 210));

/**
 * ADR-014 — real-time availability for an appointment platform.
 *
 * Extend the existing monolithic scheduler, or extract availability into an
 * event-driven service. The build estimates are close. They are not the decision.
 */
export const adr014: DecisionModel = {
  id: 'adr-014',
  label: 'ADR-014 — real-time availability',
  horizonPeriods: 36,
  discountRatePerPeriod: 0.008,
  alternatives: [
    {
      id: 'extend-monolith',
      label: 'Extend the existing scheduler',
      terms: [
        {
          kind: 'build',
          id: 'impl',
          label: 'Implementation inside the monolith',
          hours: unwrap(pert(280, 420, 900)),
          rate: blendedRate,
        },
        {
          kind: 'carry',
          id: 'toil',
          label: 'Monthly toil: contention bugs, cache invalidation, on-call',
          hoursPerPeriod: unwrap(pert(14, 26, 70)),
          rate: blendedRate,
        },
        {
          kind: 'risk',
          id: 'rewrite',
          label: 'Forced extraction later, under load',
          probability: 0.35,
          impactHours: unwrap(lognormal(900, 0.55)),
          rate: blendedRate,
        },
      ],
    },
    {
      id: 'extract-service',
      label: 'Extract an event-driven availability service',
      terms: [
        {
          kind: 'build',
          id: 'impl',
          label: 'Service, projections, and cutover',
          hours: unwrap(pert(620, 880, 1_600)),
          rate: blendedRate,
        },
        {
          kind: 'carry',
          id: 'toil',
          label: 'Monthly toil: one more deployable, one more dashboard',
          hoursPerPeriod: unwrap(pert(6, 11, 24)),
          rate: blendedRate,
        },
        {
          kind: 'risk',
          id: 'consistency',
          label: 'Eventual-consistency defect reaching customers',
          probability: 0.2,
          impactHours: unwrap(lognormal(300, 0.5)),
          rate: blendedRate,
        },
      ],
    },
  ],
};

/** A minimal, fully deterministic model — every input is a point estimate. */
export const deterministic: DecisionModel = {
  id: 'deterministic',
  label: 'Deterministic control',
  horizonPeriods: 0,
  discountRatePerPeriod: 0,
  alternatives: [
    {
      id: 'only',
      label: 'The only option',
      terms: [
        {
          kind: 'build',
          id: 'impl',
          label: 'Fixed build',
          hours: unwrap(point(100)),
          rate: unwrap(point(200)),
        },
      ],
    },
  ],
};
