'use client';

// Which account this browser is signed in to (the session cookie itself is httpOnly). Only a hint
// for when to sync; the server always checks the session.

const KEY = 'noor:account';
export const ACCOUNT_EVENT = 'noor:account';

export interface AccountHint {
  id: string;
  email: string;
}

export function getAccount(): AccountHint | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return value && typeof value === 'object' && 'id' in value ? (value as AccountHint) : null;
  } catch {
    return null;
  }
}

export function setAccount(account: AccountHint | null): void {
  try {
    if (account) localStorage.setItem(KEY, JSON.stringify(account));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: sync works for this page view.
  }
  window.dispatchEvent(new Event(ACCOUNT_EVENT));
}
