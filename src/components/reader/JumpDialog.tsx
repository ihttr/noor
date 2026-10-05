'use client';

import { useTranslations } from 'next-intl';
import { useState, type FormEvent, type ReactNode, type Ref } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { jumpStart, readerHref, type JumpTarget, type NavData, type ReaderMode } from '@/lib/quran/nav';
import { parseAyahRef } from '@/lib/quran/refs';
import { toAsciiDigits } from '@/lib/quran/normalize';

// Navigation data (names + structure, no Quran text) is fetched once, when first needed.
let navPromise: Promise<NavData> | undefined;
export function loadNav(): Promise<NavData> {
  navPromise ??= fetch('/api/quran/nav').then((r) => {
    if (!r.ok) throw new Error(`nav ${r.status}`);
    return r.json() as Promise<NavData>;
  });
  return navPromise;
}

const LIMITS = { page: 604, juz: 30, hizb: 60, quarter: 240 } as const;
type NumberKind = keyof typeof LIMITS;

/** Go to a surah/ayah, page, juz, hizb or hizb quarter (SPEC §7.3), in the current reading mode. */
export function JumpDialog({
  ref,
  mode,
  closeIcon,
  onSamePage,
}: {
  ref?: Ref<HTMLDialogElement>;
  mode: ReaderMode;
  closeIcon: ReactNode;
  /** Scrolls to and focuses an ayah already on this page (by element id). */
  onSamePage: (id: string) => void;
}) {
  const t = useTranslations('Reader');
  const router = useRouter();
  const pathname = usePathname();
  const [error, setError] = useState<string | null>(null);

  async function go(target: JumpTarget | null, form: HTMLFormElement) {
    if (!target) return setError(t('jumpInvalid'));
    const nav = await loadNav();
    const start = jumpStart(nav, target);
    if (!start) return setError(t('jumpOutOfRange'));
    setError(null);
    form.closest('dialog')?.close();
    const href = readerHref(nav, start, mode);
    const [path, hash] = href.split('#');
    if (path === pathname && hash) {
      router.replace(href, { scroll: false });
      onSamePage(hash);
    } else {
      router.push(href);
    }
  }

  async function onRef(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const value = String(new FormData(form).get('ref') ?? '');
    const nav = await loadNav();
    const parsed = parseAyahRef(value, nav.surahs);
    await go(parsed && { kind: 'ayah', surah: parsed.surah, ayah: parsed.ayah }, form);
  }

  async function onNumber(e: FormEvent<HTMLFormElement>, kind: NumberKind) {
    e.preventDefault();
    const form = e.currentTarget;
    const n = Number(toAsciiDigits(String(new FormData(form).get('n') ?? '')).trim());
    await go(Number.isInteger(n) && n >= 1 && n <= LIMITS[kind] ? { kind, number: n } : null, form);
  }

  const labels: Record<NumberKind, string> = {
    page: t('jumpPage'),
    juz: t('jumpJuz'),
    hizb: t('jumpHizb'),
    quarter: t('jumpQuarter'),
  };

  return (
    <dialog
      ref={ref}
      className="reader-dialog"
      aria-labelledby="jump-title"
      onClose={() => setError(null)}
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="jump-title" className="text-lg font-semibold">
          {t('jump')}
        </h2>
        <button
          type="button"
          onClick={(e) => e.currentTarget.closest('dialog')?.close()}
          className="icon-button"
          aria-label={t('close')}
        >
          {closeIcon}
        </button>
      </div>

      <form className="mt-5 flex flex-col gap-2" onSubmit={onRef}>
        <label htmlFor="jump-ref" className="text-sm font-semibold">
          {t('jumpRef')}
        </label>
        <div className="flex gap-2">
          <input
            id="jump-ref"
            name="ref"
            className="text-field flex-1"
            autoComplete="off"
            aria-describedby="jump-ref-hint jump-error"
            autoFocus
          />
          <button type="submit" className="primary-button">
            {t('jumpGo')}
          </button>
        </div>
        <p id="jump-ref-hint" className="text-xs text-ink-muted">
          {t('jumpRefHint')}
        </p>
      </form>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {(Object.keys(LIMITS) as NumberKind[]).map((kind) => (
          <form key={kind} className="flex flex-col gap-1" onSubmit={(e) => onNumber(e, kind)}>
            <label htmlFor={`jump-${kind}`} className="text-sm font-semibold">
              {labels[kind]} <span className="font-normal text-ink-muted tabular-nums">(1–{LIMITS[kind]})</span>
            </label>
            <div className="flex gap-2">
              <input
                id={`jump-${kind}`}
                name="n"
                inputMode="numeric"
                className="text-field w-full min-w-0"
                autoComplete="off"
                aria-describedby="jump-error"
              />
              <button type="submit" className="primary-button" aria-label={`${t('jumpGo')}: ${labels[kind]}`}>
                {t('jumpGo')}
              </button>
            </div>
          </form>
        ))}
      </div>

      <p id="jump-error" role="alert" className="mt-4 min-h-5 text-sm font-semibold text-accent">
        {error}
      </p>
    </dialog>
  );
}
