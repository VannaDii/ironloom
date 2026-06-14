---
layout: home
title: Ironloom
titleTemplate: false
hero:
  name: Ironloom
  text: Operaciones de ingeniería auditables.
  tagline: Un runtime supervisor en Rust para trabajo operado desde Discord, estado fuente de verdad en GitHub, controles de SonarCloud, artefactos inmutables y despliegues en k3s.
  image:
    src: /ironloom-mark.svg
    alt: Marca de Ironloom
  actions:
    - theme: brand
      text: Empezar configuración
      link: /es/guides/getting-started
    - theme: alt
      text: Leer docs de API
      link: /es/api/
---

<div class="ironloom-home">
  <section class="ironloom-section">
    <div>
      <h2>Opera desde un plano de control vinculado a un hilo.</h2>
    </div>
    <div>
      <p>Ironloom mantiene la intención del operador, el estado del repositorio fuente de verdad, los controles de calidad, el despacho de workers y los artefactos inmutables dentro de un único límite de runtime auditable.</p>
      <div class="ironloom-list">
        <a href="/es/guides/operator-workflows">Flujos de operación</a>
        <a href="/es/developers/architecture">Arquitectura del runtime</a>
      </div>
    </div>
  </section>

  <section class="ironloom-section">
    <div>
      <h2>Despliega con controles de configuración explícitos.</h2>
    </div>
    <div>
      <p>Las variables de entorno enlazan secretos en Docker y Kubernetes. Los valores de runtime faltantes bloquean la preparación y exponen una página de configuración inicial en el mismo puerto HTTP.</p>
      <div class="ironloom-list">
        <a href="/es/guides/setup">Configuración inicial</a>
        <a href="/es/guides/deployment">Despliegue en k3s</a>
      </div>
    </div>
  </section>

  <section class="ironloom-section">
    <div>
      <h2>Documentado para personas y modelos de lenguaje.</h2>
    </div>
    <div>
      <p>El sitio publica guías, documentación para desarrollo, páginas de referencia de API, metadatos de sitemap, datos estructurados JSON-LD y salidas legibles por LLM.</p>
      <div class="ironloom-list">
        <a href="/es/developers/contributing">Docs para desarrollo</a>
        <a href="/llms.txt">Índice LLM</a>
      </div>
    </div>
  </section>
</div>
