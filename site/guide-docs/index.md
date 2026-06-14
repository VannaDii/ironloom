---
layout: home
title: Ironloom
titleTemplate: false
hero:
  name: Ironloom
  text: Auditable engineering operations.
  tagline: A Rust supervisor runtime for Discord-operated work, GitHub source-of-truth state, SonarCloud gates, immutable artifacts, and k3s deployment.
  image:
    src: /ironloom-mark.svg
    alt: Ironloom mark
  actions:
    - theme: brand
      text: Start setup
      link: /guides/getting-started
    - theme: alt
      text: Read API docs
      link: /api/
---

<div class="ironloom-home">
  <section class="ironloom-section">
    <div>
      <h2>Operate from one thread-bound control plane.</h2>
    </div>
    <div>
      <p>Ironloom keeps operator intent, source-of-truth repository state, quality gates, worker dispatch, and immutable artifacts inside one auditable runtime boundary.</p>
      <div class="ironloom-list">
        <a href="/guides/operator-workflows">Operator workflows</a>
        <a href="/developers/architecture">Runtime architecture</a>
      </div>
    </div>
  </section>

  <section class="ironloom-section">
    <div>
      <h2>Deploy with explicit setup gates.</h2>
    </div>
    <div>
      <p>Environment variables bind secrets in Docker and Kubernetes. Missing runtime values block readiness and expose a first-run setup page on the same HTTP port.</p>
      <div class="ironloom-list">
        <a href="/guides/setup">Initial setup</a>
        <a href="/guides/deployment">k3s deployment</a>
      </div>
    </div>
  </section>

  <section class="ironloom-section">
    <div>
      <h2>Documented for humans and language models.</h2>
    </div>
    <div>
      <p>The site ships guides, developer documentation, API reference pages, sitemap metadata, JSON-LD structured data, and LLM-readable outputs.</p>
      <div class="ironloom-list">
        <a href="/developers/contributing">Developer docs</a>
        <a href="/llms.txt">LLM index</a>
      </div>
    </div>
  </section>
</div>
