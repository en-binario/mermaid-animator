import type { DiagramController } from './controller';
import { parseInline, type Translate } from './narrative';

/** Caption text with the whitelist markup rendered as elements — never as HTML. */
export function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((node, i) =>
        node.kind === 'bold' ? <strong key={i}>{node.text}</strong> : node.kind === 'italic' ? <em key={i}>{node.text}</em> : node.kind === 'code' ? <code key={i}>{node.text}</code> : node.text,
      )}
    </>
  );
}

/** The caption strip below the canvas (spec narrative); hidden when no step has a caption. */
export function CaptionStrip({ controller, presenting }: { controller: DiagramController; presenting: boolean }) {
  const steps = controller.stepList.value;
  if (!controller.effective.value.showCaptions || !steps.some((s) => s.caption || s.lanes?.some((l) => l.caption))) return null;
  const step = steps[controller.snapshot.value.displayStep - 1];
  const caption = step?.caption ?? '';
  return (
    <div class={`ma-caption${presenting ? ' ma-caption--presenting' : ''}`} aria-hidden="true">
      {/* Keyed by text so a change cross-fades; the live region announces captions separately. */}
      <p key={caption} class="ma-caption__text">
        <InlineText text={caption} />
      </p>
    </div>
  );
}

/** Branch chips on the canvas while an `ask` choice is pending (spec step-compilation). */
export function ChoiceChips({ controller, t }: { controller: DiagramController; t: Translate }) {
  const snap = controller.snapshot.value;
  if (snap.playing || snap.animating || snap.scrubbing) return null;
  const choice = controller.pendingChoice(snap.displayStep);
  if (!choice) return null;
  const fragment = controller.fragments.value.find((f) => f.key === choice.fragmentKey);
  const name = fragment ? `${fragment.kind} ${fragment.label}`.trim() : '';
  return (
    <div class="ma-choice" role="group" aria-label={t('choice.prompt', name)}>
      <span class="ma-choice__prompt">{t('choice.prompt', name)}</span>
      <div class="ma-choice__chips">
        {choice.labels.map((label, i) => (
          <button key={i} type="button" class="ma-chip ma-chip--branch" onClick={() => void controller.choose(choice.fragmentKey, i, true)}>
            {label ? `[${label}]` : `#${i + 1}`}
          </button>
        ))}
      </div>
    </div>
  );
}
