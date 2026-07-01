export interface TimerState {
  duration: number; // total duration in ms
  remaining: number; // remaining duration in ms
  targetTime: number | null; // wall-clock time in ms when timer ends
  isRunning: boolean;
}

/**
 * Absolute Wall-Clock Timer to prevent throttling/drift on mobile/iOS.
 * Relies on absolute timestamps (Date.now()) rather than setInterval ticks.
 */
export class DebateTimer {
  private duration: number; // in ms
  private remaining: number; // in ms
  private targetTime: number | null = null; // absolute ms timestamp
  private isRunning: boolean = false;
  private intervalId: any = null;

  private onTickCallback: ((remaining: number) => void) | null = null;
  private onEndCallback: (() => void) | null = null;

  constructor(durationSeconds: number) {
    this.duration = durationSeconds * 1000;
    this.remaining = this.duration;
  }

  public onTick(cb: (remaining: number) => void) {
    this.onTickCallback = cb;
  }

  public onEnd(cb: () => void) {
    this.onEndCallback = cb;
  }

  public start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.targetTime = Date.now() + this.remaining;

    // Tick checking
    this.intervalId = setInterval(() => {
      this.tick();
    }, 100);
  }

  public pause() {
    if (!this.isRunning) return;

    this.remaining = this.getRemaining();
    this.isRunning = false;
    this.targetTime = null;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.onTickCallback) {
      this.onTickCallback(this.remaining);
    }
  }

  public reset(durationSeconds?: number) {
    if (durationSeconds !== undefined) {
      this.duration = durationSeconds * 1000;
    }
    this.remaining = this.duration;
    this.isRunning = false;
    this.targetTime = null;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.onTickCallback) {
      this.onTickCallback(this.remaining);
    }
  }

  /**
   * Return absolute remaining milliseconds
   */
  public getRemaining(): number {
    if (!this.isRunning || this.targetTime === null) {
      return this.remaining;
    }
    return Math.max(0, this.targetTime - Date.now());
  }

  public getState(): TimerState {
    return {
      duration: this.duration,
      remaining: this.getRemaining(),
      targetTime: this.targetTime,
      isRunning: this.isRunning
    };
  }

  private tick() {
    const currentRemaining = this.getRemaining();

    if (this.onTickCallback) {
      this.onTickCallback(currentRemaining);
    }

    if (currentRemaining <= 0) {
      this.pause();
      if (this.onEndCallback) {
        this.onEndCallback();
      }
    }
  }
}
