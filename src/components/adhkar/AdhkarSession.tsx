'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Counter } from '@/components/counter/Counter';
import { NoteEditor } from '@/components/notes/NoteEditor';
import { loadPreferences, persistPreferences } from '@/components/prefs/preferences';
import { feedback } from '@/lib/counter/feedback';
import { formatNumber } from '@/lib/reader/ayah-share';
import { getStore } from '@/lib/store';
import { localDate } from '@/lib/store/refs';

export type DhikrViewPart =
  | { kind: 'text'; text: string }
  | { kind: 'quran'; ayahs: { surah: number; ayah: number; text: string }[]; label: string };

export interface DhikrView {
  id: string;
  order: number;
  parts: DhikrViewPart[];
  count: number;
  reference: string;
  translation: string | null;
}

export interface AdhkarIcons {
  minus: ReactNode;
  reset: ReactNode;
  save: ReactNode;
  saved: ReactNode;
  note: ReactNode;
}

const todayLocal = () => localDate(Date.now());

interface Feedback {
  vibrate: boolean;
  sound: boolean;
  autoAdvance: boolean;
}

/**
 * A category's adhkar with counters (SPEC §7.14). Counts are saved on every tap (AdhkarDay in the
 * local store), survive reloads and start again at local midnight; the category is marked
 * completed when every dhikr reached its count.
 */
export function AdhkarSession({ category, items, icons }: { category: string; items: readonly DhikrView[]; icons: AdhkarIcons }) {
  const t = useTranslations('Adhkar');
  const locale = useLocale();
  const n = (x: number) => formatNumber(x, locale === 'ar');
  const [day, setDay] = useState(todayLocal);
  const [counts, setCounts] = useState<Record<string, number>>({});
  // The latest counts, updated synchronously on every tap (state may lag between quick taps).
  const countsRef = useRef<Record<string, number>>({});
  const [ready, setReady] = useState(false);
  const [storeOk, setStoreOk] = useState(true);
  const [prefs, setPrefs] = useState<Feedback>({ vibrate: true, sound: false, autoAdvance: false });
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    getStore()
      .then((store) =>
        Promise.all([store.adhkar.get(day, category), loadPreferences(), store.saved.list(), store.notes.list()])
      )
      .then(([record, prefsData, savedItems, noteList]) => {
        if (stopped) return;
        countsRef.current = record?.counts ?? {};
        setCounts(countsRef.current);
        setReady(true);
        setPrefs((p) => ({ ...p, ...prefsData?.tasbih, autoAdvance: prefsData?.adhkar?.autoAdvance ?? p.autoAdvance }));
        setSaved(new Set(savedItems.filter((x) => x.type === 'DHIKR').map((x) => x.ref)));
        setNotes(Object.fromEntries(noteList.filter((x) => x.targetType === 'DHIKR').map((x) => [x.targetRef, x.body])));
      })
      .catch(() => {
        if (stopped) return;
        setStoreOk(false);
        setReady(true);
      });
    return () => {
      stopped = true;
    };
  }, [category, day]);

  // A new local day starts with fresh counts (checked on return to the page and every minute).
  useEffect(() => {
    const check = () => {
      const today = todayLocal();
      if (today !== day) {
        setReady(false);
        setDay(today);
      }
    };
    const id = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, [day]);

  function setCount(item: DhikrView, value: number) {
    const today = todayLocal();
    if (today !== day) {
      setReady(false);
      setDay(today);
      return;
    }
    if (!ready) return;
    const next = { ...countsRef.current, [item.id]: Math.max(0, Math.min(item.count, value)) };
    countsRef.current = next;
    setCounts(next);
    const completed = items.every((i) => (next[i.id] ?? 0) >= i.count);
    void getStore()
      .then((s) => s.adhkar.setCount(today, category, item.id, next[item.id]!, completed))
      .catch(() => setStoreOk(false));
  }

  function tap(item: DhikrView, index: number) {
    if (!ready) return;
    const current = countsRef.current[item.id] ?? 0;
    if (current >= item.count) return;
    setCount(item, current + 1);
    const done = current + 1 >= item.count;
    feedback(done ? 'done' : 'tap', prefs);
    if (done && prefs.autoAdvance) {
      const nextCard = document.getElementById(`dhikr-${items[index + 1]?.id.replace(':', '-') ?? ''}`);
      nextCard?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }

  async function toggleSave(id: string) {
    try {
      const store = await getStore();
      const existing = await store.saved.find('DHIKR', id);
      if (existing) await store.saved.remove(existing.id);
      else await store.saved.save('DHIKR', id);
      setSaved((prev) => {
        const next = new Set(prev);
        if (existing) next.delete(id);
        else next.add(id);
        return next;
      });
    } catch {
      setStoreOk(false);
    }
  }

  const doneCount = items.filter((i) => (counts[i.id] ?? 0) >= i.count).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
        <p className="text-sm" role="status">
          {doneCount === items.length ? t('allDone') : t('progress', { done: n(doneCount), total: n(items.length) })}
        </p>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--accent)]"
            checked={prefs.autoAdvance}
            onChange={(e) => {
              setPrefs((p) => ({ ...p, autoAdvance: e.target.checked }));
              persistPreferences({ adhkar: { autoAdvance: e.target.checked } });
            }}
          />
          {t('autoAdvance')}
        </label>
      </div>
      {!storeOk && <p className="rounded-xl bg-surface-raised p-3 text-sm text-ink-muted">{t('storeError')}</p>}

      <ol className="flex flex-col gap-4">
        {items.map((item, index) => {
          const count = counts[item.id] ?? 0;
          const done = count >= item.count;
          const domId = `dhikr-${item.id.replace(':', '-')}`;
          return (
            <li key={item.id}>
              <article
                id={domId}
                aria-labelledby={`${domId}-title`}
                className="dhikr-card"
                data-done={done || undefined}
                onClick={(e) => {
                  if ((e.target as Element).closest('button, a, input, textarea, select, label, form')) return;
                  if (window.getSelection()?.toString()) return;
                  tap(item, index);
                }}
              >
                <h2 id={`${domId}-title`} className="sr-only">
                  {t('dhikrTitle', { n: n(index + 1) })}
                </h2>
                <div className="dhikr-text" lang="ar" dir="rtl">
                  {item.parts.map((p, i) =>
                    p.kind === 'text' ? (
                      <p key={i} data-dhikr-text={item.id}>
                        {p.text}
                      </p>
                    ) : (
                      <blockquote key={i} className="dhikr-quran">
                        <p>
                          {p.ayahs.map((a) => (
                            <span key={a.ayah}>
                              <span data-ayah-text={`${a.surah}:${a.ayah}`}>{a.text}</span>{' '}
                              <span className="ayah-number" role="img" aria-label={t('ayah', { n: a.ayah })} style={{ counterSet: `ayah ${a.ayah}` }} />{' '}
                            </span>
                          ))}
                        </p>
                        <footer className="text-xs text-ink-muted">{p.label}</footer>
                      </blockquote>
                    )
                  )}
                </div>
                {item.translation && (
                  <p lang="en" dir="ltr" className="dhikr-translation">
                    {item.translation}
                  </p>
                )}
                <p className="dhikr-reference">
                  <span className="font-semibold">{t('reference')}: </span>
                  <span lang={locale === 'ar' ? 'ar' : 'en'}>{item.reference}</span>
                </p>
                {notes[item.id] && editing !== item.id && (
                  <p className="whitespace-pre-wrap break-words rounded-xl bg-surface-raised p-3 text-sm">
                    <span className="sr-only">{t('noteLabel')}: </span>
                    {notes[item.id]}
                  </p>
                )}
                {editing === item.id && (
                  <NoteEditor
                    initial={notes[item.id] ?? ''}
                    onCancel={() => setEditing(null)}
                    onSave={async (body) => {
                      await (await getStore()).notes.set('DHIKR', item.id, body);
                      setNotes((prev) => ({ ...prev, [item.id]: body.trim() }));
                      setEditing(null);
                    }}
                    onDelete={async () => {
                      await (await getStore()).notes.set('DHIKR', item.id, '');
                      setNotes((prev) => ({ ...prev, [item.id]: '' }));
                      setEditing(null);
                    }}
                  />
                )}
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <Counter
                    count={count}
                    target={item.count}
                    onIncrement={() => tap(item, index)}
                    onDecrement={() => setCount(item, (countsRef.current[item.id] ?? 0) - 1)}
                    onReset={() => setCount(item, 0)}
                    format={n}
                    disabled={!ready}
                    labels={{ increment: t('tap'), decrement: t('decrement'), reset: t('reset'), done: t('done') }}
                    icons={{ minus: icons.minus, reset: icons.reset }}
                  />
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="icon-button"
                      aria-pressed={saved.has(item.id)}
                      aria-label={saved.has(item.id) ? t('saved') : t('save')}
                      onClick={() => void toggleSave(item.id)}
                    >
                      {saved.has(item.id) ? icons.saved : icons.save}
                    </button>
                    <button type="button" className="icon-button" aria-label={t('note')} onClick={() => setEditing(item.id)}>
                      {icons.note}
                    </button>
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
