# Testing Instructions

## Unit Shape

- Every non-trivial unit needs sibling tests.
- Test pure logic directly, step by step, and before higher-level orchestration paths.
- Test services for orchestration, delegation, policy checks, persistence boundaries, side-effect boundaries, and release-surface coordination where relevant.
- Use structured `const cases = [...]` tables. Each case must declare `inputs`, a `mock` setup function, and an `assert` function, then run through a single `it.each(cases)('$name', ...)` implementation per suite.
- The table variable must be named `cases`; alternate table names in `it.each(<name>)` calls are not allowed.
- Treat regular expressions as independently testable contracts. Every named pattern needs matching and non-matching cases that prove the expected edge behavior.

## Failure Clarity

- A test suite is insufficient if it only proves top-level success and hides which internal step failed.
- Prefer narrow tests that make the source of failure obvious and broader tests that show operational impact.
- Do not trade away branch coverage or per-file coverage to avoid writing meaningful cases.

## Complete Change Standard

- Add or update tests when lifecycle, policy, operator, performance, or release behavior changes.
- Keep repo checks for instruction drift and policy boundaries covered with unit tests.
- Run `npm run check:changed-coverage` before completing executable source changes.
