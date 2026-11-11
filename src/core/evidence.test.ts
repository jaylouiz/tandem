import { describe, expect, it } from "vitest";
import { prEvidence, whyStopped } from "./evidence.ts";

describe("a PR body's evidence", () => {
  it("reads both sections, list items and plain lines alike", () => {
    expect(prEvidence("Closes #106\n\n## Review\nNo findings above low.\n\n## Verification\n- unit 212/212\n- e2e 31/31")).toEqual({
      review: ["No findings above low."],
      verification: ["unit 212/212", "e2e 31/31"],
    });
  });

  it("reads the one section there is", () => {
    expect(prEvidence("Closes #173\n\n## Review\nNo findings above low.")).toEqual({ review: ["No findings above low."], verification: null });
    expect(prEvidence("## Verification\n* typecheck\n* build")).toEqual({ review: null, verification: ["typecheck", "build"] });
  });

  it("reports nothing for a body without them, or with an empty one", () => {
    expect(prEvidence("Closes #108")).toEqual({ review: null, verification: null });
    expect(prEvidence("")).toEqual({ review: null, verification: null });
    expect(prEvidence("## Verification\n\n## Review\n")).toEqual({ review: null, verification: null });
  });

  it("stops at the next heading and leaves other sections out", () => {
    const body = "## Summary\nAdds the picker.\n\n## Verification\n1. unit green\n2) e2e green\n\n### Notes\nnot evidence\n\n## Screenshots\n![x](y)\n\n## Review\n- [x] no findings\n- [ ] one nit, P3\nplain line\n\n## Left out\n- mobile";
    expect(prEvidence(body)).toEqual({ verification: ["unit green", "e2e green"], review: ["no findings", "one nit, P3", "plain line"] });
  });

  it("takes any heading level, case and a trailing colon, but not a heading that only starts with the word", () => {
    expect(prEvidence("### verification:\n- a\r\n# REVIEW\n- b")).toEqual({ verification: ["a"], review: ["b"] });
    expect(prEvidence("## Review notes\n- a\n## Verification steps\n- b")).toEqual({ verification: null, review: null });
  });
});

describe("why the merge stopped", () => {
  it("is the question without its closing question sentence", () => {
    expect(whyStopped("Merge held: the PR touches the sync store (risk area). Merge?")).toBe("Merge held: the PR touches the sync store (risk area).");
    expect(whyStopped("Merge held: risk area. Merge?")).toBe("Merge held: risk area.");
    expect(whyStopped("Two findings are open. The review calls them low. Merge anyway?")).toBe("Two findings are open. The review calls them low.");
  });

  it("is left out when the question is one sentence, or does not end in a question", () => {
    expect(whyStopped("Merge?")).toBeNull();
    expect(whyStopped("Should this PR be merged now?")).toBeNull();
    expect(whyStopped("Merge held. The PR touches a risk area.")).toBeNull();
    expect(whyStopped("")).toBeNull();
  });
});
