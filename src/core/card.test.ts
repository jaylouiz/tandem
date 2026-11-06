import { describe, expect, it } from "vitest";
import { buildCard, onBoard, toLookAt, waitingId, waitingOnMe } from "./card.ts";
import { DEFAULT_WORKFLOW as cfg } from "./config.ts";
import { answerComment, challengeComment, digestThread, parseMarker, prVerdictComment, roundReactionComment } from "./contract.ts";
import { demoIssues, requestBody } from "./fixtures.ts";

const now = Date.parse("2026-11-04T12:00:00Z");
const cards = () => demoIssues(now).map((i) => buildCard(i, cfg, null));
const card = (n: number, repo = "acme/app") => cards().find((c) => c.repo === repo && c.number === n)!;

describe("markers", () => {
  it("parses decision and note kinds", () => {
    expect(parseMarker("<!-- decision-request D3 -->\nx")).toMatchObject({ kind: "request", id: "D3" });
    expect(parseMarker("<!-- decision-note round R2 -->")).toMatchObject({ kind: "note", note: "round", round: 2 });
    expect(parseMarker("<!-- decision-note look -->")).toMatchObject({ note: "look" });
    expect(parseMarker("<!-- decision-note -->\nsummary")).toMatchObject({ kind: "note", note: null });
    expect(parseMarker("plain user comment")).toBeNull();
  });

  it("reads question, options, recommendation and preview of a request", () => {
    const [r] = digestThread([{ id: "1", author: "u", createdAt: "2026-11-04T10:00:00Z", url: "u", body: requestBody("D1", "Pick one?\nPreview: http://x/y\n- A: first\n- B: second\nRecommendation: B (confidence high)") }]).requests;
    expect(r).toMatchObject({ id: "D1", question: "Pick one?", options: ["A: first", "B: second"], recommendation: "B (confidence high)", preview: "http://x/y", answer: null });
  });

  it("treats an unmarked comment after a request as the answer", () => {
    const t = digestThread([
      { id: "1", author: "u", createdAt: "a", url: "u", body: requestBody("D1", "Q?\n- A\n- B") },
      { id: "2", author: "u", createdAt: "b", url: "u", body: "B" },
    ]);
    expect(t.requests[0]!.answer).toBe("B");
  });
});

describe("phases", () => {
  it("maps labels and state to phases", () => {
    expect(card(101).phase).toBe("Inbox");
    expect(card(102).phase).toBe("Inbox"); // fog: no lane
    expect(card(103).phase).toBe("Backlog");
    expect(card(103).nextStep).toBe("specify");
    expect(card(104).phase).toBe("UX Design");
    expect(card(106).phase).toBe("Build");
    expect(card(108).phase).toBe("Done");
  });
});

describe("priority and fog", () => {
  it("derives priority from priority:<n> (lowest wins), fog from the label", () => {
    expect(card(103).priority).toBe(2);
    expect(card(101).priority).toBeNull();
    const odd = { ...demoIssues(now).find((i) => i.number === 103)!, labels: ["needs-spec", "priority:3", "priority:1", "priority:9"] };
    expect(buildCard(odd, cfg, null).priority).toBe(1);
    expect(card(116)).toMatchObject({ fog: true, phase: "Inbox", nextStep: null });
    expect(card(101).fog).toBe(false);
  });
});

describe("waiting on me", () => {
  it("classifies what waits", () => {
    expect(card(104).waiting?.kind).toBe("design-round");
    expect(card(105).waiting?.kind).toBe("decision");
    expect(card(106).waiting?.kind).toBe("pr-approval");
    expect(card(103).waiting).toBeNull();
  });

  it("an agent decision never waits on me: no waiting, no notification id, the Card keeps its other state", () => {
    const c = card(107);
    expect(c.agentDecisions).toHaveLength(1);
    expect(c.decisionsToAccept).toEqual(["D1"]);
    expect(c.waiting).toBeNull();
    expect(c.awaitingPickup).toBe(false);
    expect(c.phase).toBe("Build");
    expect(waitingId(c)).toBeNull();
    expect(waitingOnMe(cards()).map((x) => x.number)).not.toContain(107);
  });

  it("a real blocker next to agent decisions waits for the blocker only", () => {
    const c = card(127);
    expect(c.waiting).toMatchObject({ kind: "decision", requestId: "D3" });
    expect(c.agentDecisions.map((d) => d.id)).toEqual(["D1", "D2", "D4"]);
    expect(c.decisionsToAccept).toEqual(["D2", "D4"]); // D1 has a reply (challenged)
    expect(waitingId(c)).toBe(`acme/app#127:decision:${c.waiting!.since}`);
  });

  it("decisions to accept need the agent-decided label and no reply", () => {
    const raw = demoIssues(now).find((i) => i.number === 107)!;
    expect(buildCard({ ...raw, labels: raw.labels.filter((l) => l !== "agent-decided") }, cfg, null).decisionsToAccept).toEqual([]);
    expect(buildCard({ ...raw, comments: [...raw.comments, { ...raw.comments[0]!, id: "x", body: "change D1" }] }, cfg, null).decisionsToAccept).toEqual([]);
  });

  it("a closed Card has no decisions to accept, even with the label still on", () => {
    const raw = demoIssues(now).find((i) => i.number === 107)!;
    const closed = buildCard({ ...raw, state: "closed", stateReason: "completed", closedAt: new Date(now).toISOString() }, cfg, null);
    expect(closed.agentDecisions).toHaveLength(1); // still listed in Decided, but nothing to accept or challenge
    expect(closed.decisionsToAccept).toEqual([]);
  });

  it("orders closest to Done first, then oldest", () => {
    expect(waitingOnMe(cards()).map((c) => c.number)).toEqual([106, 173, 177, 180, 170, 127, 171, 172, 117, 105, 118, 175, 178, 179, 110, 104]);
  });

  it("an answered request is awaiting pickup, not waiting", () => {
    const issue = demoIssues(now).find((i) => i.number === 105)!;
    issue.comments.push({ id: "x", author: "u", createdAt: "z", url: "u", body: answerComment("D1", "B") });
    const c = buildCard(issue, cfg, null);
    expect(c.waiting).toBeNull();
    expect(c.awaitingPickup).toBe(true);
  });
});

describe("a reply belongs to the decision it names (#26)", () => {
  const withReply = (n: number, body: string) => {
    const raw = demoIssues(now).find((i) => i.number === n)!;
    const reply = { id: "x", author: "u", createdAt: "z", url: "u", body };
    raw.comments.push(reply);
    return buildCard(raw, cfg, null);
  };

  it("an answer to D3 after a later record answers D3: awaiting pickup, no longer waiting, D2 still to accept", () => {
    const c = withReply(127, answerComment("D3", "B"));
    expect(c.waiting).toBeNull();
    expect(c.awaitingPickup).toBe(true);
    expect(c.requests.find((r) => r.id === "D3")!.answer).toBe("D3: B");
    expect(c.agentDecisions.find((d) => d.id === "D2")!.challenge).toBeNull();
    expect(c.decisionsToAccept).toEqual(["D2", "D4"]);
  });

  it("a challenge to D2 while D3 is open keeps the Card waiting on D3 and takes D2 off the accept list", () => {
    const c = withReply(127, challengeComment("D2", "log at info"));
    expect(c.waiting).toMatchObject({ kind: "decision", requestId: "D3" });
    expect(c.awaitingPickup).toBe(false);
    expect(c.agentDecisions.find((d) => d.id === "D2")!.challenge).toBe("D2: log at info");
    expect(c.decisionsToAccept).toEqual(["D4"]);
  });

  it("an unprefixed comment still lands on the nearest earlier marked comment (D4 here)", () => {
    const c = withReply(127, "B");
    expect(c.waiting).toMatchObject({ requestId: "D3" });
    expect(c.decisionsToAccept).toEqual(["D2"]);
  });
});

describe("done and look", () => {
  it("keeps an unseen Look card and drops it 7 days after Seen", () => {
    expect(toLookAt(cards()).map((c) => c.number)).toEqual([108, 119, 163, 162, 161, 160, 164, 165, 176]);
    const raw = demoIssues(now).find((i) => i.number === 108)!;
    const seen = buildCard(raw, cfg, "2026-11-01T12:00:00Z");
    expect(onBoard(seen, cfg, new Date(now))).toBe(true);
    expect(onBoard(seen, cfg, new Date(now + 5 * 86_400_000))).toBe(false);
  });

  it("counts a Done card without UX impact as Seen at close", () => {
    const c = card(23, "acme/agent-workflow");
    expect(c.needsLook).toBe(false);
    expect(c.seenAt).toBe(c.closedAt);
  });

  it("parses the Look note and round screenshots", () => {
    expect(card(108).look).toMatchObject({ preview: "http://localhost:5317/settings?seed=demo", path: "/settings?seed=demo" });
    expect(card(108).look!.checks).toHaveLength(2);
    const r = card(104).rounds[0]!;
    expect(r.variants.map((v) => v.key)).toEqual(["a", "b", "c"]);
    expect(r.screenshots.filter((s) => s.variant === "b" && s.viewport === "mobile")).toHaveLength(1);
  });
});

describe("what Tandem writes", () => {
  it("writes unmarked comments", () => {
    expect(roundReactionComment({ round: 1, picks: ["b"], rejects: ["c"], comment: "header from a" })).toBe("R1:\n- pick: b\n- reject: c\n\nheader from a");
    expect(prVerdictComment("D1", "approve", "")).toBe("D1: Approve: merge");
    expect(parseMarker(answerComment("D1", "B"))).toBeNull();
  });
});

describe("waitingId", () => {
  it("identifies one waiting event and is null when nothing waits", () => {
    const w = card(105);
    expect(w.waiting).not.toBeNull();
    expect(waitingId(w)).toBe(`acme/app#105:${w.waiting!.kind}:${w.waiting!.since}`);
    expect(waitingId({ key: "r/x#1", waiting: null })).toBeNull();
  });
});

describe("demo data", () => {
  it("has one issue per repo and number (the fixture cache keeps the last of two)", () => {
    const keys = demoIssues(now).map((i) => `${i.repo}#${i.number}`);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });
});

describe("to look at with a Card still open", () => {
  it("keeps the named Card in the list once it is Seen, in its place", () => {
    const all = cards().map((c) => (c.number === 119 ? { ...c, seenAt: "2026-11-05T10:00:00Z" } : c));
    expect(toLookAt(all).map((c) => c.number)).not.toContain(119);
    expect(toLookAt(all, all.find((c) => c.number === 119)!.key).map((c) => c.number)).toEqual([108, 119, 163, 162, 161, 160, 164, 165, 176]);
  });
});
