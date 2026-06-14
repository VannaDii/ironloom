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
- `ironloom-supervisor` process routing और worker dispatch decisions का मालिक है।
- `ironloom-discord` operator control-plane adapter है।
- `ironloom-github` auditable requests के माध्यम से GitHub source-of-truth state पढ़ता और लिखता है।
- `ironloom-sonarcloud` SonarCloud quality और compliance normalization का मालिक है।
- `ironloom-storage` direct `.ironloom/` filesystem access का मालिक है।

## First Vertical Slice

1. Fake Discord command exactly one thread और work item से bound होता है।
2. Discord adapter missing या ambiguous bindings पर fail closed करता है।
3. Supervisor process graph के माध्यम से gate worker चुनता है।
4. Policy केवल thread-bound non-destructive gate action की अनुमति देती है।
5. Gate worker structured result लौटाता है।
6. Storage `.ironloom` के अंतर्गत immutable artifact लिखता है और उसे thread तथा work item से index करता है।
7. Fake Discord transport originating thread को reply करता है।
