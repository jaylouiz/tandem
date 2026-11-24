import { describe, expect, it } from "vitest";
import { feedbackComment, questionsAnswer, questionsFeedback } from "./answer.ts";
import { buildCard } from "./card.ts";
import { DEFAULT_WORKFLOW } from "./config.ts";
import { digestThread, parseMarker } from "./contract.ts";
import { choicesRequestBody, demoIssues, requestBody } from "./fixtures.ts";
import { answerSummary, askQuestions, changedFrom, choicesOf, effectivePicks, optionKey, optionText, roundQuestions, unanswered, type Ask } from "./questions.ts";

const now = Date.parse("2026-11-24T12:00:00Z");
const card = (n: number) => buildCard(demoIssues(now).find((i) => i.repo === "acme/app" && i.number === n)!, DEFAULT_WORKFLOW, null);
const ask = (n: number) => askQuestions(card(n))!;

// agent-workflow docs/decision-format.md, "Overview" and "Request", word for word
const DOC_ROUND = `<!-- decision-note round R1 -->
## Design round 1: Setup shell
Preview: https://preview.example/setup?variant=1A
Variants: 1A, 1B, 1C, 2A, 2B
One sheet for Notion and Reminders. Open: where back sits, and the step heading.

### 1. Shell: where back and next sit

| | Option | In short |
|---|---|---|
| A | Rail, back on top (today) | back above, one button below |
| **B ★** | Rail, footer bar | Zurück left, Weiter right |
| C | Top stepper | no rail, same form at every width |

★ Why B: back and main action sit together, like in dialogs.

![R1 · 1. Shell · A, B, C at 1280 and 390](shell.png)

### 2. Heading: the step heading in the pane

| | Option | In short |
|---|---|---|
| **A ★** | Hidden | the rail names the step |
| B | Small, visible | heading with the step's action |

★ Why A: say it once.

![R1 · 2. Heading · A, B at 1280 and 390](heading.png)

<details><summary>Stories, checks, build cost, dropped</summary>

Job: … · Stories: …
Checks: …
Per option: 1A: … · M
Dropped: three shells (contradicts #562)
</details>`;

const DOC_REQUEST = `<!-- decision-request D1 -->
<!-- choices 1 Shell: A (back on top, today) · B ★ (footer bar) · C (top stepper) -->
<!-- choices 2 Heading: A ★ (hidden) · B (small, visible) -->
### Decision needed (D1)
Setup shell: 2 choices
Preview: https://preview.example/setup?variant=1A
Options with screenshots: https://github.com/owner/repo/issues/607#issuecomment-1

+ **1 Shell:** A (back on top, today) · **B ★ (footer bar)** · C (top stepper)
+ **2 Heading:** **A ★ (hidden)** · B (small, visible)

- ok: take every ★ option

Recommendation: ok (1B 2A)

---
Copy, change only the letters you disagree with, post as a comment:
\`\`\`
D1
1 Shell: B (footer bar)
2 Heading: A (hidden)
\`\`\`
Or reply \`ok\` to take every recommendation. Text after a letter is read as a note. Short form: \`D1: 1B 2A\`. The run picks it up at its next checkpoint.
`;

const thread = (...bodies: string[]) => bodies.map((body, i) => ({ id: `c${i}`, author: "u", createdAt: `2026-11-24T10:0${i}:00Z`, url: `https://x/c${i}`, body }));
const cardOf = (kind: "decision" | "design-round", ...bodies: string[]) => {
  const d = digestThread(thread(...bodies));
  return { waiting: { kind, since: "2026-11-24T10:00:00Z", requestId: d.requests.at(-1)!.id }, requests: d.requests, rounds: d.rounds };
};

describe("the format as agent-workflow documents it", () => {
  it("reads a request's choices lines: number, label, letters, ★, today and the keywords", () => {
    expect(choicesOf(DOC_REQUEST)).toEqual([
      {
        n: 1,
        label: "Shell",
        about: "",
        why: "",
        shots: [],
        options: [
          { letter: "A", name: "back on top", short: "", today: true, recommended: false },
          { letter: "B", name: "footer bar", short: "", today: false, recommended: true },
          { letter: "C", name: "top stepper", short: "", today: false, recommended: false },
        ],
      },
      { n: 2, label: "Heading", about: "", why: "", shots: [], options: [{ letter: "A", name: "hidden", short: "", today: false, recommended: true }, { letter: "B", name: "small, visible", short: "", today: false, recommended: false }] },
    ]);
  });

  it("keywords may hold a colon (`A (R1:, today)`): the label ends at the first one", () => {
    const [q] = choicesOf("<!-- choices 4 Prefix: A (R1:, today) · B ★ (D1:) · C (Decision D1:) -->");
    expect(q).toMatchObject({ n: 4, label: "Prefix" });
    expect(q!.options.map((o) => [o.letter, o.name, o.today, o.recommended])).toEqual([["A", "R1:", true, false], ["B", "D1:", false, true], ["C", "Decision D1:", false, false]]);
  });

  it("reads a round's sections: what each question decides, the option table, the reason, and its screenshots", () => {
    const round = digestThread(thread(DOC_ROUND)).rounds[0]!;
    expect(round.questions.map((q) => [q.n, q.label, q.about, q.why, q.shots])).toEqual([
      [1, "Shell", "where back and next sit", "back and main action sit together, like in dialogs.", [0]],
      [2, "Heading", "the step heading in the pane", "say it once.", [1]],
    ]);
    expect(round.questions[0]!.options).toEqual([
      { letter: "A", name: "Rail, back on top", short: "back above, one button below", today: true, recommended: false },
      { letter: "B", name: "Rail, footer bar", short: "Zurück left, Weiter right", today: false, recommended: true },
      { letter: "C", name: "Top stepper", short: "no rail, same form at every width", today: false, recommended: false },
    ]);
    // the things to pick are the declared short forms, each named by its table row; the question headings are not variants
    expect(round.variants).toEqual([
      { key: "1A", name: "Rail, back on top", summary: "back above, one button below", axis: null },
      { key: "1B", name: "Rail, footer bar", summary: "Zurück left, Weiter right", axis: null },
      { key: "1C", name: "Top stepper", summary: "no rail, same form at every width", axis: null },
      { key: "2A", name: "Hidden", summary: "the rail names the step", axis: null },
      { key: "2B", name: "Small, visible", summary: "heading with the step's action", axis: null },
    ]);
    expect(round.screenshots.map((s) => s.src)).toEqual(["shell.png", "heading.png"]);
  });

  it("a section inside <details> is not a question, and neither is the older shape's `### a: name`", () => {
    expect(roundQuestions("### 1. Shell: x\n\n| A | a | b |\n| **B ★** | c | d |\n<details>\n### 2. Hidden: y\n\n| A | a | b |\n| B | c | d |\n</details>", [])).toHaveLength(1);
    expect(card(104).rounds[0]!.questions).toEqual([]);
    expect(card(104).rounds[0]!.variants.map((v) => v.key)).toEqual(["a", "b", "c"]);
  });

  it("the request names what can be answered, the round describes it", () => {
    const a = askQuestions(cardOf("design-round", DOC_ROUND, DOC_REQUEST))!;
    expect(a).toMatchObject({ id: "D1", round: 1, title: "Setup shell: 2 choices", preview: "https://preview.example/setup?variant=1A", overview: "https://x/c0", legacy: false });
    expect(a.questions[0]).toMatchObject({ label: "Shell", about: "where back and next sit", shots: [0] });
    expect(a.questions[0]!.options[1]).toEqual({ letter: "B", name: "Rail, footer bar", short: "Zurück left, Weiter right", today: false, recommended: true });
  });

  it("a request without a round keeps its keywords and links its overview", () => {
    const a = askQuestions(cardOf("decision", DOC_REQUEST))!;
    expect(a).toMatchObject({ round: null, overview: "https://github.com/owner/repo/issues/607#issuecomment-1", legacy: false });
    expect(a.questions.map((q) => q.options.map((o) => o.name))).toEqual([["back on top", "footer bar", "top stepper"], ["hidden", "small, visible"]]);
  });
});

describe("what is not an ask with questions", () => {
  it("a round in the older shape, a PR approval, a request without options, a Card nobody waits on", () => {
    expect(askQuestions(card(104))).toBeNull(); // variants a, b, c
    expect(askQuestions(card(106))).toBeNull(); // PR approval
    expect(askQuestions(cardOf("decision", requestBody("D1", "What should the limit be?")))).toBeNull();
    expect(askQuestions(card(101))).toBeNull();
  });
});

describe("an older request: one question from its option list", () => {
  it("`B: text` options, the recommended one from the Recommendation line", () => {
    const a = ask(105);
    expect(a).toMatchObject({ legacy: true, round: null });
    expect(a.questions).toHaveLength(1);
    expect(a.questions[0]!.options.map((o) => [o.letter, o.name, o.recommended])).toEqual([["A", "last write wins, with an undo toast", false], ["B", "field-level merge", true], ["C", "ask the user on conflict", false]]);
    expect(a.questions[0]!.why).toBe("confidence high");
  });

  it("options named in bold: the bold text is the key an answer names, the rest (Markdown and all) its text", () => {
    expect(optionKey("**H1 Sunlit Outline** (S). Yellow desk")).toBe("H1 Sunlit Outline");
    expect(optionText("**H1 Sunlit Outline** (S). Yellow desk")).toBe("(S). Yellow desk");
    const q = ask(185).questions[0]!;
    expect(q.options.map((o) => [o.letter, o.recommended])).toEqual([["H1 Sunlit Outline", true], ["H2 Sticker Desk", false], ["A3 Ink Pills", false], ['Or a mix ("H1 outlines with A3 pill headings"), then round 3.', false]]);
    expect(q.options[1]!.name).toBe("(M). Hard shadows, tilted labels, yellow only for `Jetzt`.");
    expect(q.why).toBe("confidence ~45% (taste). It keeps the clear outlines you liked and costs little to build.");
  });

  it("the longer key wins when one key starts another", () => {
    const a = askQuestions(cardOf("decision", requestBody("D1", "Which?\n- A: one\n- A3: three\nRecommendation: A3 (bold)")))!;
    expect(a.questions[0]!.options.map((o) => o.recommended)).toEqual([false, true]);
    const b = askQuestions(cardOf("decision", requestBody("D1", "Which?\n- A: one\n- A3: three\nRecommendation: A (plain)")))!;
    expect(b.questions[0]!.options.map((o) => o.recommended)).toEqual([true, false]);
  });
});

// What Tandem writes for an ask with questions (#13, #1): exact text, never a marker. agent-workflow's `decision_format.py read` takes each form.
describe("the answer to an ask with questions", () => {
  const a183 = () => ask(183);
  const written = (a: Ask, picks: Record<number, string>, notes: Record<number, string> = {}) => feedbackComment(questionsFeedback(a, picks, notes));

  it("every recommendation: `Decision D1: ok`", () => {
    expect(written(a183(), {})).toBe("Decision D1: ok");
    expect(written(a183(), { 1: "B", 2: "A", 3: "B" })).toBe("Decision D1: ok"); // picked by hand, still the recommendations
  });

  it("the recommendations except some: `Decision D1: ok. 1A 3A`", () => {
    expect(written(a183(), { 1: "A" })).toBe("Decision D1: ok. 1A");
    expect(written(a183(), { 3: "A", 1: "A" })).toBe("Decision D1: ok. 1A 3A");
  });

  it("a note on a question: one line per question, the note after its letter and name", () => {
    expect(written(a183(), { 1: "C" }, { 1: " but calmer " })).toBe("Decision D1: 1 Shell: C (Top stepper) but calmer\n2 Heading: A (Hidden)\n3 Width: B (Content width)");
    expect(written(a183(), {}, { 2: "for now" })).toBe("Decision D1: 1 Shell: B (Rail, footer bar)\n2 Heading: A (Hidden) for now\n3 Width: B (Content width)");
  });

  it("a question without a recommendation: nothing to send until it is picked, then the short form for all", () => {
    const body = choicesRequestBody("D2", "Two things", ["1 Shell: A (rail) · B ★ (bar)", "2 Tone: A (calm) · B ★ (loud)"]).replace("2 Tone: A (calm) · B ★ (loud) -->", "2 Tone: A (calm) · B (loud) -->");
    const a = askQuestions(cardOf("decision", body))!;
    expect(unanswered(a, {}).map((q) => q.n)).toEqual([2]);
    expect(questionsAnswer(a, {}, {})).toBe("");
    expect(written(a, { 2: "A" })).toBe("Decision D2: 1B 2A");
    expect(answerSummary(a, {}, {})).toBe("1 of 2 picked");
  });

  it("one question: the key, then the note", () => {
    expect(written(ask(105), {})).toBe("Decision D1: B");
    expect(written(ask(105), { 1: "C" }, { 1: "wait for the review" })).toBe("Decision D1: C. wait for the review");
    expect(written(ask(105), { 1: "" }, { 1: "neither" })).toBe("Decision D1: neither"); // the pick taken back: answered in words
    expect(questionsAnswer(ask(105), { 1: "" }, {})).toBe("");
    expect(written(ask(185), {})).toBe("Decision D1: H1 Sunlit Outline");
  });

  it("is never a marker", () => {
    for (const c of [written(a183(), {}), written(a183(), { 1: "A" }), written(a183(), {}, { 1: "x" }), written(ask(105), {}), written(ask(184), { 2: "C" })]) expect(parseMarker(c)).toBeNull();
  });

  it("a pick that names no option of its question (the ask changed under the draft) falls back to the recommendation", () => {
    expect(effectivePicks(a183(), { 1: "Z", 2: "B" })).toEqual({ 1: "B", 2: "B", 3: "B" });
    expect(changedFrom(a183(), { 1: "Z", 2: "B" }).map((q) => q.n)).toEqual([2]);
  });

  it("says in one line what the answer is", () => {
    expect(answerSummary(a183(), {}, {})).toBe("All 3 as recommended");
    expect(answerSummary(a183(), { 1: "A" }, {})).toBe("2 of 3 as recommended, 1A changed");
    expect(answerSummary(a183(), { 1: "A" }, { 1: "x", 3: "y" })).toBe("2 of 3 as recommended, 1A changed, 2 notes");
    expect(answerSummary(a183(), {}, { 2: "x" })).toBe("All 3 as recommended, 1 note");
    expect(answerSummary(ask(105), {}, {})).toBe("");
  });
});

describe("the demo Cards", () => {
  it("#183 asks three questions with a round, #184 four without one", () => {
    expect(card(183).waiting).toMatchObject({ kind: "design-round", requestId: "D1" });
    expect(ask(183).questions.map((q) => q.label)).toEqual(["Shell", "Heading", "Width"]);
    expect(card(184).waiting).toMatchObject({ kind: "decision" });
    expect(ask(184)).toMatchObject({ round: null, legacy: false });
    expect(ask(184).questions.map((q) => q.options.length)).toEqual([2, 3, 2, 2]);
  });
});
