// The demo's backend: the real API (`createApp`) over demo data, wired as `src/server/main.ts` wires TANDEM_SOURCE=fixture,
// but inside the page. `fetch("/api/…")` and `new EventSource("/api/events")` are answered here, so the web app runs unchanged
// and nothing leaves the browser: no GitHub, no Orca, no server. A reload starts from the boot state again.
import { createApp } from "../server/app.ts";
import { Board } from "../server/board.ts";
import { FixtureSource, fixtureActivity, fixtureReset } from "../server/fixture.ts";
import { PageClients } from "../server/notifier.ts";
import { FakePusher } from "../server/push.ts";
import { Store } from "../server/store.ts";

const source = new FixtureSource();
const defaults = { repos: await source.listRepos() };
const store = new Store(defaults, { memory: true });
const pusher = new FakePusher(new Set(["acme/app"]));
const board = new Board(source, store, pusher, { pollMs: 1000, persist: false, activity: async () => fixtureActivity() });
const reset = fixtureReset({ source, store, pusher, board, defaults });
// a Request built in the page carries no Host header (the guard reads it as ""); writes still need the client header and JSON
const app = createApp({ board, source, store, pusher, pages: new PageClients(), reset, access: { hosts: [""], origins: [location.origin] } });
await board.start(); // the first sync is done before the app asks: no "Syncing" flash on every reload

const isApi = (url: URL) => url.origin === location.origin && url.pathname.startsWith("/api/");

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href);
  return isApi(url) ? app.fetch(new Request(url, init)) : realFetch(input, init);
};

type Listener = (e: MessageEvent) => void;

/** `EventSource` for the in-page API: reads the SSE stream `createApp` writes and hands each event to its listeners. */
class DemoEventSource {
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Listener[]>();
  private abort = new AbortController();

  constructor(url: string) {
    void this.read(new URL(url, location.href));
  }

  addEventListener(type: string, fn: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }

  close() {
    this.abort.abort();
  }

  private async read(url: URL) {
    try {
      const res = await app.fetch(new Request(url, { signal: this.abort.signal }));
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let end: number;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const field = (name: string) =>
            block
              .split("\n")
              .filter((l) => l.startsWith(`${name}:`))
              .map((l) => l.slice(name.length + 1).replace(/^ /, ""))
              .join("\n");
          for (const fn of this.listeners.get(field("event") || "message") ?? []) fn(new MessageEvent("message", { data: field("data") }));
        }
      }
    } catch {
      if (!this.abort.signal.aborted) this.onerror?.();
    }
  }
}
window.EventSource = DemoEventSource as unknown as typeof EventSource;
