import { describe, expect, it } from "vitest";
import { canSend, decisionAnswer, decisionFeedback, feedbackComment, optionKey, optionText, prFeedback, roundFeedback } from "./answer.ts";
import { parseMarker } from "./contract.ts";

describe("an option", () => {
  it("splits into its key and its text", () => {
    expect(optionKey("B: field-level merge")).toBe("B");
    expect(optionText("B: field-level merge")).toBe("field-level merge");
    expect(optionText("A: last write wins: with an undo toast")).toBe("last write wins: with an undo toast");
    expect(optionKey("yes")).toBe("yes");
    expect(optionText("yes")).toBe("");
  });
});

describe("a decision's answer text", () => {
  it("is the option's key, the note, or both", () => {
    expect(decisionAnswer("B: field-level merge", "")).toBe("B");
    expect(decisionAnswer("B: field-level merge", "  but keep the undo toast ")).toBe("B. but keep the undo toast");
    expect(decisionAnswer(null, "neither, ask me again on Monday")).toBe("neither, ask me again on Monday");
    expect(decisionAnswer(null, "  ")).toBe("");
  });
});

// The same text as before #8 for the same answer: these literals are what the panels wrote.
describe("the comment an option shows is the comment that is written", () => {
  it("a decision without and with a note", () => {
    expect(feedbackComment(decisionFeedback("D3", "B: 5", ""))).toBe("D3: B");
    expect(feedbackComment(decisionFeedback("D3", "B: 5", "and log each retry"))).toBe("D3: B. and log each retry");
    expect(feedbackComment(decisionFeedback("D3", null, "7, it is a slow API"))).toBe("D3: 7, it is a slow API");
  });

  it("each PR verdict", () => {
    expect(feedbackComment(prFeedback("D1", "approve", ""))).toBe("D1: Approve: merge");
    expect(feedbackComment(prFeedback("D1", "approve", "nice"))).toBe("D1: Approve: merge. nice");
    expect(feedbackComment(prFeedback("D1", "hold", ""))).toBe("D1: Hold");
    expect(feedbackComment(prFeedback("D1", "send-back", "the empty state is missing"))).toBe("D1: Send back. the empty state is missing");
    expect(feedbackComment(prFeedback(null, "approve", ""))).toBe("Approve: merge");
  });

  it("a round with picks, rejects and a comment", () => {
    expect(feedbackComment(roundFeedback(1, ["b"], [], ""))).toBe("R1:\n- pick: b");
    expect(feedbackComment(roundFeedback(2, ["a", "b"], ["c"], "header from a, list from b"))).toBe("R2:\n- pick: a, b\n- reject: c\n\nheader from a, list from b");
    expect(feedbackComment(roundFeedback(1, [], [], "none of them yet"))).toBe("R1:\n\nnone of them yet");
  });

  it("is never a marked comment: Tandem writes as the user", () => {
    for (const f of [decisionFeedback("D3", "B: 5", "note"), prFeedback("D1", "send-back", "note"), roundFeedback(1, ["b"], ["c"], "note")]) expect(parseMarker(feedbackComment(f))).toBeNull();
  });
});

describe("what can be sent", () => {
  it("needs an answer, a note for Send back, and a pick, a reject or a comment for a round", () => {
    expect(canSend(decisionFeedback("D1", null, " "))).toBe(false);
    expect(canSend(decisionFeedback("D1", "A: x", ""))).toBe(true);
    expect(canSend(prFeedback("D1", "approve", ""))).toBe(true);
    expect(canSend(prFeedback("D1", "hold", ""))).toBe(true);
    expect(canSend(prFeedback("D1", "send-back", " "))).toBe(false);
    expect(canSend(prFeedback("D1", "send-back", "why"))).toBe(true);
    expect(canSend(roundFeedback(1, [], [], ""))).toBe(false);
    expect(canSend(roundFeedback(1, [], ["a"], ""))).toBe(true);
    expect(canSend(roundFeedback(1, [], [], "x"))).toBe(true);
  });
});
