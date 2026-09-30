/**
 * The self-contained HTML player (spec html-player, M3 D5). Reads the inline data document,
 * draws with the same SVG renderers and CSS tokens as the panel, and offers transport, a scrubber
 * with chapter ticks, captions, views, the panel's playback keys and `#step=` / `#chapter=` links.
 * No network: fonts are registered from embedded data, generic drawings use a constructed sheet.
 */
import '@mermaid-animator/renderer/tokens.css';
import '@mermaid-animator/renderer/diagram.css';
import './player.css';
import interLatin from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2';
import interLatinExt from '@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2';
import { positionAt, type Timeline } from '@mermaid-animator/core';
import { prepareScene, prepareTopologyScene, sceneAt, SequenceSvgRenderer, SVG_NS, topologySceneAt, TopologySvgRenderer } from '@mermaid-animator/renderer';
import { groupReveal } from '../fallbackReveal';
import { Player, SPEEDS } from '../player';
import { decodePlayerData, stepFromHash, type PlayerData } from './data';
import { playerPalette } from '../animated/theme';

function base64Bytes(url: string): ArrayBuffer {
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

async function registerFonts(): Promise<void> {
  const faces = [
    new FontFace('Inter Variable', base64Bytes(interLatin), { weight: '100 900', unicodeRange: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2212,U+FEFF,U+FFFD' }),
    new FontFace('Inter Variable', base64Bytes(interLatinExt), { weight: '100 900', unicodeRange: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1E00-1E9F,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF' }),
  ];
  for (const face of faces) {
    await face.load();
    document.fonts.add(face);
  }
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: Element, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  parent?.appendChild(node);
  return node;
};

function button(parent: Element, label: string, glyph: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', 'mp-button', parent, glyph);
  b.type = 'button';
  b.setAttribute('aria-label', label);
  b.title = label;
  b.addEventListener('click', onClick);
  return b;
}

function svgSurface(parent: Element, cls: string, bounds: { x: number; y: number; w: number; h: number }): { svg: SVGSVGElement; root: SVGGElement } {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `ma-svg ${cls}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('viewBox', `${bounds.x - 16} ${bounds.y - 16} ${bounds.w + 32} ${bounds.h + 32}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const root = document.createElementNS(SVG_NS, 'g');
  svg.appendChild(root);
  parent.appendChild(svg);
  return { svg, root };
}

/** Generic reveal (the panel's GenericDiagram.renderAt): opacity per group and path drawing. */
function genericRenderer(parent: Element, data: NonNullable<PlayerData['generic']>, timeline: Timeline) {
  const holder = el('div', 'mp-generic', parent);
  const doc = new DOMParser().parseFromString(data.svg, 'image/svg+xml');
  const svg = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  holder.appendChild(svg);
  const groups = data.groups.map((g, i) => ({
    kind: g.kind,
    elements: [...svg.querySelectorAll<SVGElement>(`.ma-g${i}`)],
    paths: g.paths.map((p, j) => ({ length: p.length, el: svg.querySelector<SVGElement>(`.ma-p${i}-${j}`) })),
  }));
  const overview = timeline.clear !== undefined;
  return (t: number) => {
    const pos = positionAt(timeline, t);
    groups.forEach((g, i) => {
      const { opacity, draw } = groupReveal(i, g.kind, pos, false, overview);
      for (const e of g.elements) {
        e.style.opacity = String(opacity);
        e.style.display = opacity <= 0 ? 'none' : '';
      }
      for (const p of g.paths) {
        if (!p.el || !p.length) continue;
        p.el.style.strokeDasharray = draw < 1 ? `${p.length}` : '';
        p.el.style.strokeDashoffset = draw < 1 ? `${p.length * (1 - draw)}` : '';
      }
    });
  };
}

async function start(): Promise<void> {
  const script = document.getElementById('ma-player-data');
  if (!script?.textContent) return;
  const data = decodePlayerData(script.textContent);
  await registerFonts().catch(() => undefined);
  const root = document.getElementById('ma-player') ?? document.body;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const applyTheme = () => {
    document.documentElement.dataset.palette = playerPalette(data.theme, media.matches);
  };
  applyTheme();
  // Only `auto` follows the viewer's colour scheme (spec export-theme).
  if (data.theme === 'auto') media.addEventListener('change', applyTheme);
  if (data.generic) {
    const extra = (data as PlayerData & { genericCss?: string }).genericCss;
    if (extra) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(extra);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    }
  }

  const shell = el('div', 'mp', root);
  const head = el('header', 'mp-head', shell);
  el('h1', 'mp-title', head, data.title);
  const stage = el('main', 'mp-stage', shell);
  stage.dataset.view = data.view;
  const caption = el('p', 'mp-caption', shell);
  caption.setAttribute('aria-live', 'polite');
  const transport = el('footer', 'mp-transport', shell);
  transport.setAttribute('role', 'group');
  transport.setAttribute('aria-label', 'Playback controls');

  const draws: ((t: number) => void)[] = [];
  if (data.sequence) {
    const { layout, compiled } = data.sequence;
    const { root: g } = svgSurface(stage, 'mp-sequence', { x: 0, y: 0, w: layout.width, h: layout.height });
    const renderer = new SequenceSvgRenderer(g);
    renderer.mount(layout);
    const model = prepareScene(layout, compiled, data.timeline);
    draws.push((t) => renderer.render(sceneAt(model, t, data.display), { comet: data.display.indicator === 'comet' }));
  }
  if (data.topology && data.sequence) {
    const { topology, geometry, labels, weight } = data.topology;
    const { root: g } = svgSurface(stage, 'mp-topology', geometry.bounds);
    const renderer = new TopologySvgRenderer(g);
    renderer.mount(topology, geometry, labels);
    const model = prepareTopologyScene(topology, data.sequence.compiled, data.timeline);
    draws.push((t) => renderer.render(topologySceneAt(model, t, data.display), geometry, { comet: data.display.indicator === 'comet', weight }));
  }
  if (data.generic) draws.push(genericRenderer(stage, data.generic, data.timeline));

  if (data.topology) {
    const views = el('div', 'mp-views', head);
    views.setAttribute('role', 'radiogroup');
    views.setAttribute('aria-label', 'View');
    for (const view of ['sequence', 'topology', 'split'] as const) {
      const b = el('button', 'mp-view', views, view[0]!.toUpperCase() + view.slice(1));
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => setView(view));
    }
  }
  const setView = (view: string) => {
    stage.dataset.view = view;
    for (const b of head.querySelectorAll<HTMLButtonElement>('.mp-view')) b.setAttribute('aria-checked', String(b.textContent?.toLowerCase() === view));
  };
  setView(data.view);

  const player = new Player(data.timeline, { speed: 1, loop: false, onEnd: 'stop', reverse: 'animate', snap: true });
  // A small scripting hook for pages that embed the player (and for tests).
  (window as unknown as { maPlayer: Player }).maPlayer = player;
  const count = data.timeline.starts.length;
  button(transport, 'First step', '⏮', () => player.first());
  button(transport, 'Previous step', '◀', () => player.previous());
  const play = button(transport, 'Play', '▶', () => player.toggle());
  play.classList.add('mp-primary');
  button(transport, 'Next step', '▶|', () => player.next());
  button(transport, 'Last step', '⏭', () => player.last());

  const scrub = el('div', 'mp-scrubber', transport);
  scrub.setAttribute('role', 'slider');
  scrub.tabIndex = 0;
  scrub.setAttribute('aria-label', 'Playback position');
  scrub.setAttribute('aria-valuemin', '0');
  scrub.setAttribute('aria-valuemax', String(count));
  const track = el('div', 'mp-track', scrub);
  const played = el('div', 'mp-played', track);
  for (const c of data.chapters) {
    const tick = el('span', 'mp-chapter', track);
    tick.style.left = `${((data.timeline.starts[c.firstStep] ?? 0) / Math.max(1, data.timeline.duration)) * 100}%`;
    tick.title = c.title;
  }
  const thumb = el('div', 'mp-thumb', scrub);
  const timeAt = (x: number) => {
    const r = scrub.getBoundingClientRect();
    return Math.min(1, Math.max(0, (x - r.left) / r.width)) * data.timeline.duration;
  };
  scrub.addEventListener('pointerdown', (e) => {
    scrub.setPointerCapture(e.pointerId);
    player.beginScrub();
    player.scrub(timeAt(e.clientX));
  });
  scrub.addEventListener('pointermove', (e) => {
    if (player.snapshot().scrubbing) player.scrub(timeAt(e.clientX));
  });
  scrub.addEventListener('pointerup', () => player.snapshot().scrubbing && player.endScrub());

  const counter = el('span', 'mp-counter', transport);
  const speed = el('button', 'mp-speed', transport, '1×');
  speed.type = 'button';
  speed.setAttribute('aria-label', 'Playback speed');
  speed.addEventListener('click', () => {
    const i = SPEEDS.indexOf(player.snapshot().speed as (typeof SPEEDS)[number]);
    player.setSpeed(SPEEDS[(i + 1) % SPEEDS.length]!);
  });
  const loop = button(transport, 'Loop', '↻', () => player.setOptions({ loop: !player.snapshot().loop }));

  const chapterTarget = (dir: 1 | -1) => {
    const rest = player.restingIndex();
    if (dir === 1) return data.chapters.find((c) => c.firstStep > rest)?.firstStep;
    const current = [...data.chapters].reverse().find((c) => c.firstStep <= rest);
    if (!current) return undefined;
    return current.firstStep < rest ? current.firstStep : [...data.chapters].reverse().find((c) => c.firstStep < current.firstStep)?.firstStep;
  };
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const actions: Record<string, () => void> = {
      ' ': () => player.toggle(),
      k: () => player.toggle(),
      ArrowRight: () => (e.shiftKey ? chapterTarget(1) !== undefined && player.goTo(chapterTarget(1)! + 1) : player.next()),
      ArrowLeft: () => (e.shiftKey ? chapterTarget(-1) !== undefined && player.goTo(chapterTarget(-1)! + 1) : player.previous()),
      PageDown: () => player.next(),
      PageUp: () => player.previous(),
      Home: () => player.first(),
      End: () => player.last(),
      l: () => player.setOptions({ loop: !player.snapshot().loop }),
      '[': () => player.setSpeed(SPEEDS[Math.max(0, SPEEDS.indexOf(player.snapshot().speed as (typeof SPEEDS)[number]) - 1)]!),
      ']': () => player.setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(player.snapshot().speed as (typeof SPEEDS)[number]) + 1)]!),
      t: () => data.topology && setView(stage.dataset.view === 'sequence' ? 'topology' : 'sequence'),
      s: () => data.topology && setView(stage.dataset.view === 'split' ? 'sequence' : 'split'),
    };
    const action = actions[k];
    if (!action) return;
    e.preventDefault();
    action();
  });

  let lastStep = -2;
  let frame = 0;
  let last = 0;
  const render = () => {
    const s = player.snapshot();
    for (const draw of draws) draw(s.t);
    const f = Math.min(1, s.t / Math.max(1, data.timeline.duration));
    played.style.width = `${f * 100}%`;
    thumb.style.left = `${f * 100}%`;
    const pad = (n: number) => String(n).padStart(2, '0');
    counter.textContent = `${pad(s.displayStep)} / ${pad(count)}`;
    scrub.setAttribute('aria-valuenow', String(s.displayStep));
    play.textContent = s.playing ? '❚❚' : '▶';
    play.setAttribute('aria-label', s.playing ? 'Pause' : 'Play');
    speed.textContent = `${s.speed}×`;
    loop.setAttribute('aria-pressed', String(s.loop));
    const step = s.displayStep - 1;
    if (step !== lastStep) {
      lastStep = step;
      caption.textContent = data.steps[step]?.caption ?? '';
      caption.hidden = !data.steps.some((x) => x.caption);
      // Keep the fragment in step with playback (spec html-player).
      if (!s.playing && !s.animating) history.replaceState(null, '', step >= 0 ? `#step=${step + 1}` : '#');
    }
  };
  const tick = (now: number) => {
    frame = 0;
    const dt = last ? Math.min(100, now - last) : 16;
    last = now;
    if (player.isActive) player.tick(dt);
    render();
    if (player.isActive) frame = requestAnimationFrame(tick);
    else last = 0;
  };
  player.subscribe(() => {
    if (!frame) frame = requestAnimationFrame(tick);
  });
  const initial = stepFromHash(location.hash, data.chapters, count);
  if (initial !== undefined) player.setTimeline(data.timeline, initial - 1);
  render();
  window.addEventListener('hashchange', () => {
    const n = stepFromHash(location.hash, data.chapters, count);
    if (n !== undefined && n !== player.snapshot().displayStep) player.goTo(n);
  });
}

void start();
