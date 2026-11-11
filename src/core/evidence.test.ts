import { describe, expect, it } from "vitest";
import { prEvidence, whyStopped } from "./evidence.ts";

const done = (...texts: string[]) => texts.map((text) => ({ text, open: false }));

describe("a PR body's evidence", () => {
  it("reads both sections, list items and plain lines alike", () => {
    expect(prEvidence("Closes #106\n\n## Review\nNo findings above low.\n\n## Verification\n- unit 212/212\n- e2e 31/31")).toEqual({
      review: done("No findings above low."),
      verification: done("unit 212/212", "e2e 31/31"),
    });
  });

  it("reads the one section there is", () => {
    expect(prEvidence("Closes #173\n\n## Review\nNo findings above low.")).toEqual({ review: done("No findings above low."), verification: null });
    expect(prEvidence("## Verification\n* typecheck\n* build")).toEqual({ review: null, verification: done("typecheck", "build") });
  });

  it("reports nothing for a body without them, or with an empty one", () => {
    expect(prEvidence("Closes #108")).toEqual({ review: null, verification: null });
    expect(prEvidence("")).toEqual({ review: null, verification: null });
    expect(prEvidence("## Verification\n\n## Review\n")).toEqual({ review: null, verification: null });
  });

  it("stops at the next heading of its level and leaves other sections out", () => {
    const body = "## Summary\nAdds the picker.\n\n## Verification\n1. unit green\n2) e2e green\n\n## Screenshots\n![x](y)\n\n## Review\n- no findings\nplain line\n\n## Left out\n- mobile";
    expect(prEvidence(body)).toEqual({ verification: done("unit green", "e2e green"), review: done("no findings", "plain line") });
  });

  it("marks an unchecked task-list item as open, so it does not read like passed evidence", () => {
    expect(prEvidence("## Verification\n- [x] unit\n- [ ] e2e (not run)\n## Review\n- [ ] one P1 finding open\n- [X] style")).toEqual({
      verification: [
        { text: "unit", open: false },
        { text: "e2e (not run)", open: true },
      ],
      review: [
        { text: "one P1 finding open", open: true },
        { text: "style", open: false },
      ],
    });
  });

  it("keeps sub-headings and fenced code inside the section", () => {
    const body = "## Verification\n### Automated\n- unit 212/212\n### Manual\n- checked on mobile\n```sh\n# run the e2e suite\nnpm run e2e\n```\n- e2e 31/31\n# Next\n- not evidence";
    expect(prEvidence(body).verification).toEqual(done("Automated", "unit 212/212", "Manual", "checked on mobile", "# run the e2e suite", "npm run e2e", "e2e 31/31"));
  });

  it("takes any heading level, case and a trailing colon, but not a heading that only starts with the word", () => {
    expect(prEvidence("### verification:\n- a\r\n# REVIEW\n- b")).toEqual({ verification: done("a"), review: done("b") });
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
