// The bundled city list (SPEC §3, §7.16): GeoNames cities15000, CC BY 4.0. Loaded only when the
// user searches for a city, so the search is offline-capable and private (nothing is sent anywhere).

/**
 * [name, country code, region index (-1: none), latitude, longitude, time zone index,
 * Arabic-script names for search ("|"-separated)]. Ordered by population, largest first.
 */
export type CityRow = [string, string, number, number, number, number, string];

export interface CityList {
  schemaVersion: 1;
  source: { name: string; url: string; license: string; attribution: string; files: { path: string; sha256: string }[] };
  timeZones: string[];
  /** `${country}.${code}` region names (English), referenced by index. */
  regions: string[];
  cities: CityRow[];
}

/** A chosen place for prayer times and qibla; stays on this device (SPEC §5). */
export interface Place {
  /** GeoNames id, or null for "my location". */
  id: number | null;
  name: string;
  country: string | null;
  region: string | null;
  latitude: number;
  longitude: number;
  timeZone: string;
}
