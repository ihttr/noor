'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Counter } from '@/components/counter/Counter';
import { loadPreferences, persistPreferences } from '@/components/prefs/preferences';
import { canVibrate, feedback } from '@/lib/counter/feedback';
import { formatNumber } from '@/lib/reader/ayah-share';
import { getStore } from '@/lib/store';
import { TASBIH_PHRASE_MAX_LENGTH, type TasbihSessionRecord } from '@/lib/store/types';

export const TASBIH_TARGETS = [33, 99, 100] as const;
const CUSTOM = '__custom__';
const noSubscription = () => () => undefined;

/** Tasbih (SPEC §7.15): preset or own phrase, target 33/99/100/custom, history of the last 30 sessions. */
export function TasbihView({ presets, icons }: { presets: readonly string[]; icons: { minus: ReactNode; reset: ReactNode } }) {
  const t = useTranslations('Tasbih');
  const locale = useLocale();
  const id = useId();
  const n = (x: number) => formatNumber(x, locale === 'ar');
  const [session, setSession] = useState<TasbihSessionRecord | null>(null);
  // The latest session, updated synchronously on every tap (state may lag between quick taps).
  const sessionRef = useRef<TasbihSessionRecord | null>(null);
  // Store writes run one after another, in tap order.
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [history, setHistory] = useState<TasbihSessionRecord[]>([]);
  const [phrase, setPhrase] = useState(presets[0]!);
  const [customPhrase, setCustomPhrase] = useState('');
  const [target, setTarget] = useState<number | null>(33);
  const [customTarget, setCustomTarget] = useState('');
  const [prefs, setPrefs] = useState({ vibrate: true, sound: false });
  // Hidden where unsupported (iOS Safari has no navigator.vibrate, SPEC §14).
  const vibrationSupported = useSyncExternalStore(noSubscription, canVibrate, () => false);
  const [error, setError] = useState(false);
  const isCustomPhrase = !presets.includes(phrase);

  const show = (s: TasbihSessionRecord | null) => {
    sessionRef.current = s;
    setSession(s);
  };
  const enqueue = (task: () => Promise<unknown>) => {
    writes.current = writes.current.then(task).catch(() => setError(true));
  };
  // Empty sessions left by switching phrases are not worth listing.
  const visible = (list: TasbihSessionRecord[]) => list.filter((h) => h.endedAt === null || h.count > 0);

  // Load the running session (or start one, so every tap has a session to count in).
  useEffect(() => {
    let stopped = false;
    getStore()
      .then(async (store) => {
        const [running, p] = await Promise.all([store.tasbih.current(), loadPreferences()]);
        const current = running ?? (await store.tasbih.start(presets[0]!, 33));
        const list = await store.tasbih.history(30);
        if (stopped) return;
        sessionRef.current = current;
        setSession(current);
        setPhrase(current.phrase);
        if (!presets.includes(current.phrase)) setCustomPhrase(current.phrase);
        setTarget(current.target);
        setHistory(visible(list));
        if (p?.tasbih) setPrefs(p.tasbih);
        setReady(true);
      })
      .catch(() => {
        if (stopped) return;
        // No local store: count in memory only.
        const now = Date.now();
        const local = { id: 'local', createdAt: now, updatedAt: now, deletedAt: null, phrase: presets[0]!, count: 0, target: 33, startedAt: now, endedAt: null };
        sessionRef.current = local;
        setSession(local);
        setError(true);
        setReady(true);
      });
    return () => {
      stopped = true;
    };
  }, [presets]);

  function change(delta: number) {
    if (!ready) return;
    if (phrase === CUSTOM) return document.getElementById(`${id}-phrase`)?.focus();
    const s = sessionRef.current;
    if (!s) return;
    const updated = { ...s, count: Math.max(0, s.count + delta) };
    show(updated);
    if (delta > 0) feedback(updated.target !== null && updated.count === updated.target ? 'done' : 'tap', prefs);
    enqueue(async () => {
      const store = await getStore();
      await store.tasbih.update(updated.id, { count: updated.count });
      setHistory(visible(await store.tasbih.history(30)));
    });
  }

  function startNew(nextPhrase: string, nextTarget: number | null) {
    sessionRef.current = null;
    enqueue(async () => {
      const store = await getStore();
      show(await store.tasbih.start(nextPhrase, nextTarget));
      setHistory(visible(await store.tasbih.history(30)));
    });
  }

  function reset() {
    if (!sessionRef.current || !window.confirm(t('resetConfirm'))) return;
    startNew(phrase, target);
  }

  function choosePhrase(value: string) {
    setPhrase(value);
    if (value !== CUSTOM && sessionRef.current?.phrase !== value) startNew(value, target);
  }

  function chooseTarget(value: number | null) {
    setTarget(value);
    const s = sessionRef.current;
    if (!s) return;
    show({ ...s, target: value });
    enqueue(async () => (await getStore()).tasbih.update(s.id, { target: value }));
  }

  const count = session?.count ?? 0;
  const date = (ms: number) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(ms);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t('phrase')}</legend>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <label key={p} className="choice-chip" lang="ar">
                <input type="radio" name="tasbih-phrase" className="sr-only" checked={phrase === p} onChange={() => choosePhrase(p)} />
                {p}
              </label>
            ))}
            <label className="choice-chip">
              <input
                type="radio"
                name="tasbih-phrase"
                className="sr-only"
                checked={isCustomPhrase}
                onChange={() => choosePhrase(customPhrase.trim() || CUSTOM)}
              />
              {t('custom')}
            </label>
          </div>
          {isCustomPhrase && (
            <div className="mt-2 flex flex-col gap-1">
              <label htmlFor={`${id}-phrase`} className="text-sm">
                {t('customPhrase')}
              </label>
              <input
                id={`${id}-phrase`}
                className="text-field"
                value={customPhrase}
                maxLength={TASBIH_PHRASE_MAX_LENGTH}
                onChange={(e) => setCustomPhrase(e.target.value)}
                onBlur={() => customPhrase.trim() && choosePhrase(customPhrase.trim())}
              />
            </div>
          )}
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t('target')}</legend>
          <div className="flex flex-wrap gap-2">
            {TASBIH_TARGETS.map((v) => (
              <label key={v} className="choice-chip">
                <input type="radio" name="tasbih-target" className="sr-only" checked={target === v} onChange={() => chooseTarget(v)} />
                {n(v)}
              </label>
            ))}
            <label className="choice-chip">
              <input
                type="radio"
                name="tasbih-target"
                className="sr-only"
                checked={target !== null && !(TASBIH_TARGETS as readonly number[]).includes(target)}
                onChange={() => chooseTarget(Number(customTarget) > 0 ? Math.round(Number(customTarget)) : 1000)}
              />
              {t('custom')}
            </label>
            <label className="choice-chip">
              <input type="radio" name="tasbih-target" className="sr-only" checked={target === null} onChange={() => chooseTarget(null)} />
              {t('noTarget')}
            </label>
          </div>
          {target !== null && !(TASBIH_TARGETS as readonly number[]).includes(target) && (
            <div className="mt-2 flex flex-col gap-1">
              <label htmlFor={`${id}-target`} className="text-sm">
                {t('customTarget')}
              </label>
              <input
                id={`${id}-target`}
                type="number"
                min={1}
                max={100000}
                inputMode="numeric"
                className="text-field w-40"
                value={customTarget || String(target)}
                onChange={(e) => setCustomTarget(e.target.value)}
                onBlur={() => Number(customTarget) > 0 && chooseTarget(Math.min(100000, Math.round(Number(customTarget))))}
              />
            </div>
          )}
        </fieldset>
      </div>

      <section aria-label={t('counter')} className="flex flex-col items-center gap-3">
        <p className="text-center text-2xl font-semibold" lang={isCustomPhrase ? undefined : 'ar'} data-testid="tasbih-phrase">
          {phrase === CUSTOM ? t('customPhrase') : phrase}
        </p>
        <Counter
          size="large"
          count={count}
          target={target}
          onIncrement={() => change(1)}
          onDecrement={() => change(-1)}
          onReset={reset}
          format={n}
          disabled={!ready}
          labels={{ increment: t('increment'), decrement: t('decrement'), reset: t('reset'), done: t('done') }}
          icons={icons}
        />
      </section>

      <div className="flex flex-wrap gap-4 rounded-2xl border border-line bg-surface p-4 text-sm">
        {vibrationSupported && (
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-[var(--accent)]"
              checked={prefs.vibrate}
              onChange={(e) => {
                const next = { ...prefs, vibrate: e.target.checked };
                setPrefs(next);
                persistPreferences({ tasbih: next });
              }}
            />
            {t('vibrate')}
          </label>
        )}
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            className="size-4 accent-[var(--accent)]"
            checked={prefs.sound}
            onChange={(e) => {
              const next = { ...prefs, sound: e.target.checked };
              setPrefs(next);
              persistPreferences({ tasbih: next });
            }}
          />
          {t('sound')}
        </label>
      </div>
      {error && <p className="text-sm text-ink-muted">{t('storeError')}</p>}

      <section aria-labelledby={`${id}-history`} className="flex flex-col gap-2">
        <h2 id={`${id}-history`} className="text-lg font-semibold">
          {t('history')}
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('noHistory')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="min-w-0 truncate">{h.phrase}</span>
                <span className="shrink-0 tabular-nums">{h.target ? `${n(h.count)} / ${n(h.target)}` : n(h.count)}</span>
                <span className="shrink-0 text-xs text-ink-muted">{h.endedAt === null ? t('current') : date(h.startedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
