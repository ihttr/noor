'use client';

import type { CityList, Place } from '@/lib/cities/types';
import { getStore } from '@/lib/store';

// The chosen place stays on this device by default (SPEC §5 "location privacy"). Signed-in
// users can opt in to syncing it: it is then also kept in the synced preferences
// (`prayerPlace`), and that copy wins on every device.
const KEY = 'prayer-place';

export async function loadPlace(): Promise<Place | null> {
  try {
    const store = await getStore();
    return (await store.preferences.get())?.prayerPlace ?? (await store.device.get<Place>(KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function savePlace(place: Place | null): Promise<void> {
  const store = await getStore();
  if (place) await store.device.set(KEY, place);
  else await store.device.remove(KEY);
  // Removing the place also stops sharing it.
  if ((await store.preferences.get())?.prayerPlace) await store.preferences.update({ prayerPlace: place });
}

/** Whether the prayer location is synced with the account (explicit opt-in). */
export async function isPlaceShared(): Promise<boolean> {
  return Boolean((await (await getStore()).preferences.get())?.prayerPlace);
}

/** Turns syncing of the prayer location on (needs a chosen place) or off. */
export async function setPlaceShared(shared: boolean): Promise<boolean> {
  const store = await getStore();
  const place = (await store.preferences.get())?.prayerPlace ?? (await store.device.get<Place>(KEY)) ?? null;
  if (shared && !place) return false;
  if (place) await store.device.set(KEY, place);
  await store.preferences.update({ prayerPlace: shared ? place : null });
  return true;
}

let cities: Promise<CityList> | undefined;

/** The bundled city list (~740 KB gzipped), fetched once when the user starts searching. */
export function loadCities(): Promise<CityList> {
  cities ??= fetch('/api/cities').then((r) => {
    if (!r.ok) throw new Error(`cities ${r.status}`);
    return r.json() as Promise<CityList>;
  });
  cities.catch(() => (cities = undefined));
  return cities;
}
