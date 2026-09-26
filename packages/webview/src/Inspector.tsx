import type { ComponentChildren } from 'preact';
import type { BranchChoice, FragmentInfo } from '@mermaid-animator/core';
import type { DiagramController } from './controller';
import { chapterIndexAt, contextText, stepText, type Translate } from './narrative';
import { InlineText } from './Captions';

export type InspectorSection = 'step' | 'context' | 'source' | 'participants' | 'chapters' | 'branches';

interface InspectorProps {
  controller: DiagramController;
  t: Translate;
  /** Collapsed sections (persisted by the caller). */
  collapsed: readonly InspectorSection[];
  onToggleSection: (section: InspectorSection) => void;
  /** Overlay sheet on narrow panels; beside the canvas otherwise. */
  overlay: boolean;
  onClose: () => void;
}

function Section({ id, title, collapsed, onToggle, children }: { id: InspectorSection; title: string; collapsed: boolean; onToggle: (s: InspectorSection) => void; children: ComponentChildren }) {
  const bodyId = `ma-inspector-${id}`;
  return (
    <section class="ma-inspector__section">
      <h3 class="ma-inspector__heading">
        <button type="button" class="ma-inspector__toggle" aria-expanded={!collapsed} aria-controls={bodyId} onClick={() => onToggle(id)}>
          <span class={`codicon codicon-chevron-${collapsed ? 'right' : 'down'}`} aria-hidden="true" />
          {title}
        </button>
      </h3>
      {!collapsed && (
        <div id={bodyId} class="ma-inspector__body">
          {children}
        </div>
      )}
    </section>
  );
}

function BranchChips({ fragment, controller, t }: { fragment: FragmentInfo; controller: DiagramController; t: Translate }) {
  const options: { label: string; value: BranchChoice }[] =
    fragment.kind === 'opt'
      ? [
          { label: t('inspector.include'), value: 0 },
          { label: t('inspector.skip'), value: 'skip' },
        ]
      : [...fragment.branches.map((b, i) => ({ label: b ? `[${b}]` : `#${i + 1}`, value: i as BranchChoice })), { label: t('inspector.all'), value: 'all' as BranchChoice }];
  return (
    <div class="ma-branch">
      <div class="ma-branch__name">
        <span class="ma-branch__kind">{fragment.kind.toUpperCase()}</span> {fragment.label}
      </div>
      <div class="ma-branch__chips" role="group" aria-label={`${fragment.kind} ${fragment.label}`}>
        {options.map((o) => {
          const pressed = !fragment.pending && fragment.selected === o.value;
          return (
            <button key={String(o.value)} type="button" class={`ma-chip ma-chip--branch${pressed ? ' ma-chip--selected' : ''}`} aria-pressed={pressed} onClick={() => void controller.choose(fragment.key, o.value)}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The inspector (spec inspector): step, context, source, participants, chapters and branches. */
export function Inspector({ controller, t, collapsed, onToggleSection, overlay, onClose }: InspectorProps) {
  const snap = controller.snapshot.value;
  const steps = controller.stepList.value;
  const index = snap.displayStep - 1;
  const step = steps[index];
  const focus = controller.focus.value;
  const chapters = controller.chapters.value;
  const currentChapter = chapterIndexAt(chapters, index);
  const branching = controller.fragments.value.filter((f) => f.kind === 'alt' || f.kind === 'critical' || f.kind === 'opt');
  const participantName = (id?: string) => controller.participants.value.find((p) => p.id === id)?.label ?? id ?? '';
  const isCollapsed = (s: InspectorSection) => collapsed.includes(s);
  const section = (id: InspectorSection, title: string, children: ComponentChildren) => (
    <Section id={id} title={title} collapsed={isCollapsed(id)} onToggle={onToggleSection}>
      {children}
    </Section>
  );

  return (
    <aside class={`ma-inspector${overlay ? ' ma-inspector--sheet' : ''}`} aria-label={t('inspector.title')} role={overlay ? 'dialog' : 'complementary'}>
      <header class="ma-inspector__header">
        <h2 class="ma-inspector__title">{t('inspector.title')}</h2>
        <button type="button" class="ma-button" aria-label={t('inspector.close')} title={t('inspector.close')} onClick={onClose}>
          <span class="codicon codicon-close" aria-hidden="true" />
        </button>
      </header>
      <div class="ma-inspector__scroll">
        {section(
          'step',
          t('inspector.step'),
          step ? (
            <dl class="ma-inspector__facts">
              <dt class="ma-visually-hidden">{t('inspector.step')}</dt>
              <dd class="ma-inspector__number">{t('inspector.stepN', index + 1, steps.length)}</dd>
              {step.from !== undefined && (
                <dd class="ma-inspector__ends">
                  {participantName(step.from)} → {participantName(step.to)}
                </dd>
              )}
              <dd class="ma-inspector__label">{step.label.trim() ? step.label.replace(/\n/g, ' ') : stepText(step, t)}</dd>
              {step.lanes && <dd class="ma-inspector__meta">{t('inspector.lanes', step.lanes.map((l) => l.label || `#${l.lane + 1}`).join(' ‖ '))}</dd>}
              {step.caption && (
                <dd class="ma-inspector__caption">
                  <InlineText text={step.caption} />
                </dd>
              )}
            </dl>
          ) : (
            <p class="ma-inspector__empty">{t('inspector.noStep')}</p>
          ),
        )}
        {section('context', t('inspector.context'), <p class="ma-inspector__context">{step && step.fragmentPath.length ? contextText(step.fragmentPath, t) : t('inspector.topLevel')}</p>)}
        {section(
          'source',
          t('inspector.source'),
          step ? (
            <button type="button" class="ma-link" onClick={() => controller.revealCurrent()}>
              {t('inspector.line', controller.documentLine(step.source.startLine))}
            </button>
          ) : (
            <p class="ma-inspector__empty">—</p>
          ),
        )}
        {section(
          'participants',
          t('inspector.participants'),
          <>
            <ul class="ma-inspector__list">
              {controller.participants.value.map((p) => (
                <li key={p.id}>
                  <button type="button" class="ma-inspector__item" aria-pressed={focus.has(p.id)} onClick={(e) => controller.toggleFocus(p.id, e.ctrlKey || e.metaKey)}>
                    <span class={`codicon codicon-${focus.has(p.id) ? 'eye' : 'circle-small'}`} aria-hidden="true" />
                    {p.label}
                  </button>
                </li>
              ))}
            </ul>
            <label class="ma-inspector__check">
              <input type="checkbox" checked={controller.focusedOnly.value} disabled={!focus.size} onChange={(e) => controller.setFocusedOnly((e.target as HTMLInputElement).checked)} />
              {t('inspector.focusedOnly')}
            </label>
            {focus.size > 0 && (
              <button type="button" class="ma-text-button" onClick={() => controller.clearFocus()}>
                {t('inspector.clearFocus')}
              </button>
            )}
          </>,
        )}
        {section(
          'chapters',
          t('inspector.chapters'),
          chapters.length ? (
            <ol class="ma-inspector__list">
              {chapters.map((c, i) => (
                <li key={c.firstStep}>
                  <button type="button" class="ma-inspector__item" aria-current={i === currentChapter ? 'true' : undefined} onClick={() => controller.playback.goTo(c.firstStep + 1)}>
                    <span class="ma-inspector__ordinal">{String(i + 1).padStart(2, '0')}</span>
                    {c.title}
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p class="ma-inspector__empty">{t('inspector.noChapters')}</p>
          ),
        )}
        {section(
          'branches',
          t('inspector.branches'),
          branching.length ? branching.map((f) => <BranchChips key={f.key} fragment={f} controller={controller} t={t} />) : <p class="ma-inspector__empty">{t('inspector.noBranches')}</p>,
        )}
      </div>
    </aside>
  );
}
