# Operator Guide

Lifecycle-changing Discord actions must be bound to exactly one persisted work item and thread. Missing or ambiguous thread context fails closed before any worker runs.

GitHub state should be refreshed before pull request, branch, check, review, or merge decisions. Cached state can support display and indexing, but it is not the source of truth.
