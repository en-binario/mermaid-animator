import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'intro',
    'getting-started',
    {
      type: 'category',
      label: 'Using the animator',
      collapsed: false,
      items: ['guide/playback', 'guide/views', 'guide/narrate-and-present', 'guide/keyboard', 'guide/export'],
    },
    {
      type: 'category',
      label: 'Authoring',
      collapsed: false,
      items: ['authoring/annotations', 'authoring/sidecar-files'],
    },
    {
      type: 'category',
      label: 'Reference',
      items: ['reference/settings', 'reference/commands', 'accessibility-and-privacy'],
    },
    'changelog',
  ],
};

export default sidebars;
