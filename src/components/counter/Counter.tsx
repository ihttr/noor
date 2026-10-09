'use client';

import type { ReactNode } from 'react';

/**
 * The counter shared by the adhkar cards and the tasbih (SPEC §7.14–7.15): a progress ring with
 * "count / target", a large +1 target, −1 and reset. Digits follow the locale formatter given.
 */
export function Counter({
  count,
  target,
  onIncrement,
  onDecrement,
  onReset,
  format,
  labels,
  icons,
  size = 'card',
  disabled = false,
}: {
  count: number;
  /** null: no target (open count). */
  target: number | null;
  onIncrement: () => void;
  onDecrement: () => void;
  onReset: () => void;
  format: (n: number) => string;
  labels: { increment: string; decrement: string; reset: string; done: string };
  icons: { minus: ReactNode; reset: ReactNode };
  size?: 'card' | 'large';
  /** While the saved count is loading. */
  disabled?: boolean;
}) {
  const done = target !== null && count >= target;
  const progress = target ? Math.min(1, count / target) : 0;
  const r = 44;
  const circumference = 2 * Math.PI * r;
  const value = target === null ? format(count) : `${format(count)} / ${format(target)}`;

  return (
    <div className={`counter counter-${size}`} data-done={done || undefined}>
      <button
        type="button"
        className="counter-main"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onIncrement();
        }}
        aria-label={`${labels.increment}: ${value}${done ? ` — ${labels.done}` : ''}`}
      >
        <svg viewBox="0 0 100 100" aria-hidden="true" className="counter-ring">
          <circle cx="50" cy="50" r={r} className="counter-track" />
          <circle
            cx="50"
            cy="50"
            r={r}
            className="counter-progress"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
          />
        </svg>
        <span className="counter-value" aria-hidden="true">
          {value}
        </span>
        {done && (
          <span className="counter-done" aria-hidden="true">
            {labels.done}
          </span>
        )}
      </button>
      <div className="counter-actions">
        <button
          type="button"
          className="icon-button"
          aria-label={labels.decrement}
          disabled={disabled || count === 0}
          onClick={(e) => {
            e.stopPropagation();
            onDecrement();
          }}
        >
          {icons.minus}
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={labels.reset}
          disabled={disabled || count === 0}
          onClick={(e) => {
            e.stopPropagation();
            onReset();
          }}
        >
          {icons.reset}
        </button>
      </div>
    </div>
  );
}
