# dollar-hours

**Explainable ROI forecasting for architecture selection, denominated in Dollar-Hours ($h).**

| | |
|---|---|
| **Author** | John McSwain &lt;john.i.mcswain@gmail.com&gt; |
| **Version** | 0.3.0 |
| **Language** | TypeScript 5+ / Node 20+ |
| **Complexity** | **Level 3 — expert** |
| **License** | MIT |
| **Research lineage** | ArchROI — *Explainable ROI Forecasting for Architecture Selection in Data-Platform Migrations*. Doctoral research, Systems Engineering. |
| **Dependencies** | None at runtime. `vitest` and `fast-check` for tests. |

---

## The idea

Teams estimate what an architecture will cost to **build**. They almost never estimate what it will cost to **carry**, and they never write down the **risk** everyone privately knows about. So the build estimate — the least decision-relevant of the three — becomes the whole conversation.

A **Dollar-Hour ($h)** is one engineer-hour valued at a blended, fully loaded rate. It is deliberately not just "money": carrying the hour provenance is what lets the library say *this decision is expensive because of recurring toil* rather than only *this decision is expensive*.

The library takes a decision written as competing alternatives, each decomposed into Build / Carry / Risk terms with **distributions instead of point estimates**, and returns three things:

1. **A distribution of outcomes** per alternative, not a number.
2. **A decomposition** — which term drives the expected cost, computed analytically so it does not wobble between runs.
3. **A variance attribution** — of everything you guessed at, which guess actually matters, and therefore where the next hour of investigation should go.

## Worked example

```bash
npm install && npm run example
```

```
ADR-014 — real-time availability — 50,000 trials, seed "adr-014/2026-08"

  Extend the existing scheduler: mean $317,435  p10 $197,752  p50 $292,849  p90 $470,031
    preferred option beats this one in 68% of trials
→ Extract an event-driven availability service: mean $251,999  p10 $194,771  p50 $246,946  p90 $315,477

Extend the existing scheduler costs $318,757 in expected Dollar-Hours over the horizon.
The largest single contributor is "Monthly toil: contention, cache invalidation, on-call"
at $175,812 (55%). Carry dominates at 55% of the total — this is a decision about what the
team lives with, not what it builds.

What is worth investigating next:

  extend-monolith
     53% of variance  rewrite.occurs        (swing $159,498)
     36% of variance  toil.hoursPerPeriod   (swing $184,068)
      5% of variance  impl.hours            (swing  $66,947)
```

Note what the output refuses to do. It does not declare a winner and stop. It says the preferred option wins **68% of trials** — a real preference, but not a rout — and then tells you that over half the uncertainty comes from a single binary you have not investigated. That is the whole argument of the library in one screen.

## Usage

```ts
import { forecast, pert, lognormal, uniform, expect } from 'dollar-hours';

const rate = expect(uniform(150, 210));

const result = forecast({
  id: 'adr-014',
  label: 'Real-time availability',
  horizonPeriods: 36,
  discountRatePerPeriod: 0.008,
  alternatives: [{
    id: 'extend-monolith',
    label: 'Extend the existing scheduler',
    terms: [
      { kind: 'build', id: 'impl',  label: 'Implementation', hours: expect(pert(280, 420, 900)), rate },
      { kind: 'carry', id: 'toil',  label: 'Monthly toil',   hoursPerPeriod: expect(pert(14, 26, 70)), rate },
      { kind: 'risk',  id: 'rewrite', label: 'Forced extraction later',
        probability: 0.35, impactHours: expect(lognormal(900, 0.55)), rate },
    ],
  }],
}, { trials: 50_000, seed: 'adr-014/2026-08' });

if (result.ok) console.log(result.value.report);
```

## Design decisions worth defending

**Branded unit types.** `Hours`, `Usd`, `Rate` and `DollarHours` are nominal types over `number`. Adding hours to dollars is a compile error, not a spreadsheet review finding. The cost is a smart constructor at every boundary; the benefit is that the single most common class of cost-modelling bug cannot be written.

**`Result<T, E>` rather than exceptions.** A forecasting library that throws is a forecasting library that cannot be composed. Every failure is a value with a `code` and a `path` into the offending field.

**Seeded, reproducible randomness.** `sfc32` seeded from a string, never `Math.random`. The seed is returned as part of the result rather than accepted as configuration, because the question an auditor asks six months later is *what exactly did you run*. Same seed, same model, bit-for-bit identical output — asserted in the test suite.

**Beta-PERT for effort.** It is the distribution estimators actually reason in — optimistic, likely, pessimistic, with adjustable confidence in the mode. Lognormal is reserved for tail impacts, where the honest shape has no upper bound.

**Rank correlation, not Pearson.** Effort distributions are right-skewed by construction; a handful of tail trials would otherwise dominate the attribution. This is an approximation and not a Sobol index, which is why `method` is reported alongside the numbers.

**Analytic means for explanation, sampled quantiles for spread.** The decomposition should not change between runs. The simulation tells you the spread; the explainer tells you the shape.

## Layout

```
src/
  meta.ts          provenance stamped onto every result
  result.ts        Result<T, E> and structured ModelError
  units.ts         branded Hours / Usd / Rate / DollarHours, discounting
  distribution.ts  sfc32 RNG; point, uniform, triangular, beta-PERT, lognormal
  model.ts         the declarative decision model and its validation
  simulate.ts      Monte Carlo engine, retains inputs for attribution
  sensitivity.ts   Spearman variance attribution + decile swing
  explain.ts       additive decomposition and plain-text decision record
  index.ts         forecast(): validate → simulate → attribute → explain
test/              51 tests, including property tests over the unit algebra
examples/
```

## Scripts

```bash
npm run typecheck   # tsc --noEmit, strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
npm test            # 51 tests
npm run example     # the ADR-014 walkthrough above
```

## Status

Research code, tested and typechecked, not yet load-bearing for anything. Version 0.3.0. See `CHANGELOG.md`.
