import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { defineConfig } from 'vitepress'
import type { DefaultTheme } from 'vitepress'
import { GitChangelog, GitChangelogMarkdownSection } from '@nolebase/vitepress-plugin-git-changelog/vite'
import { groupIconMdPlugin, groupIconVitePlugin } from 'vitepress-plugin-group-icons'
import llmstxt from 'vitepress-plugin-llms'

import {
  ACCENT_COLOR,
  DEFAULT_SITE_URL,
  LIGHT_THEME_COLOR,
  REPOSITORY_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  SOCIAL_PREVIEW_ALT,
  THEME_COLOR,
} from '../src/siteMetadata'

const siteName = SITE_NAME
const siteDescription = SITE_DESCRIPTION
const defaultSiteUrl = DEFAULT_SITE_URL
const siteUrl = stripTrailingSlash(process.env.SITE_URL || defaultSiteUrl)
const siteHomeUrl = new URL('/', siteUrl).toString()
const repositoryUrl = REPOSITORY_URL
const docsEditBranch = process.env.DOCS_EDIT_BRANCH || 'main'
const docsEditLinkPattern = `${repositoryUrl}/edit/${docsEditBranch}/site/guide-docs/:path`
const socialImageUrl = new URL('/ironloom-social.png', siteHomeUrl).toString()
const logoUrl = new URL('/ironloom-mark.svg', siteHomeUrl).toString()
const githubIconSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
    <path fill="currentColor" d="M8 1.3a6.665 6.665 0 0 1 5.413 10.56 6.677 6.677 0 0 1-3.288 2.432c-.333.067-.458-.142-.458-.316 0-.226.008-.942.008-1.834 0-.625-.208-1.025-.45-1.233 1.483-.167 3.042-.734 3.042-3.292a2.58 2.58 0 0 0-.684-1.792c.067-.166.3-.85-.066-1.766 0 0-.559-.184-1.834.683a6.186 6.186 0 0 0-1.666-.225c-.567 0-1.134.075-1.667.225-1.275-.858-1.833-.683-1.833-.683-.367.916-.134 1.6-.067 1.766a2.594 2.594 0 0 0-.683 1.792c0 2.55 1.55 3.125 3.033 3.292-.192.166-.367.458-.425.891-.383.175-1.342.459-1.942-.55-.125-.2-.5-.691-1.025-.683-.558.008-.225.317.009.442.283.158.608.75.683.941.133.376.567 1.092 2.242.784 0 .558.008 1.083.008 1.242 0 .174-.125.374-.458.316a6.662 6.662 0 0 1-4.559-6.325A6.665 6.665 0 0 1 8 1.3Z"/>
  </svg>
`.trim()

const pageDescriptions: Record<string, string> = {
  'index.md':
    'Ironloom is the Rust supervisor runtime for auditable operator-driven engineering work, with Discord controls, GitHub source-of-truth state, SonarCloud gates, and k3s deployment.',
  'introduction.md':
    'Learn what Ironloom is, which systems it coordinates, and how the runtime keeps operator actions auditable.',
  'guides/getting-started.md':
    'Start Ironloom locally, provide first-run setup secrets, and verify the HTTP setup and readiness surface.',
  'guides/setup.md':
    'Configure Ironloom with environment-bound secrets or encrypted local setup values under IRONLOOM_STATE_ROOT.',
  'guides/deployment.md':
    'Deploy Ironloom to k3s with the Helm chart, setup secret, runtime credentials, readiness checks, and rollback flow.',
  'guides/operator-workflows.md':
    'Operate Ironloom from thread-bound Discord workflows that refresh GitHub state and fail closed when context is ambiguous.',
  'developers/architecture.md':
    'Review Ironloom crate boundaries, runtime composition, adapters, storage, policy, and process graph responsibilities.',
  'developers/contributing.md':
    'Use the local Rust and documentation gates required before changing Ironloom source, schemas, docs, or packaging.',
  'developers/quality-gates.md':
    'Understand the formatting, Clippy, test, schema, dependency, audit, documentation, Docker, Helm, and SonarCloud gates.',
  'developers/migration-notes.md':
    'Review migration notes for the Rust supervisor runtime and the .ironloom state boundary.',
  'api/index.md':
    'Browse the Ironloom API documentation surface for runtime HTTP routes, environment configuration, storage, schemas, and crates.',
  'api/configuration.md':
    'Reference Ironloom environment variables, encrypted setup behavior, config precedence, and OpenAI authentication inputs.',
  'api/runtime-http.md':
    'Reference the Ironloom runtime HTTP endpoints for health, readiness, setup, setup submission, and OpenAI OAuth setup.',
  'api/storage.md':
    'Reference Ironloom storage paths for immutable artifacts, indexes, and encrypted setup configuration.',
  'api/schemas.md':
    'Reference committed Ironloom JSON schemas and the schema drift workflow.',
  'api/crates.md':
    'Reference Ironloom Rust crate responsibilities and public ownership boundaries.',
}

const guidesSidebar: DefaultTheme.SidebarItem[] = [
  {
    text: 'Guides',
    items: [
      { text: 'Getting Started', link: '/guides/getting-started' },
      { text: 'Initial Setup', link: '/guides/setup' },
      { text: 'Deployment', link: '/guides/deployment' },
      { text: 'Operator Workflows', link: '/guides/operator-workflows' },
    ],
  },
]

const developerSidebar: DefaultTheme.SidebarItem[] = [
  {
    text: 'Developer Docs',
    items: [
      { text: 'Architecture', link: '/developers/architecture' },
      { text: 'Contributing', link: '/developers/contributing' },
      { text: 'Quality Gates', link: '/developers/quality-gates' },
      { text: 'Migration Notes', link: '/developers/migration-notes' },
    ],
  },
]

const apiSidebar: DefaultTheme.SidebarItem[] = [
  {
    text: 'API Docs',
    items: [
      { text: 'Overview', link: '/api/' },
      { text: 'Configuration', link: '/api/configuration' },
      { text: 'Runtime HTTP', link: '/api/runtime-http' },
      { text: 'Storage', link: '/api/storage' },
      { text: 'Schemas', link: '/api/schemas' },
      { text: 'Crates', link: '/api/crates' },
    ],
  },
]

const fullSidebar: DefaultTheme.Sidebar = {
  '/guides/': guidesSidebar,
  '/developers/': developerSidebar,
  '/api/': apiSidebar,
  '/': [
    {
      text: 'Ironloom',
      items: [
        { text: 'Introduction', link: '/introduction' },
        { text: 'Getting Started', link: '/guides/getting-started' },
      ],
    },
    ...guidesSidebar,
    ...developerSidebar,
    ...apiSidebar,
  ],
}

const llmsSidebar: DefaultTheme.Sidebar = {
  '/': [
    {
      text: 'Ironloom',
      items: [
        { text: 'Introduction', link: '/introduction' },
        { text: 'Getting Started', link: '/guides/getting-started' },
      ],
    },
    ...guidesSidebar,
    ...developerSidebar,
    ...apiSidebar,
  ],
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/$/, '')
}

function normalizePagePath(relativePath: string) {
  if (!relativePath || relativePath === 'index.md') {
    return '/'
  }

  const path = relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')
  return path.startsWith('/') ? path : `/${path}`
}

function getCanonicalUrl(relativePath: string) {
  return new URL(normalizePagePath(relativePath), siteHomeUrl).toString()
}

function trimDescription(text: string, maxLength = 160) {
  const normalized = text.replace(/\s+/g, ' ').trim()

  if (normalized.length <= maxLength) {
    return normalized
  }

  const clipped = normalized.slice(0, maxLength + 1)
  const lastSpace = clipped.lastIndexOf(' ')
  return `${clipped.slice(0, lastSpace > 0 ? lastSpace : maxLength).trimEnd()}...`
}

function stripMarkdown(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractMarkdownDescription(markdown: string) {
  const withoutFrontmatter = markdown.replace(/^---\n[\s\S]*?\n---\n?/, '')
  const paragraphs: string[] = []
  const paragraphLines: string[] = []
  let inFence = false

  function flushParagraph() {
    if (paragraphLines.length === 0) {
      return
    }

    const paragraph = stripMarkdown(paragraphLines.join(' '))
    paragraphLines.length = 0

    if (paragraph.length >= 60) {
      paragraphs.push(paragraph)
    }
  }

  for (const rawLine of withoutFrontmatter.split('\n')) {
    const line = rawLine.trim()

    if (line.startsWith('```')) {
      inFence = !inFence
      flushParagraph()
      continue
    }

    if (inFence) {
      continue
    }

    if (line === '' || line.startsWith('#') || line.startsWith(':::') || line.startsWith('![') || line.startsWith('>') || /^[*-]\s/.test(line)) {
      flushParagraph()
      continue
    }

    paragraphLines.push(line)
  }

  flushParagraph()
  return paragraphs[0] ? trimDescription(paragraphs[0]) : undefined
}

async function getPageDescription(relativePath: string, filePath: string, srcDir: string) {
  if (pageDescriptions[relativePath]) {
    return pageDescriptions[relativePath]
  }

  if (!filePath) {
    return undefined
  }

  try {
    const markdown = await readFile(join(srcDir, filePath), 'utf8')
    return extractMarkdownDescription(markdown)
  } catch {
    return undefined
  }
}

function getPageSchemaType(relativePath: string) {
  if (relativePath === 'index.md') {
    return 'CollectionPage'
  }

  return relativePath.startsWith('api/') ? 'APIReference' : 'TechArticle'
}

function createStructuredData(relativePath: string, title: string, description: string) {
  const canonicalUrl = getCanonicalUrl(relativePath)
  const isHomePage = relativePath === 'index.md'
  const graph: Array<Record<string, unknown>> = [
    {
      '@type': 'Organization',
      '@id': `${siteHomeUrl}#organization`,
      name: 'Veritas Labs',
      url: siteHomeUrl,
      logo: {
        '@type': 'ImageObject',
        url: logoUrl,
      },
      sameAs: [repositoryUrl],
    },
    {
      '@type': 'WebSite',
      '@id': `${siteHomeUrl}#website`,
      name: siteName,
      url: siteHomeUrl,
      description: siteDescription,
      publisher: {
        '@id': `${siteHomeUrl}#organization`,
      },
      inLanguage: 'en-US',
    },
    {
      '@type': 'SoftwareSourceCode',
      '@id': `${siteHomeUrl}#software`,
      name: siteName,
      url: siteHomeUrl,
      description: siteDescription,
      codeRepository: repositoryUrl,
      programmingLanguage: 'Rust',
      runtimePlatform: 'Linux containers and k3s',
      license: 'https://opensource.org/license/mit',
      image: socialImageUrl,
      publisher: {
        '@id': `${siteHomeUrl}#organization`,
      },
    },
    {
      '@type': getPageSchemaType(relativePath),
      '@id': `${canonicalUrl}#webpage`,
      url: canonicalUrl,
      name: title,
      description,
      isPartOf: {
        '@id': `${siteHomeUrl}#website`,
      },
      about: {
        '@id': `${siteHomeUrl}#software`,
      },
      image: socialImageUrl,
      thumbnailUrl: socialImageUrl,
      inLanguage: 'en-US',
    },
  ]

  if (!isHomePage) {
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': `${canonicalUrl}#breadcrumb`,
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: siteHomeUrl,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: title.replace(` | ${siteName}`, ''),
          item: canonicalUrl,
        },
      ],
    })
  }

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': graph,
  }).replace(/</g, '\\u003c')
}

export default defineConfig({
  title: siteName,
  description: siteDescription,
  base: process.env.BASE_URL || '/',
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: [/^https:\/\/ironloom\.dev/],
  markdown: {
    config(md) {
      groupIconMdPlugin(md)
    },
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/ironloom-favicon-16x16.png' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/ironloom-favicon-32x32.png' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '48x48', href: '/ironloom-favicon-48x48.png' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '64x64', href: '/ironloom-favicon-64x64.png' }],
    ['link', { rel: 'shortcut icon', href: '/favicon.ico', sizes: 'any' }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }],
    ['link', { rel: 'mask-icon', href: '/ironloom-mark.svg', color: ACCENT_COLOR }],
    ['link', { rel: 'manifest', href: '/site.webmanifest' }],
    ['link', { rel: 'image_src', href: '/ironloom-social.png' }],
    ['meta', { name: 'application-name', content: siteName }],
    ['meta', { name: 'apple-mobile-web-app-title', content: siteName }],
    ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
    ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' }],
    ['meta', { name: 'mobile-web-app-capable', content: 'yes' }],
    ['meta', { name: 'format-detection', content: 'telephone=no' }],
    ['meta', { name: 'msapplication-TileColor', content: THEME_COLOR }],
    ['meta', { name: 'color-scheme', content: 'light dark' }],
    ['meta', { name: 'theme-color', media: '(prefers-color-scheme: light)', content: LIGHT_THEME_COLOR }],
    ['meta', { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: THEME_COLOR }],
    ['meta', { name: 'theme-color', content: THEME_COLOR }],
  ],
  vite: {
    build: {
      target: 'es2022',
    },
    esbuild: {
      target: 'es2022',
    },
    optimizeDeps: {
      esbuildOptions: {
        target: 'es2022',
      },
    },
    plugins: [
      llmstxt({
        domain: siteUrl,
        sidebar: llmsSidebar,
        ignoreFilesPerOutput: {
          llmsTxt: [],
          llmsFullTxt: [],
          pages: [],
        },
      }),
      groupIconVitePlugin(),
      GitChangelog({
        repoURL: repositoryUrl,
        include: ['site/guide-docs/**/*.md', '!node_modules'],
      }),
      GitChangelogMarkdownSection({
        exclude: (id, { helpers }) => helpers.idEquals('index.md'),
      }),
    ],
  },
  sitemap: {
    hostname: siteHomeUrl,
    transformItems(items) {
      return items.filter(item => !item.url.endsWith('/404.html'))
    },
  },
  async transformPageData(pageData, ctx) {
    if (pageData.isNotFound) {
      return {
        description: 'The page you requested could not be found on the Ironloom documentation site.',
      }
    }

    const description = (await getPageDescription(pageData.relativePath, pageData.filePath, ctx.siteConfig.srcDir)) ?? siteDescription
    return { description }
  },
  transformHead({ pageData }) {
    const isNotFound = Boolean(pageData.isNotFound)
    const isHomePage = pageData.relativePath === 'index.md'
    const canonicalUrl = getCanonicalUrl(pageData.relativePath)
    const pageTitle = isHomePage ? siteName : `${pageData.title} | ${siteName}`
    const description = pageData.description || siteDescription
    const jsonLd = createStructuredData(pageData.relativePath, pageTitle, description)
    const head = [
      ['meta', { name: 'robots', content: isNotFound ? 'noindex, nofollow' : 'index, follow, max-image-preview:large' }],
      ['meta', { name: 'googlebot', content: isNotFound ? 'noindex, nofollow' : 'index, follow, max-image-preview:large' }],
      ['meta', { property: 'og:site_name', content: siteName }],
      ['meta', { property: 'og:locale', content: 'en_US' }],
      ['meta', { property: 'og:type', content: isHomePage ? 'website' : 'article' }],
      ['meta', { property: 'og:title', content: pageTitle }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:url', content: canonicalUrl }],
      ['meta', { property: 'og:image', content: socialImageUrl }],
      ['meta', { property: 'og:image:secure_url', content: socialImageUrl }],
      ['meta', { property: 'og:image:type', content: 'image/png' }],
      ['meta', { property: 'og:image:width', content: '1280' }],
      ['meta', { property: 'og:image:height', content: '640' }],
      ['meta', { property: 'og:image:alt', content: SOCIAL_PREVIEW_ALT }],
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
      ['meta', { name: 'twitter:title', content: pageTitle }],
      ['meta', { name: 'twitter:description', content: description }],
      ['meta', { name: 'twitter:image', content: socialImageUrl }],
      ['meta', { name: 'twitter:image:alt', content: SOCIAL_PREVIEW_ALT }],
      ['script', { type: 'application/ld+json' }, jsonLd],
    ] as [string, Record<string, string>, string?][]

    if (!isNotFound) {
      head.unshift(['link', { rel: 'canonical', href: canonicalUrl }])
    }

    return head
  },
  themeConfig: {
    logo: {
      src: '/ironloom-mark.svg',
      alt: 'Ironloom logo',
    },
    nav: [
      { text: 'Guides', link: '/guides/getting-started' },
      { text: 'Developer Docs', link: '/developers/architecture' },
      { text: 'API Docs', link: '/api/' },
      { text: 'LLM', link: '/llms.txt' },
    ],
    sidebar: fullSidebar,
    outline: {
      label: 'On this page',
      level: [2, 3],
    },
    editLink: {
      pattern: docsEditLinkPattern,
      text: 'Suggest edits to this page',
    },
    socialLinks: [{ icon: { svg: githubIconSvg }, link: repositoryUrl, ariaLabel: 'GitHub' }],
    search: {
      provider: 'local',
    },
    footer: {
      message: 'Auditable engineering operations for Discord, GitHub, SonarCloud, and k3s.',
      copyright: 'Released under the MIT License.',
    },
  },
})
