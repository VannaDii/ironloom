---
layout: home
title: Ironloom
titleTemplate: false
hero:
  name: Ironloom
  text: ऑडिट योग्य इंजीनियरिंग ऑपरेशन।
  tagline: Discord से संचालित काम, GitHub source-of-truth स्थिति, SonarCloud गेट, अपरिवर्तनीय artifacts और k3s deployment के लिए Rust supervisor runtime.
  image:
    src: /ironloom-mark.svg
    alt: Ironloom चिह्न
  actions:
    - theme: brand
      text: सेटअप शुरू करें
      link: /hi/guides/getting-started
    - theme: alt
      text: API दस्तावेज पढ़ें
      link: /hi/api/
---

<div class="ironloom-home">
  <section class="ironloom-section">
    <div>
      <h2>एक thread-bound control plane से संचालन करें।</h2>
    </div>
    <div>
      <p>Ironloom operator intent, source-of-truth repository state, quality gates, worker dispatch और immutable artifacts को एक ही auditable runtime boundary में रखता है।</p>
      <div class="ironloom-list">
        <a href="/hi/guides/operator-workflows">ऑपरेटर वर्कफ्लो</a>
        <a href="/hi/developers/architecture">रनटाइम आर्किटेक्चर</a>
      </div>
    </div>
  </section>

  <section class="ironloom-section">
    <div>
      <h2>स्पष्ट setup gates के साथ deploy करें।</h2>
    </div>
    <div>
      <p>Environment variables Docker और Kubernetes में secrets bind करते हैं। Missing runtime values readiness रोकती हैं और उसी HTTP port पर first-run setup page दिखाती हैं।</p>
      <div class="ironloom-list">
        <a href="/hi/guides/setup">आरंभिक सेटअप</a>
        <a href="/hi/guides/deployment">k3s deployment</a>
      </div>
    </div>
  </section>

  <section class="ironloom-section">
    <div>
      <h2>मनुष्यों और language models दोनों के लिए दस्तावेज।</h2>
    </div>
    <div>
      <p>यह साइट guides, developer documentation, API reference pages, sitemap metadata, JSON-LD structured data और LLM-readable outputs प्रकाशित करती है।</p>
      <div class="ironloom-list">
        <a href="/hi/developers/contributing">डेवलपर दस्तावेज</a>
        <a href="/llms.txt">LLM index</a>
      </div>
    </div>
  </section>
</div>
