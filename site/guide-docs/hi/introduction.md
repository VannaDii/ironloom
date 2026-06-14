# परिचय

Ironloom Veritas Labs का Rust supervisor runtime है, जो auditable engineering operations के लिए बनाया गया है।

यह direct Rust runtime के माध्यम से Discord operator actions, GitHub source-of-truth state, SonarCloud quality gates, worker execution, immutable artifacts और k3s deployment को coordinate करता है।

## सिस्टम फ्लो

```mermaid
flowchart LR
  operator[Discord ऑपरेटर] --> discord[ironloom-discord]
  discord --> runtime[ironloom-runtime]
  runtime --> supervisor[ironloom-supervisor]
  supervisor --> policy[ironloom-policy]
  supervisor --> graph[ironloom-process-graph]
  graph --> workers[ironloom-workers]
  workers --> github[GitHub source of truth]
  workers --> sonar[SonarCloud gates]
  workers --> storage[ironloom-storage]
  storage --> artifacts[(.ironloom artifacts)]
  supervisor --> discord
  runtime --> k3s[k3s deployment]
```

## प्लेटफ़ॉर्म का आकार

- Discord प्राथमिक operator interface है।
- GitHub repository, pull-request, check और merge state के लिए source of truth बना रहता है।
- SonarCloud quality और compliance gate बना रहता है।
- Kubernetes delivery Ironloom Helm chart के माध्यम से k3s को target करती है।
- Runtime state `.ironloom` के अंतर्गत auditable artifacts और indexes के साथ store होती है।

## दस्तावेज मानचित्र

- [मार्गदर्शिकाएं](/hi/guides/getting-started) setup, deployment और operator workflows कवर करती हैं।
- [डेवलपर दस्तावेज](/hi/developers/architecture) crate boundaries और validation gates समझाते हैं।
- [API दस्तावेज](/hi/api/) configuration, HTTP routes, storage, schemas और crates का reference देते हैं।
- [LLM output](/llms.txt) site content को model-readable form में expose करता है।

Operator controls Discord, GitHub और runtime control plane में रहते हैं। यह static site runtime credentials नहीं रखती और lifecycle actions execute नहीं करती।
