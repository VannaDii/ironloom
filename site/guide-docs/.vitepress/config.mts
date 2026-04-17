import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'DevPlat',
  description:
    'Platform and operations guide for the DevPlat monorepo, OpenClaw adapter, and delivery surfaces.',
  base: '/devplat/',
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    search: {
      provider: 'local',
    },
    nav: [
      { text: 'Guide', link: '/guides/introduction' },
      { text: 'Lifecycle', link: '/guides/platform-lifecycle' },
      { text: 'Architecture', link: '/guides/architecture' },
      { text: 'Quality', link: '/guides/quality-performance-policy' },
      { text: 'Live Lab', link: '/guides/live-test-lab' },
      { text: 'Operator', link: '/guides/operator-guide' },
      { text: 'Developer', link: '/guides/developer-guide' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Introduction', link: '/guides/introduction' },
          { text: 'Platform Lifecycle', link: '/guides/platform-lifecycle' },
          { text: 'Architecture', link: '/guides/architecture' },
          {
            text: 'Quality and Performance Policy',
            link: '/guides/quality-performance-policy',
          },
          { text: 'Package Reference', link: '/guides/package-reference' },
          { text: 'OpenClaw Setup', link: '/guides/openclaw-setup' },
          {
            text: 'Discord Workflows',
            link: '/guides/discord-workflows',
          },
          {
            text: 'Configuration Reference',
            link: '/guides/configuration-reference',
          },
          { text: 'Examples', link: '/guides/examples' },
          { text: 'Docker Usage', link: '/guides/docker-usage' },
          {
            text: 'Helm and k3s Deployment',
            link: '/guides/helm-k3s-deployment',
          },
          {
            text: 'SonarCloud Integration',
            link: '/guides/sonarcloud-integration',
          },
          { text: 'Live Test Lab', link: '/guides/live-test-lab' },
          {
            text: 'Live Test GitHub Setup',
            link: '/guides/live-test-github-setup',
          },
          {
            text: 'Live Test Discord Setup',
            link: '/guides/live-test-discord-setup',
          },
          {
            text: 'Live Test Sonar Setup',
            link: '/guides/live-test-sonar-setup',
          },
          {
            text: 'Live Test Cleanup and Concurrency',
            link: '/guides/live-test-cleanup-and-concurrency',
          },
          {
            text: 'Publishing and Release',
            link: '/guides/publishing-release',
          },
          { text: 'Operator Guide', link: '/guides/operator-guide' },
          { text: 'Developer Guide', link: '/guides/developer-guide' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/VannaDii/devplat' },
    ],
  },
});
