import { useEffect, useRef } from 'preact/hooks';
import type { DiagramController } from './controller';
import { transcript, type Translate } from './narrative';
import { InlineText } from './Captions';

/** Text rendition of the steps (spec transcript-view), replacing the canvas while active. */
export function Transcript({ controller, t }: { controller: DiagramController; t: Translate }) {
  const groups = transcript(controller.stepList.value, t);
  const current = controller.snapshot.value.displayStep - 1;
  const root = useRef<HTMLElement>(null);

  // Keep the current entry in view as playback moves.
  useEffect(() => {
    root.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  // Focus the current entry (or the first) when the view opens, for keyboard users.
  useEffect(() => {
    const target = root.current?.querySelector<HTMLElement>('[aria-current="step"]') ?? root.current?.querySelector<HTMLElement>('.ma-transcript__entry');
    target?.focus({ preventScroll: false });
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const entries = [...(root.current?.querySelectorAll<HTMLElement>('.ma-transcript__entry') ?? [])];
    const at = entries.indexOf(document.activeElement as HTMLElement);
    const next = entries[Math.max(0, Math.min(entries.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))];
    next?.focus();
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <section class="ma-transcript" ref={root} aria-label={t('transcript.title')} onKeyDown={onKeyDown}>
      <h1 class="ma-transcript__title">{controller.title.value || t('transcript.title')}</h1>
      {groups.map((group, g) => (
        <div key={g} class="ma-transcript__group">
          {group.chapter && <h2 class="ma-transcript__chapter">{group.chapter}</h2>}
          <ol class="ma-transcript__list">
            {group.entries.map((entry) => (
              <li key={entry.index}>
                <button
                  type="button"
                  class="ma-transcript__entry"
                  aria-current={entry.index === current ? 'step' : undefined}
                  onClick={() => controller.playback.goTo(entry.index + 1)}
                >
                  {entry.line}
                </button>
                {entry.caption && (
                  <p class="ma-transcript__caption">
                    <InlineText text={entry.caption} />
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}
