'use client';

// The one <audio> element of the app. It lives in a module, not in a component, so playback
// survives client-side navigation (SPEC §7.11: persistent player).

const SILENCE = 'data:audio/wav;base64,UklGRiUAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQEAAACA';

let element: HTMLAudioElement | undefined;

export function audioElement(): HTMLAudioElement {
  element ??= new Audio();
  return element;
}

/**
 * Called synchronously inside the tap that starts playback, before the player code has loaded:
 * mobile browsers (iOS Safari in particular) only let media start from a user gesture.
 */
export function unlockAudio(): void {
  const el = audioElement();
  if (el.src) return;
  el.src = SILENCE;
  el.play().catch(() => undefined);
}
