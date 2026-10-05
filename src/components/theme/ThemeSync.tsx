'use client';

import { useEffect } from 'react';
import { watchSystemScheme } from './theme-store';

/** Keeps the "system" theme in step with the OS setting while the app is open. */
export function ThemeSync() {
  useEffect(() => watchSystemScheme(), []);
  return null;
}
