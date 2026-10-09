'use client';

// The audio player (SPEC §7.11): per-ayah streaming from the approved source, a surah played by
// sequencing ayah files with the next one preloaded, repeat ayah ×N, repeat surah or range,
// speed, reciter, and Media Session controls. A module-level store, so playback and state
// survive client-side navigation; the UI (MiniPlayer) and the reader subscribe to it.

import { loadPreferences, persistPreferences } from '@/components/prefs/preferences';
import { clampRange, nextStep, stepAyah, type RepeatMode } from '@/lib/audio/queue';
import { ayahAudioUrl, type Reciter, type ReciterList } from '@/lib/audio/types';
import { loadNav } from '@/lib/quran/client';
import type { NavData } from '@/lib/quran/nav';
import { audioElement } from './audio-element';

export interface PlayerState {
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';
  surah: number;
  ayah: number;
  ayahCount: number;
  played: number;
  reciter: string;
  speed: number;
  repeatAyah: number;
  repeat: RepeatMode;
  range: { from: number; to: number } | null;
  autoScroll: boolean;
}

/** Fired on window for the reader (highlight, reading time) and the layout (mini player). */
export const AUDIO_EVENT = 'noor:audio';
export interface AudioEventDetail {
  surah: number;
  ayah: number;
  playing: boolean;
  active: boolean;
  autoScroll: boolean;
}

let state: PlayerState = {
  status: 'idle',
  surah: 1,
  ayah: 1,
  ayahCount: 7,
  played: 1,
  reciter: 'ar.alafasy',
  speed: 1,
  repeatAyah: 1,
  repeat: 'off',
  range: null,
  autoScroll: true,
};
const listeners = new Set<() => void>();
let reciters: ReciterList | null = null;
let nav: NavData | null = null;
let ready: Promise<void> | undefined;
let switching = false;
const preload = typeof Audio === 'function' ? new Audio() : null;
if (preload) preload.preload = 'auto';

export const getPlayerState = () => state;
export const getReciters = () => reciters;
export const getNav = () => nav;

export function subscribePlayer(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function set(patch: Partial<PlayerState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
  const active = state.status !== 'idle';
  document.documentElement.toggleAttribute('data-player', active);
  window.dispatchEvent(
    new CustomEvent<AudioEventDetail>(AUDIO_EVENT, {
      detail: { surah: state.surah, ayah: state.ayah, playing: state.status === 'playing', active, autoScroll: state.autoScroll },
    })
  );
  updateMediaSession();
}

function init(): Promise<void> {
  ready ??= (async () => {
    const [list, n] = await Promise.all([
      fetch('/api/audio/reciters').then((r) => {
        if (!r.ok) throw new Error(`reciters ${r.status}`);
        return r.json() as Promise<ReciterList>;
      }),
      loadNav(),
    ]);
    reciters = list;
    nav = n;
    let saved: { reciter: string; speed: number; autoScroll: boolean } | undefined;
    try {
      saved = (await loadPreferences()).audio;
    } catch {
      // No local store: defaults.
    }
    const reciter = saved && list.reciters.some((r) => r.id === saved.reciter) ? saved.reciter : list.defaultReciter;
    state = { ...state, reciter, speed: saved?.speed ?? 1, autoScroll: saved?.autoScroll ?? true };

    const audio = audioElement();
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', () => {
      if (audio.src && !audio.src.startsWith('data:')) set({ status: 'error' });
    });
    // Changing the source fires a "pause" of the old file: ignore it until the new one starts.
    audio.addEventListener('play', () => (switching = false));
    audio.addEventListener('pause', () => {
      if (!switching && !audio.ended && (state.status === 'playing' || state.status === 'loading')) set({ status: 'paused' });
    });
    audio.addEventListener('playing', () => set({ status: 'playing' }));
    audio.addEventListener('waiting', () => !audio.paused && set({ status: 'loading' }));
    setupMediaSession();
    window.addEventListener('noor:audio-query', announce);
  })().catch((error: unknown) => {
    ready = undefined;
    throw error;
  });
  return ready;
}

const currentReciter = (): Reciter | undefined => reciters?.reciters.find((r) => r.id === state.reciter);

function urlOf(ayah: number): string | null {
  const reciter = currentReciter();
  const surah = nav?.surahs[state.surah - 1];
  if (!reciters || !reciter || !surah) return null;
  return ayahAudioUrl(reciters, reciter, surah.startIndex + ayah);
}

async function playCurrent(): Promise<void> {
  const url = urlOf(state.ayah);
  if (!url) return set({ status: 'error' });
  const audio = audioElement();
  set({ status: 'loading' });
  switching = true;
  audio.src = url;
  audio.playbackRate = state.speed;
  try {
    await audio.play();
  } catch (error) {
    const name = (error as DOMException).name;
    // AbortError: a newer ayah replaced this one. NotAllowedError: autoplay refused, wait for play.
    if (name === 'AbortError') return;
    switching = false;
    set({ status: name === 'NotAllowedError' ? 'paused' : 'error' });
    return;
  }
  // Preload only the next ayah (SPEC §11).
  const next = nextStep(state);
  const nextUrl = next && next.ayah !== state.ayah ? urlOf(next.ayah) : null;
  if (preload && nextUrl && preload.src !== nextUrl) preload.src = nextUrl;
}

function onEnded(): void {
  const next = nextStep(state);
  if (!next) return set({ status: 'ended' });
  state = { ...state, ayah: next.ayah, played: next.played };
  void playCurrent();
}

const savePrefs = () => persistPreferences({ audio: { reciter: state.reciter, speed: state.speed, autoScroll: state.autoScroll } });

// --- commands -----------------------------------------------------------------------------

export async function playFrom(surah: number, ayah: number): Promise<void> {
  await init();
  const count = nav?.surahs[surah - 1]?.ayahCount ?? 0;
  if (!count || ayah < 1 || ayah > count) return;
  state = { ...state, surah, ayah, ayahCount: count, played: 1, range: state.repeat === 'range' ? null : state.range };
  if (state.repeat === 'range') state.repeat = 'off';
  await playCurrent();
}

export function togglePlay(): void {
  const audio = audioElement();
  if (state.status === 'playing' || state.status === 'loading') {
    switching = false;
    audio.pause();
    set({ status: 'paused' });
  }
  else if (state.status === 'ended') {
    state = { ...state, ayah: state.repeat === 'range' && state.range ? state.range.from : 1, played: 1 };
    void playCurrent();
  } else if (audio.src && !audio.src.startsWith('data:') && state.status !== 'error') void audio.play().catch(() => set({ status: 'paused' }));
  else void playCurrent();
}

export function goAyah(step: -1 | 1): void {
  state = { ...state, ayah: stepAyah(state, step), played: 1 };
  void playCurrent();
}

export function setSpeed(speed: number): void {
  audioElement().playbackRate = speed;
  set({ speed });
  savePrefs();
}

export function setReciter(id: string): void {
  if (!reciters?.reciters.some((r) => r.id === id)) return;
  set({ reciter: id });
  savePrefs();
  if (state.status === 'playing' || state.status === 'loading') void playCurrent();
}

export function setRepeatAyah(times: number): void {
  set({ repeatAyah: times, played: Math.min(state.played, times) });
}

export function setRepeat(repeat: RepeatMode, range?: { from: number; to: number }): void {
  const r = repeat === 'range' ? clampRange(range?.from ?? state.ayah, range?.to ?? state.ayahCount, state.ayahCount) : null;
  set({ repeat: repeat === 'range' && !r ? 'off' : repeat, range: r });
}

export function setAutoScroll(on: boolean): void {
  set({ autoScroll: on });
  savePrefs();
}

export function stop(): void {
  const audio = audioElement();
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  set({ status: 'idle' });
}

/** Re-announces the current ayah (a reader that mounts while audio plays highlights it). */
export function announce(): void {
  if (state.status !== 'idle') set({});
}

// --- Media Session (lock screen, headset buttons) -------------------------------------------

function setupMediaSession(): void {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  const handle = (action: MediaSessionAction, fn: () => void) => {
    try {
      ms.setActionHandler(action, fn);
    } catch {
      // Unsupported action on this browser.
    }
  };
  handle('play', () => togglePlay());
  handle('pause', () => audioElement().pause());
  handle('previoustrack', () => goAyah(-1));
  handle('nexttrack', () => goAyah(1));
  handle('stop', () => stop());
}

function updateMediaSession(): void {
  if (!('mediaSession' in navigator) || typeof MediaMetadata !== 'function') return;
  const ms = navigator.mediaSession;
  if (state.status === 'idle') {
    ms.metadata = null;
    ms.playbackState = 'none';
    return;
  }
  const ar = document.documentElement.lang === 'ar';
  const surah = nav?.surahs[state.surah - 1];
  const reciter = currentReciter();
  const surahName = surah ? (ar ? surah.name : surah.transliteration) : String(state.surah);
  ms.metadata = new MediaMetadata({
    title: ar ? `${surahName} · الآية ${state.ayah.toLocaleString('ar-u-nu-arab')}` : `${surahName} · Ayah ${state.ayah}`,
    artist: reciter ? (ar ? reciter.name.ar : reciter.name.en) : '',
    album: ar ? 'نور' : 'Noor',
  });
  ms.playbackState = state.status === 'playing' ? 'playing' : 'paused';
}
