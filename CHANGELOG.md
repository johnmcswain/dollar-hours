# Changelog

All notable changes to `dollar-hours`.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Author:** John McSwain &lt;john.i.mcswain@gmail.com&gt;

---

## [0.3.0] — 2026-08-27

### Added
- `sensitivity.ts` — post-hoc variance attribution over retained simulation samples, using Spearman rank correlation plus a decile-conditioned swing estimate in Dollar-Hours.
- `explain.ts` — additive Build / Carry / Risk decomposition computed from analytic means, plus `summarise()` producing a plain-text decision record.
- `forecast()` — single entry point running validate → simulate → attribute → explain.
- `summarise()` now emits an explicit caution when the preferred alternative wins fewer than 65% of trials, rather than presenting a coin flip as a decision.
- Property tests over the unit algebra (`fast-check`): commutativity, associativity, and discount-factor monotonicity.

### Changed
- Simulation now retains every sampled input, so variance can be attributed without a second run.
- `ModelError.path` widened to `string | undefined` for compatibility with `exactOptionalPropertyTypes`.

### Fixed
- A constant input (point estimate) now reports zero influence rather than `NaN` from a zero-variance correlation denominator.

## [0.2.0] — 2026-08-20

### Added
- `model.ts` — the declarative decision model: alternatives composed of Build, Carry and Risk terms, with structured validation returning a path into the offending field.
- `simulate.ts` — seeded Monte Carlo engine with per-period discounting of carry cost and mid-horizon discounting of risk.
- Pairwise win probabilities between alternatives.

### Changed
- Distributions moved behind validated smart constructors returning `Result`.

## [0.1.0] — 2026-08-12

### Added
- Branded unit types: `Hours`, `Usd`, `Rate`, `DollarHours`, with validated constructors and dimensionally legal arithmetic.
- `Result<T, E>` with `map` / `flatMap` / `all`.
- `sfc32` seeded RNG; point, uniform, triangular, beta-PERT and lognormal samplers with analytic means.

[0.3.0]: https://github.com/johnmcswain/dollar-hours/releases/tag/v0.3.0
[0.2.0]: https://github.com/johnmcswain/dollar-hours/releases/tag/v0.2.0
[0.1.0]: https://github.com/johnmcswain/dollar-hours/releases/tag/v0.1.0
