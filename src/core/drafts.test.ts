import { describe, expect, it } from "vitest";
import { buildCard } from "./card.ts";
import { DEFAULT_WORKFLOW as cfg } from "./config.ts";
import { AGENT_DRAFT_ID, draftKey, liveDraftIds, pruneDrafts, prDraftId, roundDraftId } from "./drafts.ts";
import { demoIssues } from "./fixtures.ts";

const now = Date.parse("2026-11-04T12:00:00Z");
const cards = demoIssues(now).map((i) => buildCard(i, cfg, null));
const card = (n: number) => cards.find((c) => c.repo === "acme/app" && c.number === n)!;

describe("liveDraftIds: the Feedback panels a Card shows", () => {
  it("a decision blocker: its request id", () => expect(liveDraftIds(card(117))).toEqual(["D1"]));
  it("a design round: the latest round", () => expect(liveDraftIds(card(118))).toEqual([roundDraftId(1)]));
  it("a PR approval: its request", () => expect(liveDraftIds(card(106))).toEqual([prDraftId("D1")]));
  it("agent decisions to accept sit next to a blocker's panel", () => expect(liveDraftIds(card(127))).toEqual(["D3", AGENT_DRAFT_ID]));
  it("a Card nobody waits on has none", () => expect(liveDraftIds(card(101))).toEqual([]));
});

describe("pruneDrafts", () => {
  const drafts = {
    [draftKey("acme/app#117", "D1")]: { text: "a" },
    [draftKey("acme/app#117", "D2")]: { text: "b" },
    [draftKey("acme/app#105", "D1")]: { text: "c" },
    [draftKey("o/not-loaded#1", "D1")]: { text: "d" },
  };
  it("drops the drafts of requests that no longer exist on their Card; keeps the others", () => {
    expect(Object.values(pruneDrafts(drafts, cards)).map((d) => d.text)).toEqual(["a", "c", "d"]);
  });
  it("a Card the snapshot does not contain keeps its drafts (a repo still syncing)", () => {
    expect(pruneDrafts({ [draftKey("o/not-loaded#1", "D1")]: { text: "d" } }, cards)).toHaveProperty([draftKey("o/not-loaded#1", "D1")]);
  });
  it("returns the same object when nothing goes", () => {
    const live = { [draftKey("acme/app#117", "D1")]: { text: "a" } };
    expect(pruneDrafts(live, cards)).toBe(live);
  });
  it("an answered Card drops its draft", () => {
    const answered = { ...card(117), waiting: null };
    expect(pruneDrafts({ [draftKey(answered.key, "D1")]: { text: "a" } }, [answered])).toEqual({});
  });
});
