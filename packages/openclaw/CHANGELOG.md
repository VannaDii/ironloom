# @vannadii/devplat-openclaw

## 0.1.0

### Minor Changes

- [#14](https://github.com/VannaDii/devplat/pull/14) [`4288cff`](https://github.com/VannaDii/devplat/commit/4288cff50dded6c2e97a9de6ec77b6c9102ad7e4) Thanks [@VannaDii](https://github.com/VannaDii)! - Align the Discord control-plane contracts with explicit v10 runtime
  configuration and thread-scoped operator behavior.

  This change adds Discord v10 connection and install settings to the runtime and
  OpenClaw plugin configuration, expands Discord thread and control contracts to
  stay fully thread-aware, and updates the generated schemas, manifest, and guide
  documentation to match the current operator workflow and CI expectations.

- [#12](https://github.com/VannaDii/devplat/pull/12) [`da1e426`](https://github.com/VannaDii/devplat/commit/da1e4269cdfa9cf2f18eaf39e93f5d721ccd46a0) Thanks [@VannaDii](https://github.com/VannaDii)! - Expand the operator and adapter surface for thread-aware platform control.

  This change adds explicit spec revision updates, worktree sync and release flows,
  pull request merge submission semantics, broader Discord operator actions, and
  matching OpenClaw tools and schemas. It also tightens pre-commit and Sonar CI
  enforcement and updates the platform and guide documentation to describe the
  current baseline, remaining completion gap, and release workflow.

### Patch Changes

- Updated dependencies [[`4288cff`](https://github.com/VannaDii/devplat/commit/4288cff50dded6c2e97a9de6ec77b6c9102ad7e4), [`da1e426`](https://github.com/VannaDii/devplat/commit/da1e4269cdfa9cf2f18eaf39e93f5d721ccd46a0)]:
  - @vannadii/devplat-config@0.1.0
  - @vannadii/devplat-discord@0.1.0
  - @vannadii/devplat-prs@0.1.0
  - @vannadii/devplat-specs@0.1.0
  - @vannadii/devplat-worktrees@0.1.0
  - @vannadii/devplat-branching@0.0.1
  - @vannadii/devplat-supervisor@0.0.1
  - @vannadii/devplat-slicing@0.0.1
