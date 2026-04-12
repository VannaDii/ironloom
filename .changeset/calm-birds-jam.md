---
---

Fix Helm chart publication by publishing the chart README and richer Artifact
Hub metadata with every release, rendering the tracked `artifacthub-repo.yml`
template safely outside the chart payload, and trimming unnecessary runtime
packages from the OpenClaw image so the published security report is reduced.
