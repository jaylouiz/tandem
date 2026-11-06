import { describe, expect, it } from "vitest";
import { nextAfterAnswer } from "./answered.ts";

const was = { keys: ["a", "b", "c"], sel: "b", filter: null as string | null };

describe("nextAfterAnswer", () => {
  it("the open blocker leaves the list: the one at the same index opens", () => {
    expect(nextAfterAnswer(was, { keys: ["a", "c"], selected: "b", filter: null })).toEqual({ open: "c" });
  });
  it("the last row answered: the one before it opens", () => {
    expect(nextAfterAnswer({ keys: ["a", "b"], sel: "b", filter: null }, { keys: ["a"], selected: "b", filter: null })).toEqual({ open: "a" });
  });
  it("the list is empty afterwards: nothing to open, the pane keeps the Card", () => {
    expect(nextAfterAnswer({ keys: ["b"], sel: "b", filter: null }, { keys: [], selected: "b", filter: null })).toEqual({ open: null });
  });
  it("the open blocker is still listed: nothing happens", () => {
    expect(nextAfterAnswer(was, { keys: ["a", "b", "c"], selected: "b", filter: null })).toBeNull();
  });
  it("a repo-filter change that drops the open blocker is not an answer: nothing opens", () => {
    expect(nextAfterAnswer(was, { keys: ["x", "y"], selected: "b", filter: "o/other" })).toBeNull();
    expect(nextAfterAnswer(was, { keys: [], selected: "b", filter: "o/other" })).toBeNull();
  });
  it("the selection changed since the last render: not an answer", () => {
    expect(nextAfterAnswer(was, { keys: ["a", "b", "c"], selected: "c", filter: null })).toBeNull();
    expect(nextAfterAnswer(was, { keys: ["a"], selected: "c", filter: null })).toBeNull();
    expect(nextAfterAnswer(was, { keys: ["a"], selected: null, filter: null })).toBeNull();
  });
});
