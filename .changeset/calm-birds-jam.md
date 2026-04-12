---
---

Fix the Helm Artifact Hub metadata publish step so ORAS accepts the generated
repository metadata file path during workflow execution.

This change adds the explicit ORAS path-validation override required for the
workflow's temporary `artifacthub-repo.yml` file, preventing the Helm publish
job from failing after a successful chart push.
