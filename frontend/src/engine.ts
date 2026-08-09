import type { Page, Snapshot } from "./types";

declare global {
  const __APP_VERSION__: string;
  interface Window {
    dialektikEngine?: {
      dispatch: (action: string) => void;
      getLatestSnapshot?: () => string;
      getSnapshot?: () => Promise<string>;
    };
  }
}

type Listener = (snapshot: Snapshot) => void;

export class EngineBridge {
  private listeners = new Set<Listener>();
  private timer?: number;
  private lastJson = "";
  private startPromise?: Promise<void>;

  async start(listener: Listener): Promise<void> {
    this.listeners.add(listener);
    if (!this.startPromise) {
      this.startPromise = (async () => {
        if (!window.dialektikEngine) await this.loadScript();
      })();
    }
    await this.startPromise;
    await this.poll();
    if (this.timer === undefined) this.timer = window.setInterval(() => void this.poll(), 500);
  }

  stop(): void {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
    this.listeners.clear();
  }

  dispatch(type: string, payload: Record<string, unknown> = {}): void {
    window.dialektikEngine?.dispatch(JSON.stringify({ type, payload }));
  }

  navigate(page: Page): void {
    this.dispatch("app.setActivePage", { page });
  }

  private async loadScript(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/engine.js";
      script.async = true;
      script.onload = () => {
        const deadline = Date.now() + 5000;
        const waitForEngine = () => {
          if (window.dialektikEngine) return resolve();
          if (Date.now() > deadline) return reject(new Error("The Dialektik engine did not start."));
          window.setTimeout(waitForEngine, 50);
        };
        waitForEngine();
      };
      script.onerror = () => reject(new Error("The Dialektik engine bundle could not load."));
      document.head.appendChild(script);
    });
  }

  private async poll(): Promise<void> {
    const api = window.dialektikEngine;
    if (!api) return;
    const raw = api.getLatestSnapshot?.() ?? await api.getSnapshot?.();
    if (!raw || raw === this.lastJson) return;
    this.lastJson = raw;
    try {
      const snapshot = JSON.parse(raw) as Snapshot;
      this.listeners.forEach((listener) => listener(snapshot));
    } catch (error) {
      console.error("Unable to parse Dialektik snapshot", error);
    }
  }
}
