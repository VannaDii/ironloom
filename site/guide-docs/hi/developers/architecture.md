# आर्किटेक्चर

Ironloom typed process graph के माध्यम से work route करता है। Supervisor policy validate करता है, worker चुनता है, `.ironloom` के अंतर्गत immutable artifacts record करता है और originating control surface को outcomes report करता है।

Discord, GitHub और SonarCloud adapters edges पर रहते हैं। Business rules core crates, policy, process graph, workers और supervisor में रहते हैं।

## Runtime Boundaries

```mermaid
flowchart TB
  runtime[ironloom-runtime]
  runtime --> config[ironloom-config]
  runtime --> supervisor[ironloom-supervisor]
  runtime --> storage[ironloom-storage]
  supervisor --> policy[ironloom-policy]
  supervisor --> graph[ironloom-process-graph]
  supervisor --> workers[ironloom-workers]
  workers --> gates[ironloom-gates]
  workers --> github[ironloom-github]
  workers --> sonar[ironloom-sonarcloud]
  storage --> artifacts[(.ironloom state)]
  discord[ironloom-discord] --> runtime
  core[ironloom-core] --> config
  core --> policy
  core --> graph
  core --> workers
```

## Boundary Rules

- `ironloom-runtime` deployable service और composition boundary है।
- `ironloom-supervisor` process routing और worker registry dispatch decisions का मालिक है।
- `ironloom-discord` operator control-plane adapter है और handling से पहले signed Discord HTTP interactions verify करता है।
- `ironloom-github` supervisor decisions से पहले auditable API requests के माध्यम से GitHub source-of-truth state पढ़ता है।
- `ironloom-sonarcloud` SonarCloud bootstrap validation, quality gate polling और issue normalization का मालिक है।
- `ironloom-storage` direct `.ironloom/` filesystem access का मालिक है।

## First Vertical Slice

1. Signed Discord command interaction runtime HTTP port पर accept होता है।
2. Runtime Discord thread को exactly one persisted work item में resolve करता है और missing या ambiguous bindings पर fail closed करता है।
3. Supervisor process graph के माध्यम से gate worker चुनता है और worker registry के जरिए dispatch करता है।
4. Policy केवल thread-bound non-destructive gate action की अनुमति देती है।
5. Gate worker controlled environment, timeout और captured streams के साथ allow-listed command चलाता है, फिर structured result लौटाता है।
6. Storage `.ironloom` के अंतर्गत immutable artifact लिखता है और उसे thread तथा work item से index करता है।
7. Runtime originating interaction को Discord channel message response लौटाता है।
