import { describe, expect, it } from "vitest";
import { answerComment, challengeComment, digestThread, parseMarker, prVerdictComment } from "./contract.ts";
import { recordBody, requestBody } from "./fixtures.ts";

// One reply rule, shared with agent-workflow's decide.sh (acme/agent-workflow#16, test-decide.sh uses the same shapes):
// `D<k>: …` with a request/record D<k> earlier belongs to D<k>; any other unmarked comment to the nearest earlier marked one.
const req = (id: string) => requestBody(id, `Pick ${id}?\n- A: one\n- B: two`);
const rec = (id: string) => recordBody(id, `Chosen: x for ${id}\nAlternatives: y\nWhy: z\nCost to switch: low`);
const NOTE = "<!-- decision-note look -->\n### Look: x";
const thread = (...bodies: string[]) =>
  digestThread(bodies.map((body, i) => ({ id: String(i), author: "u", createdAt: "2026-11-04T10:00:00Z", url: "u", body })));
const answers = (t: ReturnType<typeof thread>) => Object.fromEntries(t.requests.map((r) => [r.id, r.answer]));
const challenges = (t: ReturnType<typeof thread>) => Object.fromEntries(t.agentDecisions.map((d) => [d.id, d.challenge]));

describe("who a reply belongs to", () => {
  it("a challenge to D2 written while D3 is open challenges D2 and leaves D3 unanswered", () => {
    const t = thread(rec("D2"), req("D3"), "D2: change it");
    expect(challenges(t)).toEqual({ D2: "D2: change it" });
    expect(answers(t)).toEqual({ D3: null });
  });

  it("an answer to D3 written after a later record answers D3, not the record", () => {
    const t = thread(req("D3"), rec("D2"), "D3: B");
    expect(answers(t)).toEqual({ D3: "D3: B" });
    expect(challenges(t)).toEqual({ D2: null });
  });

  it("an unprefixed comment keeps attaching to the nearest earlier marked comment", () => {
    expect(challenges(thread(req("D3"), rec("D2"), "B"))).toEqual({ D2: "B" });
    expect(answers(thread(req("D3"), rec("D2"), "B"))).toEqual({ D3: null });
    expect(challenges(thread(rec("D1"), "change D1"))).toEqual({ D1: "change D1" });
  });

  it("a prefix naming an id with no request or record before it is not dropped", () => {
    expect(challenges(thread(rec("D1"), "D9: x"))).toEqual({ D1: "D9: x" });
    expect(challenges(thread(rec("D1"), "D2: early", req("D2")))).toEqual({ D1: "D2: early" });
  });

  it("the replies of one decision are its own comments in thread order", () => {
    const t = thread(rec("D1"), req("D2"), "D1: a", "D2: b", "D1: c");
    expect(challenges(t)).toEqual({ D1: "D1: a\n\nD1: c" });
    expect(answers(t)).toEqual({ D2: "D2: b" });
  });

  it("a prefixed comment after a note still names its decision; an unprefixed one belongs to the note", () => {
    expect(challenges(thread(rec("D1"), NOTE, "D1: x"))).toEqual({ D1: "D1: x" });
    expect(challenges(thread(rec("D1"), NOTE, "thanks"))).toEqual({ D1: null });
  });

  it("matches the id exactly and only at the start of the comment", () => {
    expect(challenges(thread(rec("D1"), rec("D10"), "D10: x"))).toEqual({ D1: null, D10: "D10: x" });
    expect(challenges(thread(rec("D1"), rec("D2"), "see D1: x"))).toEqual({ D1: null, D2: "see D1: x" });
    expect(challenges(thread(rec("D1"), rec("D2"), "\n  D1: x"))).toEqual({ D1: "D1: x", D2: null });
  });

  it("answer and resolved markers keep their effect", () => {
    const answered = thread(req("D1"), "<!-- decision-answer D1 -->\nAnswer from the user (via the coordinator): A");
    expect(answers(answered)).toEqual({ D1: "A" });
    const resolved = thread(req("D1"), "D1: B", "<!-- decision-resolved D1 -->\nResumed (D1).");
    expect(resolved.requests[0]).toMatchObject({ answer: "D1: B", resolved: true });
  });
});

describe("footers that name the D<k>: prefix (agent-workflow decide.sh)", () => {
  it("request and record bodies read the same with the footer that tells a GitHub user to start with D<k>:", () => {
    const r = req("D2");
    expect(r).toContain("start it with `D2:`");
    expect(rec("D2")).toContain("starting with `D2:`");
    const t = thread(r, rec("D1"), "D2: B");
    expect(t.requests[0]).toMatchObject({ id: "D2", answer: "D2: B", question: "Pick D2?" });
    expect(t.requests[0]!.options).toHaveLength(2);
    expect(t.agentDecisions[0]).toMatchObject({ id: "D1", title: "Chosen: x for D1", challenge: null });
  });
});

describe("what Tandem writes, read back", () => {
  it("a challenge is exactly `D<k>: text` and never a marker", () => {
    expect(challengeComment("D2", " text ")).toBe("D2: text");
    expect(parseMarker(challengeComment("D2", " text "))).toBeNull();
  });

  it("answers and verdicts carry the prefix the reply rule reads", () => {
    expect(answerComment("D3", "B")).toBe("D3: B");
    expect(thread(rec("D2"), req("D3"), prVerdictComment("D3", "approve", ""))).toMatchObject({ requests: [{ answer: "D3: Approve: merge" }] });
  });
});
