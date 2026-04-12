---
---

Fix the Helm Artifact Hub metadata publish step by rendering a repository-owned
`artifacthub-repo.yml` file inside the workspace before the ORAS upload.

This change adds a tracked Artifact Hub metadata template and fills in the
repository ID during the workflow so ORAS can keep its normal path validation
enabled while publishing the metadata artifact after a successful chart push.
