/**
 * @file         meta.ts
 * @project      dollar-hours
 * @author       John McSwain <john.i.mcswain@gmail.com>
 * @purpose      Machine-readable provenance for the library, so any forecast it
 *               produces can be traced back to the exact version and method that
 *               produced it. Auditability begins with knowing what ran.
 * @description  Frozen metadata record embedded in every simulation result.
 * @version      0.3.0
 * @since        0.1.0
 * @license      MIT
 * @complexity   Level 3 (expert)
 */

/** Immutable provenance record stamped onto every {@link SimulationResult}. */
export interface ProjectMeta {
  readonly name: string;
  readonly version: string;
  readonly author: string;
  readonly purpose: string;
  readonly researchLineage: string;
  readonly method: string;
  readonly license: string;
}

export const META: ProjectMeta = Object.freeze({
  name: 'dollar-hours',
  version: '0.3.0',
  author: 'John McSwain <john.i.mcswain@gmail.com>',
  purpose:
    'Forecast and explain the cost of an architectural decision in Dollar-Hours ($h), ' +
    'the engineer-hour valued at a blended loaded rate, so that alternatives can be ' +
    'compared before anyone commits to one.',
  researchLineage:
    'ArchROI — Explainable ROI Forecasting for Architecture Selection in Data-Platform ' +
    'Migrations. Doctoral research, Systems Engineering.',
  method:
    'Seeded Monte Carlo over beta-PERT / lognormal input distributions, with rank-correlation ' +
    'variance attribution and additive term decomposition for explainability.',
  license: 'MIT',
});
