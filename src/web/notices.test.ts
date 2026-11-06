import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Card } from "../core/types.ts";

// notices.ts reaches the store, which reads localStorage when it loads: stub it first, then import.
vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
let noticeSpec: typeof import("./notices.ts").noticeSpec;
let toast: typeof import("./ui/Toast.tsx");
beforeAll(async () => {
  ({ noticeSpec } = await import("./notices.ts"));
  toast = await import("./ui/Toast.tsx");
});

const card = (key: string) => ({ key }) as Card;
const plain = { key: "r#1", text: "Moved r#1 to Backlog", canStart: false };

describe("noticeSpec", () => {
  it("a confirmation goes after 4 s, an Undo after 8 s, a Start coordinator after 10 s", () => {
    expect(noticeSpec(plain, () => []).timeout).toBe(4000);
    expect(noticeSpec({ ...plain, undo: () => {} }, () => []).timeout).toBe(8000);
    expect(noticeSpec({ ...plain, canStart: true }, () => []).timeout).toBe(10_000);
  });

  it("work in progress has no timer, a failure is marked as one", () => {
    expect(noticeSpec({ ...plain, busy: true, id: "refresh" }, () => [])).toMatchObject({ id: "refresh", timeout: 0 });
    expect(noticeSpec({ ...plain, failed: true }, () => []).failed).toBe(true);
    expect(noticeSpec(plain, () => []).failed).toBeUndefined();
  });

  it("Start coordinator starts the notice's own list, else its Card read when the button is pressed", () => {
    const start = vi.fn();
    const own = noticeSpec({ ...plain, canStart: true, start: [card("o/x#2")] }, () => [], start);
    own.action!.run();
    expect(start).toHaveBeenLastCalledWith([card("o/x#2")]);
    let cards = [card("r#0")];
    const byKey = noticeSpec({ ...plain, canStart: true }, () => cards, start);
    cards = [card("r#1")]; // the board moved on while the toast was up
    byKey.action!.run();
    expect(start).toHaveBeenLastCalledWith([card("r#1")]);
    start.mockClear();
    noticeSpec({ ...plain, key: "gone#9", canStart: true }, () => [], start).action!.run();
    expect(start).not.toHaveBeenCalled();
  });

  it("no button without canStart", () => {
    expect(noticeSpec(plain, () => []).action).toBeUndefined();
  });
});

describe("undo stack", () => {
  it("⌘Z runs the Undos newest first, one each; a later toast without an Undo takes none away", () => {
    const ran: string[] = [];
    toast.showToast({ text: "first", undo: () => ran.push("first") });
    toast.showToast({ text: "second", undo: () => ran.push("second") });
    toast.showToast({ text: "no undo" });
    expect(toast.canUndo()).toBe(true);
    expect(toast.undoLatest()).toBe(true);
    expect(toast.undoLatest()).toBe(true);
    expect(ran).toEqual(["second", "first"]);
    expect(toast.undoLatest()).toBe(false);
    expect(toast.canUndo()).toBe(false);
  });

  it("a toast updated under its id offers only its newest Undo", () => {
    const ran: string[] = [];
    toast.showToast({ id: "u", text: "a", undo: () => ran.push("old") });
    toast.showToast({ id: "u", text: "b", undo: () => ran.push("new") });
    toast.undoLatest();
    expect(ran).toEqual(["new"]);
    expect(toast.undoLatest()).toBe(false);
  });
});
