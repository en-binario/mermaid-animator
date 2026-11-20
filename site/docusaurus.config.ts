import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import { darkCodeTheme, lightCodeTheme } from './src/prism-themes';
import rehypeTableRegion from './src/rehype-table-region.mjs';

// The site is served by GitHub Pages at its own custom domain. SITE_URL and BASE_URL let a workflow build it for
// another location (for example https://en-binario.github.io/mermaid-animator/ before the domain is set up).
// The sidecar schema's $id is https://mermaid-animator.enbinario.com/schemas/animator.schema.json: that URL is
// permanent once users have it in their files.
const url = process.env.SITE_URL ?? 'https://mermaid-animator.enbinario.com';
const baseUrl = process.env.BASE_URL ?? '/';
const repo = 'https://github.com/en-binario/mermaid-animator';

/** Generated pages are edited at their source, not in site/docs/. */
const GENERATED_SOURCES: Record<string, string> = {
  'reference/settings.md': `${repo}/edit/master/packages/extension/package.json`,
  'reference/commands.md': `${repo}/edit/master/packages/extension/package.json`,
  'changelog.md': `${repo}/edit/master/packages/extension/CHANGELOG.md`,
};

const config: Config = {
  title: 'Mermaid Animator',
  tagline: 'Play the Mermaid diagrams already in your repository as elegant, navigable animations.',
  favicon: 'img/favicon.svg',
  url,
  baseUrl,
  organizationName: 'en-binario',
  projectName: 'mermaid-animator',
  trailingSlash: true,

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  markdown: {
    // .md files are CommonMark, .mdx files are MDX.
    format: 'detect',
    hooks: { onBrokenMarkdownLinks: 'throw' },
  },

  i18n: { defaultLocale: 'en', locales: ['en'] },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
          editUrl: ({ docPath }) => GENERATED_SOURCES[docPath] ?? `${repo}/edit/master/site/docs/${docPath}`,
          rehypePlugins: [rehypeTableRegion],
        },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
        sitemap: { changefreq: 'weekly', priority: 0.5 },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/social-card.png',
    metadata: [
      { name: 'keywords', content: 'mermaid, vscode extension, sequence diagram, animation, diagrams as code, gif, animated svg' },
    ],
    colorMode: { respectPrefersColorScheme: true },
    docs: { sidebar: { hideable: true } },
    navbar: {
      title: 'Mermaid Animator',
      logo: { alt: 'Mermaid Animator', src: 'img/favicon.svg' },
      items: [
        { type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Docs' },
        { to: '/docs/authoring/annotations/', label: 'Annotations', position: 'left' },
        { to: '/docs/reference/settings/', label: 'Settings', position: 'left' },
        { to: '/docs/changelog/', label: 'Changelog', position: 'left' },
        { href: repo, label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting started', to: '/docs/getting-started/' },
            { label: 'Playing a diagram', to: '/docs/guide/playback/' },
            { label: 'Export and share', to: '/docs/guide/export/' },
          ],
        },
        {
          title: 'Reference',
          items: [
            { label: 'Annotations', to: '/docs/authoring/annotations/' },
            { label: 'Settings', to: '/docs/reference/settings/' },
            { label: 'Changelog', to: '/docs/changelog/' },
          ],
        },
        {
          title: 'Project',
          items: [
            { label: 'GitHub', href: repo },
            { label: 'Report an issue', href: `${repo}/issues` },
            { label: 'Part of EnBinario', href: 'https://enbinario.com' },
          ],
        },
      ],
      copyright: `© ${new Date().getFullYear()} Jhon Tapia · MIT License · Part of <a href="https://enbinario.com">EnBinario</a>`,
    },
    prism: {
      theme: lightCodeTheme,
      darkTheme: darkCodeTheme,
      additionalLanguages: ['json', 'json5', 'bash'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
