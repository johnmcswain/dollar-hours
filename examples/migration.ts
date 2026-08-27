/**
 * @file        examples/migration.ts
 * @project     dollar-hours
 * @author      John McSwain <john.i.mcswain@gmail.com>
 * @purpose     Show the whole library in twenty lines against a decision an engineer
 *              has actually had to make.
 * @version     0.3.0
 * @license     MIT
 *
 * Run with: npm run example
 */

import { forecast } from '../src/index.js';
import { lognormal, pert, uniform } from '../src/distribution.js';
import { type DecisionModel } from '../src/model.js';
import { expect as unwrap } from '../src/result.js';

const rate = unwrap(uniform(150, 210));

const model: DecisionModel = {
  id: 'adr-014',
  label: 'ADR-014 — real-time availability',
  horizonPeriods: 36,
  discountRatePerPeriod: 0.008,
  alternatives: [
    {
      id: 'extend-monolith',
      label: 'Extend the existing scheduler',
      terms: [
        { kind: 'build', id: 'impl', label: 'Implementation inside the monolith', hours: unwrap(pert(280, 420, 900)), rate },
        { kind: 'carry', id: 'toil', label: 'Monthly toil: contention, cache invalidation, on-call', hoursPerPeriod: unwrap(pert(14, 26, 70)), rate },
        { kind: 'risk', id: 'rewrite', label: 'Forced extraction later, under load', probability: 0.35, impactHours: unwrap(lognormal(900, 0.55)), rate },
      ],
    },
    {
      id: 'extract-service',
      label: 'Extract an event-driven availability service',
      terms: [
        { kind: 'build', id: 'impl', label: 'Service, projections, and cutover', hours: unwrap(pert(620, 880, 1_600)), rate },
        { kind: 'carry', id: 'toil', label: 'Monthly toil: one more deployable', hoursPerPeriod: unwrap(pert(6, 11, 24)), rate },
        { kind: 'risk', id: 'consistency', label: 'Eventual-consistency defect reaching customers', probability: 0.2, impactHours: unwrap(lognormal(300, 0.5)), rate },
      ],
    },
  ],
};

const result = forecast(model, { trials: 50_000, seed: 'adr-014/2026-08' });

if (!result.ok) {
  console.error('model rejected:', result.error);
  process.exit(1);
}

console.log(result.value.report);
console.log('\nWhat is worth investigating next:\n');

for (const s of result.value.sensitivities) {
  console.log(`  ${s.alternativeId}`);
  for (const input of s.inputs.slice(0, 3)) {
    const share = (input.varianceShare * 100).toFixed(0).padStart(3);
    const swing = Math.round(input.swingDollarHours).toLocaleString('en-US');
    console.log(`    ${share}% of variance  ${input.termId}.${input.field}  (swing $${swing})`);
  }
  console.log();
}
