# Mermaid Animator documentation site

The source of **https://mermaid-animator.enbinario.com**, built with [Docusaurus](https://docusaurus.io) and deployed
to GitHub Pages by [`.github/workflows/site.yml`](../.github/workflows/site.yml). It is a standalone npm project, not
one of the monorepo's workspaces.

```bash
cd site
npm ci
npm start          # dev server at http://localhost:3000, with live reload
npm run build      # production build in build/; fails on broken links and anchors
npm run e2e        # Playwright + axe against the build (light and dark, desktop and mobile)
npm run typecheck
```

## What is written and what is generated

| Path | Source |
|---|---|
| `docs/**/*.md` | Written by hand. Update them in the same pull request as the behaviour they describe |
| `docs/reference/settings.md` | **Generated** from `contributes.configuration` in `packages/extension/package.json`, with the English strings of `package.nls.json` |
| `docs/reference/commands.md` | **Generated** from `contributes.commands`, `keybindings` and `menus` |
| `docs/changelog.md` | **Generated** from `packages/extension/CHANGELOG.md` |
| `static/schemas/animator.schema.json` | **Copied** from `packages/extension/schemas/`, served at its `$id` |
| `static/img/icon.png` | **Copied** from `packages/extension/media/icon.png` |
| `static/img/screens/*.png` | Captured from the webview harness by `scripts/capture-screens.mjs`; committed |
| `static/img/social-card.png` | Rendered by `scripts/render-social-card.mjs`; committed |

`scripts/generate.mjs` writes the generated files before every `start` and `build`, and they are gitignored. It fails
if the schema's `$id` isn't `https://mermaid-animator.enbinario.com/schemas/animator.schema.json`: users write that
URL into their sidecar files, so it must keep resolving.

### Updating the screenshots

```bash
npm run build                          # repository root
node scripts/serve-harness.mjs 5199    # repository root; leave it running
cd site && node scripts/capture-screens.mjs && node scripts/render-social-card.mjs
```

## Deployment

| Event | What happens |
|---|---|
| Pull request touching `site/`, the extension manifest or strings, the CHANGELOG, the schema or the icon | Build, type check and e2e; the build is uploaded as the `site-preview` artifact |
| Push of a `v*` tag | Build, tests, deploy to GitHub Pages, so the docs match the released extension |
| **Run workflow** | The same deploy by hand (for example before the first tagged release) |

One-time setup in the repository: **Settings → Pages → Source: GitHub Actions**, **Custom domain**
`mermaid-animator.enbinario.com` (DNS: `CNAME mermaid-animator → en-binario.github.io.`), then **Enforce HTTPS**;
and in **Settings → Environments → github-pages**, allow the `v*` tags as well as the default branch.

`SITE_URL` and `BASE_URL` build the site for another location, for example
`SITE_URL=https://en-binario.github.io BASE_URL=/mermaid-animator/ npm run build`.
