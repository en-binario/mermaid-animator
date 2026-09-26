/**
 * Presentation overlays (spec presentation-mode): title and chapter cards, blank screen,
 * laser pointer and the progress hairline. Pure presentation; state lives in main.tsx.
 */
import { useEffect, useRef } from 'preact/hooks';

export function TitleCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div class="ma-card ma-card--title" role="status">
      <h1 class="ma-card__title">{title}</h1>
      <p class="ma-card__subtitle">{subtitle}</p>
    </div>
  );
}

export function ChapterCard({ label, title }: { label: string; title: string }) {
  return (
    <div class="ma-card ma-card--chapter" role="status">
      <p class="ma-card__eyebrow">{label}</p>
      <h2 class="ma-card__title">{title}</h2>
    </div>
  );
}

export function BlankScreen() {
  return <div class="ma-blank" aria-hidden="true" />;
}

export function Hairline({ fraction }: { fraction: number }) {
  return (
    <div class="ma-hairline" aria-hidden="true">
      <div class="ma-hairline__bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, fraction))})` }} />
    </div>
  );
}

const TRAIL = 12;

/** A soft brass dot with a short fading trail following the pointer (static dot under reduced motion). */
export function LaserPointer({ reducedMotion }: { reducedMotion: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const points: { x: number; y: number }[] = [];
    let frame = 0;
    const brass = getComputedStyle(document.documentElement).getPropertyValue('--ma-brass').trim() || '#8C6A3A';
    const resize = () => {
      const rect = el.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      el.width = Math.round(rect.width * ratio);
      el.height = Math.round(rect.height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      const head = points[points.length - 1];
      if (!head) return;
      ctx.fillStyle = brass;
      if (!reducedMotion) {
        points.forEach((p, i) => {
          ctx.globalAlpha = ((i + 1) / points.length) * 0.35;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2 + (4 * (i + 1)) / points.length, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(head.x, head.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.arc(head.x, head.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    };
    const move = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      points.push({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      while (points.length > (reducedMotion ? 1 : TRAIL)) points.shift();
      if (!frame) frame = requestAnimationFrame(draw);
    };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', move);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', move);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [reducedMotion]);
  return <canvas class="ma-laser" ref={canvas} aria-hidden="true" />;
}
