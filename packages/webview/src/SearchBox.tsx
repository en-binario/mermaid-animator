import { useEffect, useRef, useState } from 'preact/hooks';
import type { DiagramController } from './controller';
import type { Translate } from './narrative';
import { search } from './search';

/** Search field with results (spec exploration): `/` or Ctrl/Cmd+F; Enter seeks; Esc closes. */
export function SearchBox({ controller, t, close }: { controller: DiagramController; t: Translate; close: () => void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = search(controller.searchIndex.value, query);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    controller.setMatches(results);
    setSelected(0);
  }, [query]);
  useEffect(() => () => controller.setMatches([]), []);

  const seek = (i: number) => {
    const hit = results[i];
    if (hit?.step !== undefined) controller.playback.goTo(hit.step + 1);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') setSelected((s) => Math.min(results.length - 1, s + 1));
    else if (e.key === 'ArrowUp') setSelected((s) => Math.max(0, s - 1));
    else if (e.key === 'Enter') seek(selected);
    else return;
    e.preventDefault();
  };
  const listId = 'ma-search-results';

  return (
    <div class="ma-popover ma-search" role="search">
      <input
        ref={input}
        class="ma-input"
        type="search"
        role="combobox"
        aria-label={t('search.label')}
        aria-expanded={results.length > 0}
        aria-controls={listId}
        aria-activedescendant={results.length ? `ma-search-${selected}` : undefined}
        placeholder={t('search.placeholder')}
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        onKeyDown={onKeyDown}
      />
      {query.trim() && (
        <div class="ma-search__status" role="status">
          {results.length ? t('search.count', results.length) : t('search.none')}
        </div>
      )}
      {results.length > 0 && (
        <ul id={listId} class="ma-search__results" role="listbox" aria-label={t('search.label')}>
          {results.map((r, i) => (
            <li
              key={`${r.kind}-${r.elementId ?? r.step}-${i}`}
              id={`ma-search-${i}`}
              role="option"
              aria-selected={i === selected}
              class={`ma-search__result${i === selected ? ' ma-search__result--selected' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setSelected(i);
                seek(i);
              }}
            >
              <span class="ma-search__kind">{t(`search.${r.kind}`)}</span>
              <span class="ma-search__text">{r.text}</span>
              <span class="ma-search__step">{r.step === undefined ? t('search.unplayed') : t('search.step', r.step + 1)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
