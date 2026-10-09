// Hybrid timestamps for last-write-wins (D-016): never earlier than the device clock, and always
// later than every timestamp this device has already issued or seen from the server. A device
// whose clock is behind therefore cannot lose an edit it makes after seeing newer data.

export class HybridClock {
  private last: number;
  private readonly wallClock: () => number;

  constructor(last = 0, wallClock: () => number = Date.now) {
    this.last = last;
    this.wallClock = wallClock;
  }

  /** A new timestamp, strictly greater than any previous one. */
  now(): number {
    this.last = Math.max(this.wallClock(), this.last + 1);
    return this.last;
  }

  /** Records a timestamp from elsewhere (another device, a previous session). */
  observe(timestamp: number): void {
    if (Number.isFinite(timestamp) && timestamp > this.last) this.last = timestamp;
  }

  get latest(): number {
    return this.last;
  }
}
