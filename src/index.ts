/**
 * @file         index.ts
 * @project      dollar-hours
 * @author       John McSwain <john.i.mcswain@gmail.com>
 * @purpose      Public surface of the library — small on purpose.
 * @description  Re-exports plus `forecast`, the one call that runs the whole pipeline:
 *               validate → simulate → attribute → explain.
 * @version      0.3.0
 * @since        0.1.0
 * @license      MIT
 * @complexity   Level 3 (expert)
 */

export * from './meta.js';
export * from './result.js';
export * from './units.js';
export * from './distribution.js';
export * from './model.js';
export * from './simulate.js';
export * from './sensitivity.js';
export * from './explain.js';

import { type Explanation, explain, summarise } from './explain.js';
import { type DecisionModel } from './model.js';
import { type Result, map } from './result.js';
import { type SensitivityReport, sensitivity } from './sensitivity.js';
import { type SimulateOptions, type SimulationResult, simulate } from './simulate.js';

export interface Forecast {
  readonly simulation: SimulationResult;
  readonly explanations: readonly Explanation[];
  readonly sensitivities: readonly SensitivityReport[];
  /** Plain-text decision record. */
  readonly report: string;
}

/**
 * Run the full pipeline.
 *
 * @example
 * const out = forecast(model, { trials: 20_000, seed: 'adr-014' });
 * if (out.ok) console.log(out.value.report);
 */
export const forecast = (
  model: DecisionModel,
  options: SimulateOptions = {},
): Result<Forecast> =>
  map(simulate(model, options), (simulation) => ({
    simulation,
    explanations: explain(model),
    sensitivities: simulation.outcomes.map(sensitivity),
    report: summarise(model, simulation),
  }));
