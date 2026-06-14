---
layout: home
title: Ironloom
titleTemplate: false
hero:
  name: Ironloom
  text: 可审计的工程运营。
  tagline: 一个 Rust 监督运行时，用于 Discord 驱动的工作、GitHub 事实源状态、SonarCloud 关卡、不可变工件和 k3s 部署。
  image:
    src: /ironloom-mark.svg
    alt: Ironloom 标志
  actions:
    - theme: brand
      text: 开始设置
      link: /zh-hans/guides/getting-started
    - theme: alt
      text: 阅读 API 文档
      link: /zh-hans/api/
---

<div class="ironloom-home">
  <section class="ironloom-section">
    <div>
      <h2>从一个绑定线程的控制平面运行。</h2>
    </div>
    <div>
      <p>Ironloom 将操作员意图、事实源仓库状态、质量关卡、工作器调度和不可变工件保持在同一个可审计的运行时边界内。</p>
      <div class="ironloom-list">
        <a href="/zh-hans/guides/operator-workflows">操作员工作流</a>
        <a href="/zh-hans/developers/architecture">运行时架构</a>
      </div>
    </div>
  </section>

  <section class="ironloom-section">
    <div>
      <h2>使用明确的设置关卡部署。</h2>
    </div>
    <div>
      <p>环境变量在 Docker 和 Kubernetes 中绑定密钥。缺少运行时值会阻止就绪状态，并在同一个 HTTP 端口暴露首次运行设置页面。</p>
      <div class="ironloom-list">
        <a href="/zh-hans/guides/setup">初始设置</a>
        <a href="/zh-hans/guides/deployment">k3s 部署</a>
      </div>
    </div>
  </section>

  <section class="ironloom-section">
    <div>
      <h2>同时面向人类和语言模型的文档。</h2>
    </div>
    <div>
      <p>该站点提供指南、开发者文档、API 参考页面、站点地图元数据、JSON-LD 结构化数据，以及适合 LLM 读取的输出。</p>
      <div class="ironloom-list">
        <a href="/zh-hans/developers/contributing">开发者文档</a>
        <a href="/llms.txt">LLM 索引</a>
      </div>
    </div>
  </section>
</div>
