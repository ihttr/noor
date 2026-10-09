// Audio content (SPEC §7.11): the approved reciter list (Islamic Network CDN, streaming only).

export interface Reciter {
  /** Islamic Network edition identifier, e.g. "ar.alafasy". */
  id: string;
  name: { ar: string; en: string };
  bitrate: number;
}

export interface ReciterList {
  schemaVersion: 1;
  source: {
    name: string;
    url: string;
    terms: string;
    /** Per-ayah file: {bitrate}, {id} and {ayah} (global ayah number 1–6236). */
    urlTemplate: string;
    files: { path: string; sha256: string }[];
    bitratesProbedAt: string;
  };
  defaultReciter: string;
  reciters: Reciter[];
}

export function ayahAudioUrl(list: Pick<ReciterList, 'source'>, reciter: Reciter, globalAyah: number): string {
  return list.source.urlTemplate
    .replace('{bitrate}', String(reciter.bitrate))
    .replace('{id}', reciter.id)
    .replace('{ayah}', String(globalAyah));
}
