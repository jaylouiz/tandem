import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WORKFLOW } from "../core/config.ts";
import type { BoardView, Card } from "../core/types.ts";

const mem = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
let store: typeof import("./store.ts");
let drag: typeof import("./drag.ts");
let triage: typeof import("./triage.ts");
beforeAll(async () => {
  store = await import("./store.ts");
  drag = await import("./drag.ts");
  triage = await import("./triage.ts");
});
afterEach(() => vi.unstubAllGlobals());

const mk = (n: number, over: Partial<Card>): Card =>
  ({ key: `o/r#${n}`, repo: "o/r", number: n, state: "open", labels: [], phase: "Inbox", nextStep: null, onHold: false, waiting: null, fog: false, pullRequest: null, ...over }) as unknown as Card;
const inbox = mk(1, { labels: ["inbox"] });
const backlog = mk(2, { phase: "Backlog", labels: ["needs-spec"], nextStep: "specify" });
const build = mk(3, { phase: "Build", labels: ["in-build"], nextStep: "build" });
const closed = mk(4, { phase: "Done", state: "closed" });

describe("drop targets follow the dragged set", () => {
  beforeEach(() => {
    store.useStore.setState({ board: { workflow: DEFAULT_WORKFLOW, cards: [inbox, backlog, build, closed], repos: [], sync: {}, coordinators: {} } as unknown as BoardView, moveStep: "keep" });
  });

  it("agent-owned Phases refuse with their reason, whatever is dragged", () => {
    for (const to of ["Build", "UX Design"] as const) expect(drag.dropBlocked(to, [inbox])).toBe("Agents move Cards here: use Hand to agent");
    expect(drag.dropBlocked("Done", [backlog])).toBe("Done follows the merged PR");
  });

  it("a Card that cannot move (Build, Done) has no valid column; the reason is moveBlocked's", () => {
    for (const to of ["Inbox", "Backlog"] as const) {
      expect(drag.dropBlocked(to, [build])).toBe("Not applicable: Build");
      expect(drag.dropBlocked(to, [build])).toBe(triage.moveBlocked(to, [build], DEFAULT_WORKFLOW, "keep"));
    }
    expect(drag.dropBlocked("Backlog", [closed])).toBe("Not applicable: Done");
  });

  it("the Card's own column is no target; the other one is", () => {
    expect(drag.dropBlocked("Inbox", [inbox])).toBe("Already in Inbox");
    expect(drag.dropBlocked("Backlog", [inbox])).toBeNull();
    expect(drag.dropBlocked("Backlog", [backlog])).toBe("Already in Backlog");
    expect(drag.dropBlocked("Inbox", [backlog])).toBeNull();
  });

  it("a mixed set is a target as soon as one Card moves", () => {
    expect(drag.dropBlocked("Backlog", [inbox, backlog, build])).toBeNull();
    expect(drag.dropBlocked("Inbox", [inbox, backlog])).toBeNull();
    expect(drag.dropBlocked("Inbox", [inbox, build])).toBe("Not applicable: Build"); // nothing moves: moveBlocked words it
  });

  it("the Next step from the bar can make a Backlog Card movable again", () => {
    store.useStore.setState({ moveStep: "build" });
    expect(drag.dropBlocked("Backlog", [backlog])).toBeNull();
  });
});
