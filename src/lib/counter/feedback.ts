// Tap feedback for counters (SPEC §7.15): vibration where the browser supports it (not iOS
// Safari — the toggle is hidden there) and an optional short tone, off by default.

export const canVibrate = (): boolean => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

let context: AudioContext | undefined;

export function feedback(kind: 'tap' | 'done', options: { vibrate: boolean; sound: boolean }): void {
  if (options.vibrate && canVibrate()) navigator.vibrate(kind === 'done' ? [60, 40, 60] : 12);
  if (options.sound && typeof AudioContext === 'function') {
    try {
      context ??= new AudioContext();
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.frequency.value = kind === 'done' ? 660 : 880;
      gain.gain.setValueAtTime(0.05, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + (kind === 'done' ? 0.35 : 0.06));
      osc.connect(gain).connect(context.destination);
      osc.start();
      osc.stop(context.currentTime + (kind === 'done' ? 0.35 : 0.06));
    } catch {
      // No audio output: silent.
    }
  }
}
