# SonarCloud Integration

CI runs Vitest coverage with LCOV output at `coverage/lcov.info` and waits for the SonarCloud quality gate. Sonar analysis must never be conditionally skipped; missing or misconfigured `SONAR_TOKEN` must fail the scan path.

## Scope

- Sources: `packages`
- Tests: `packages/*/src/**/*.test.ts`
- `sonar.exclusions`: `packages/*/dist/**`, `coverage/**`, `.devplat/**`, `packages/*/schemas/*.schema.json`, `site/**`, `deploy/**`, `docker/**`
- `sonar.coverage.exclusions`: `packages/*/src/**/*.test.ts`

## Operator Notes

- Keep `SONAR_TOKEN` configured in GitHub Actions
- Use `npm run verify:sonar-bootstrap` for bootstrap validation
- Use `npm run check:changed-coverage` before completing executable source changes so changed files do not arrive at Sonar uncovered
- Quality gate failures should stop the primary CI lane

## Related Guides

- [Live Test Lab](./live-test-lab.md)
- [Live Test Sonar Setup](./live-test-sonar-setup.md)
