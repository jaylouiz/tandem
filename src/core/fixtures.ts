// Realistic issue threads in the exact shapes agent-workflow writes (decide.sh, design and build skills).
// Used by unit tests, the fixture source (TANDEM_SOURCE=fixture) and E2E.
import type { RawComment, RawIssue } from "./types.ts";

const ago = (now: number, hours: number) => new Date(now - hours * 3_600_000).toISOString();

let seq = 0;
const comment = (body: string, createdAt: string, author = "demo-user"): RawComment => ({
  id: `c${++seq}`,
  author,
  body,
  createdAt,
  url: `https://github.com/example/comment/${seq}`,
});

export const requestBody = (id: string, text: string) =>
  `<!-- decision-request ${id} -->\n### Decision needed (${id}): parked\n\n${text}\n\n---\nAnswer in a comment here (\`B\`, or free text); with other decisions on this issue start it with \`${id}:\`. The run picks it up at its next checkpoint.`;

export const recordBody = (id: string, text: string) =>
  `<!-- decision-record ${id} -->\n### Agent decision (${id}): not blocking\n\n${text}\n\n---\nTo change it, comment here, starting with \`${id}:\` so it reaches this decision and not a later one. To accept, remove the \`agent-decided\` label.`;

// Hex colours only: a ")" inside a data URI would end the Markdown image link early.
const HUES: Record<number, [string, string, string]> = {
  210: ["#e6edf5", "#b8cde3", "#2f4d6b"],
  140: ["#e6f2ea", "#b6dcc2", "#2f5b3d"],
  20: ["#f5ebe6", "#e3c6b8", "#6b3f2f"],
  260: ["#ebe8f5", "#c9c0e6", "#3f356b"],
};
/** A stand-in screenshot at a real size (1280x800 desktop, 390x844 mobile): a top bar, a side column on desktop and a few rows, so a stage that shows it at real size can be judged. */
const svg = (label: string, hue: number, w = 1280, h = 800) => {
  const [bg, bar, ink] = HUES[hue]!;
  const side = w > 600 ? 260 : 0;
  const x = 40 + (side ? side + 24 : 0);
  const rows = Array.from({ length: 6 }, (_, i) => `<rect x="${x}" y="${220 + i * 84}" width="${w - x - 40}" height="60" rx="8" fill="#ffffff" stroke="${bar}"/><rect x="${x + 20}" y="${242 + i * 84}" width="${Math.round((w - x - 80) * (0.3 + ((i * 7) % 5) / 10))}" height="14" rx="7" fill="${bar}"/>`).join("");
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${bg}"/><rect x="40" y="40" width="${w - 80}" height="60" rx="8" fill="${bar}"/>${side ? `<rect x="40" y="124" width="${side}" height="${h - 164}" rx="8" fill="${bar}" opacity="0.5"/>` : ""}<text x="${x}" y="176" font-family="sans-serif" font-size="${w > 600 ? 40 : 28}" font-weight="600" fill="${ink}">${label}</text>${rows}</svg>`,
  )}`;
};

export const roundBody = (k: number, title: string) => `<!-- decision-note round R${k} -->
## Design round ${k}: ${title}
Preview: http://localhost:5317/?seed=demo&variant=a
Variants: a, b, c
Three structurally different answers to how the list is grouped.
### a: Grouped list
One list grouped by repo · tech check: S
<details><summary>Details</summary>Groups under sticky repo headers.</details>
### b: Split pane
List left, detail right · tech check: M
<details><summary>Details</summary>Master-detail layout.</details>
### c: Cards grid
Dense grid of cards · tech check: M, risk: layout
<details><summary>Details</summary>Grid layout.</details>
Dropped: timeline: too sparse
**Question:** Which layout should the list use?

![R${k} · a · desktop](${svg(`R${k} a desktop`, 210)})
![R${k} · a · mobile](${svg(`R${k} a mobile`, 210, 390, 844)})
![R${k} · b · desktop](${svg(`R${k} b desktop`, 140)})
![R${k} · b · mobile](${svg(`R${k} b mobile`, 140, 390, 844)})
![R${k} · c · desktop](${svg(`R${k} c desktop`, 20)})
![R${k} · c · mobile](${svg(`R${k} c mobile`, 20, 390, 844)})`;

/** A round that asks two more questions in the same prototype (design batch): the main variants plus the axes `slide` and `back`. */
export const axesRoundBody = (k: number, title: string) => `<!-- decision-note round R${k} -->
## Design round ${k}: ${title}
Preview: http://localhost:5317/welcome?seed=demo&variant=a&slide=a&back=a
Variants: a, b
Axis slide: o, a (how one step gives way to the next)
Axis back: o, a (the way back to the choice)
Samples become a third start option; how steps move and how to go back are open too, and combine freely with either layout.
### a: Three equal rows
All three answers carry the same weight · tech check: S
<details><summary>Details</summary>The start keeps its rule that no answer is primary.</details>
### b: Explore row set apart
Two rows, then a third one under a question · tech check: S
<details><summary>Details</summary>Samples read as a trial, not a place.</details>
### slide o: Fade and lift
Today's transition · tech check: S
### slide a: Sideways slide
Forward leaves left, back mirrors it · tech check: S
### back o: Text link
Today's plain link · tech check: S
### back a: Arrow button
A ghost button with an arrow · tech check: S
**Question:** Which layout (a or b), which slide (o or a) and which way back (o or a)?

![R${k} · a · desktop](${svg(`R${k} a desktop`, 210)})
![R${k} · a · mobile](${svg(`R${k} a mobile`, 210, 390, 844)})
![R${k} · b · desktop](${svg(`R${k} b desktop`, 140)})
![R${k} · slide a · desktop](${svg(`R${k} slide a desktop`, 20)})
![R${k} · back o · desktop](${svg(`R${k} back o desktop`, 260)})
![R${k} · back a · desktop](${svg(`R${k} back a desktop`, 260)})`;

/** One image per question: its options side by side, each with its letter on it (agent-workflow docs/decision-format.md). */
const optionsShot = (label: string, letters: string[], hue: number) => {
  const [bg, bar, ink] = HUES[hue]!;
  const [w, h, gap] = [1280, 520, 40];
  const cw = Math.floor((w - gap * (letters.length + 1)) / letters.length);
  const cells = letters
    .map((l, i) => {
      const x = gap + i * (cw + gap);
      const rows = Array.from({ length: 4 }, (_, r) => `<rect x="${x + 20}" y="${170 + r * 62}" width="${cw - 40}" height="44" rx="6" fill="${bg}" stroke="${bar}"/>`).join("");
      // what differs between the options: where the controls sit
      const controls = [`<rect x="${x + 20}" y="100" width="90" height="30" rx="6" fill="${bar}"/>`, `<rect x="${x + 20}" y="430" width="90" height="30" rx="6" fill="${bar}"/><rect x="${x + cw - 110}" y="430" width="90" height="30" rx="6" fill="${ink}"/>`, `<rect x="${x + 20}" y="100" width="${cw - 40}" height="10" rx="5" fill="${bar}"/>`][i % 3];
      return `<rect x="${x}" y="70" width="${cw}" height="410" rx="10" fill="#ffffff" stroke="${bar}"/>${rows}${controls}<circle cx="${x + 26}" cy="44" r="18" fill="${ink}"/><text x="${x + 26}" y="51" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="700" fill="#ffffff">${l}</text>`;
    })
    .join("");
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${bg}"/>${cells}<text x="${w - gap}" y="50" text-anchor="end" font-family="sans-serif" font-size="20" font-weight="600" fill="${ink}">${label}</text></svg>`)}`;
};

/** A round in the question format: one `###` section per question, a table of lettered options with one ★, the image under its question. */
export const questionRoundBody = (k: number, title: string) => `<!-- decision-note round R${k} -->
## Design round ${k}: ${title}
Preview: http://localhost:5317/setup?seed=demo&variant=1A
Variants: 1A, 1B, 1C, 2A, 2B, 3A, 3B
One sheet for Notion and Reminders. Open: where back sits, the step heading, and how wide the form runs.

### 1. Shell: where back and next sit

| | Option | In short |
|---|---|---|
| A | Rail, back on top (today) | back above, one button below |
| **B ★** | Rail, footer bar | Back left, Next right |
| C | Top stepper | no rail, same form at every width |

★ Why B: back and the main action sit together, like in dialogs.

![R${k} · 1. Shell · A, B, C at 1280](${optionsShot("1. Shell", ["A", "B", "C"], 210)})

### 2. Heading: the step heading in the pane

| | Option | In short |
|---|---|---|
| **A ★** | Hidden | the rail names the step |
| B | Small, visible | heading with the step's action |

★ Why A: say it once.

![R${k} · 2. Heading · A, B at 1280](${optionsShot("2. Heading", ["A", "B"], 140)})

### 3. Width: how wide the form runs

| | Option | In short |
|---|---|---|
| A | Full width (today) | fields stretch with the pane |
| **B ★** | Content width | 560px column, left aligned |

★ Why B: long fields are harder to scan than short ones.

![R${k} · 3. Width · A, B at 1280](${optionsShot("3. Width", ["A", "B"], 20)})

<details><summary>Stories, checks, build cost, dropped</summary>

Job: connect a source · Stories: As a user, when I connect a source, I want back and next together.
Checks: brief asserted · tech check inline
Per option: 1A: rail · S · 1B: footer bar · S · 1C: stepper · M
Dropped: three shells (contradicts #562)
</details>`;

/**
 * A request as `decide.sh request` writes it from question lines (`1 Shell: A (back on top, today) · B ★ (footer bar)`): the hidden
 * `choices` lines, the `+` legend, the one tile `- ok`, and below the `---` the answer template. `head`: the lines after the question (`Preview:`, `Options with screenshots:`).
 */
export const choicesRequestBody = (id: string, question: string, lines: string[], head: string[] = []) => {
  const parsed = lines.map((l) => {
    const [, n, label, rest] = /^(\d+) ([^:]+): (.*)$/.exec(l)!;
    const options = rest!.split(" · ").map((o) => {
      const [, key, star, text] = /^([A-Z])( ★)? \((.*)\)$/.exec(o)!;
      return { key: key!, rec: !!star, text: text! };
    });
    return { n: n!, label: label!, options, rec: options.find((o) => o.rec)! };
  });
  const short = parsed.map((q) => `${q.n}${q.rec.key}`).join(" ");
  return [
    `<!-- decision-request ${id} -->`,
    ...lines.map((l) => `<!-- choices ${l} -->`),
    `### Decision needed (${id})`,
    question,
    ...head,
    "",
    ...parsed.map((q) => `+ **${q.n} ${q.label}:** ${q.options.map((o) => (o.rec ? `**${o.key} ★ (${o.text})**` : `${o.key} (${o.text})`)).join(" · ")}`),
    "",
    "- ok: take every ★ option",
    "",
    `Recommendation: ok (${short})`,
    "",
    "---",
    "Copy, change only the letters you disagree with, post as a comment:",
    "```",
    `Decision ${id}:`,
    ...parsed.map((q) => `${q.n} ${q.label}: ${q.rec.key} (${q.rec.text})`),
    "```",
    `Or reply \`ok\` to take every recommendation. Text after a letter is read as a note. Short form: \`Decision ${id}: ${short}\`. The run picks it up at its next checkpoint.`,
    "",
  ].join("\n");
};

export const lookBody = () => `<!-- decision-note look -->
### Look: Settings page shows the new theme switch
Preview: http://localhost:5317/settings?seed=demo
Path: /settings?seed=demo
Check:
- The switch follows the system theme by default
- Dark theme keeps contrast on muted text

![look · desktop · default](${svg("look desktop", 260)})
![look · mobile · default](${svg("look mobile", 260, 390, 844)})
![look · desktop · empty](${svg("look empty", 140)})`;

function issue(repo: string, number: number, title: string, p: Partial<RawIssue> & { now: number; ageH: number }): RawIssue {
  const { now, ageH, ...rest } = p;
  return {
    repo,
    number,
    title,
    body: "",
    url: `https://github.com/${repo}/issues/${number}`,
    state: "open",
    stateReason: null,
    labels: [],
    createdAt: ago(now, ageH),
    updatedAt: ago(now, Math.max(0, ageH - 1)),
    closedAt: null,
    comments: [],
    pullRequests: [],
    ...rest,
  };
}

export function demoIssues(now = Date.now()): RawIssue[] {
  seq = 0; // same comment ids on every call, so a reset Board equals a freshly booted one
  const A = "acme/app";
  const B = "acme/agent-workflow";
  return [
    issue(A, 101, "Export tasks as CSV", { now, ageH: 50, labels: ["inbox"], body: "Users ask for a CSV export." }),
    issue(A, 102, "Fog: rethink recurring tasks", { now, ageH: 80, body: "Unclear what recurring should mean." }),
    issue(A, 116, "Fog: rethink sharing", { now, ageH: 90, labels: ["inbox", "needs-wayfinder"], body: "Sharing could mean links, teams or export. Too open for one spec." }),
    issue(A, 111, "Fog candidate: sync conflicts", { now, ageH: 85, labels: ["inbox"], body: "Unclear how conflicts should surface." }),
    issue(B, 21, "Retro: shrink the build skill", { now, ageH: 30, labels: ["ready"], body: "## Acceptance criteria\n- skill under 80 lines" }),
    issue(A, 103, "Keyboard shortcut for quick add", { now, ageH: 20, labels: ["needs-spec", "priority:2"], body: "Quick add via `q`." }),
    issue(A, 104, "Statistics page redesign", {
      now,
      ageH: 40,
      labels: ["needs-design", "phase:design", "needs-decision"],
      body: "The statistics page is hard to read.",
      comments: [
        comment(roundBody(1, "Statistics page redesign"), ago(now, 30)),
        comment(roundBody(2, "Statistics page redesign"), ago(now, 6)),
        comment(
          requestBody("D1", "Which layout should the statistics page use?\nPreview: http://localhost:5317/stats?seed=demo&variant=a\n- a: Grouped list\n- b: Split pane\n- c: Cards grid\nRecommendation: b (confidence medium)\n<details><summary>Reasoning</summary>Split pane keeps context.</details>"),
          ago(now, 6),
        ),
      ],
    }),
    issue(A, 110, "Task templates", {
      now,
      ageH: 45,
      labels: ["needs-design", "phase:design", "needs-decision"],
      body: "Users want to start a task from a template.",
      comments: [
        comment(roundBody(1, "Task templates"), ago(now, 28)),
        comment(roundBody(2, "Task templates"), ago(now, 7)),
        comment(requestBody("D1", "Which layout should the template picker use?\n- a: Grouped list\n- b: Split pane\n- c: Cards grid\nRecommendation: a (confidence medium)"), ago(now, 7)),
      ],
    }),
    issue(A, 105, "Sync conflicts lose edits", {
      now,
      ageH: 26,
      labels: ["needs-spec", "phase:build", "needs-decision"],
      body: "Two devices editing the same task lose one edit.",
      comments: [
        comment(
          requestBody("D1", "How should conflicting edits be resolved?\n- A: last write wins, with an undo toast\n- B: field-level merge\n- C: ask the user on conflict\nRecommendation: B (confidence high)\nStays parked: the spec."),
          ago(now, 3),
        ),
      ],
    }),
    issue(A, 106, "Due date picker", {
      now,
      ageH: 60,
      labels: ["ready", "phase:build", "ux-impact", "needs-decision"],
      body: "Pick a due date with the keyboard.",
      pullRequests: [{ number: 210, title: "feat: due date picker", url: `https://github.com/${A}/pull/210`, state: "open", isDraft: false, labels: [], body: "Closes #106\n\n## Review\nNo findings above low.\n\n## Verification\n- unit 212/212\n- e2e 31/31", updatedAt: ago(now, 2) }],
      comments: [comment(requestBody("D1", "Merge held: the PR touches the sync store (risk area). Merge?\n- approve: merge now\n- hold: keep it open\nRecommendation: approve (confidence high)"), ago(now, 2))],
    }),
    issue(A, 107, "Tag colors", {
      now,
      ageH: 15,
      labels: ["ready", "phase:build", "agent-decided"],
      body: "## Decisions\nD1: palette from tokens · alternatives: free hex · why: consistency · cost to switch: low",
      comments: [comment(recordBody("D1", "Chosen: tag colors from the 8 design tokens\nAlternatives: free hex input\nWhy: stays consistent in dark mode\nCost to switch: low"), ago(now, 5))],
    }),
    // a real blocker (D3) next to agent decisions: one challenged, two new. Only the blocker waits on the developer.
    issue(A, 127, "Retry policy for sync", {
      now,
      ageH: 20,
      labels: ["ready", "phase:build", "needs-decision", "agent-decided"],
      body: "Retry failed syncs.",
      comments: [
        comment(requestBody("D3", "Give up after how many failed retries?\n- A: 3\n- B: 5\n- C: never\nRecommendation: B (confidence medium)"), ago(now, 19)),
        comment(recordBody("D1", "Chosen: exponential backoff, 5 tries\nAlternatives: fixed interval\nWhy: spares the rate limit\nCost to switch: low"), ago(now, 18)),
        comment("D1: use a fixed 30 s interval, the backoff hides outages", ago(now, 17)),
        comment(recordBody("D2", "Chosen: log retries at debug level\nAlternatives: info\nWhy: quiet by default\nCost to switch: low"), ago(now, 16)),
        comment(recordBody("D4", "Chosen: cap the delay at 5 minutes\nAlternatives: no cap\nWhy: a stuck sync stays visible\nCost to switch: low"), ago(now, 15)),
      ],
    }),
    issue(B, 22, "Coordinator: digest on idle", { now, ageH: 10, labels: ["ready", "phase:build", "priority:1"], body: "Digest when idle." }),
    issue(A, 108, "Theme switch in settings", {
      now,
      ageH: 200,
      state: "closed",
      stateReason: "completed",
      closedAt: ago(now, 4),
      labels: ["ux-impact"],
      body: "## UX decision\n**Chosen:** segmented control.",
      comments: [comment(lookBody(), ago(now, 5))],
      pullRequests: [{ number: 205, title: "feat: theme switch", url: `https://github.com/${A}/pull/205`, state: "merged", isDraft: false, labels: [], body: "Closes #108", updatedAt: ago(now, 4) }],
    }),
    issue(B, 23, "Fix decide.sh digest", { now, ageH: 100, state: "closed", stateReason: "completed", closedAt: ago(now, 30), labels: [] }),
    issue(A, 117, "Cache size limit", {
      now,
      ageH: 12,
      labels: ["ready", "phase:build", "needs-decision"],
      body: "Cap the offline cache.",
      comments: [comment(requestBody("D1", "How large may the offline cache grow?\n- A: 50 MB\n- B: 200 MB\n- C: unlimited\nRecommendation: B (confidence medium)"), ago(now, 8))],
    }),
    issue(A, 118, "Onboarding tour", {
      now,
      ageH: 40,
      labels: ["needs-design", "phase:design", "needs-decision"],
      body: "A first-run tour.",
      comments: [
        comment(roundBody(1, "Onboarding tour"), ago(now, 10)),
        comment(requestBody("D1", "Which layout should the tour use?\n- a: Grouped list\n- b: Split pane\n- c: Cards grid\nRecommendation: b (confidence medium)"), ago(now, 10)),
      ],
    }),
    issue(A, 119, "Compact density toggle", {
      now,
      ageH: 150,
      state: "closed",
      stateReason: "completed",
      closedAt: ago(now, 3),
      labels: ["ux-impact"],
      body: "## UX decision\n**Chosen:** a toggle in settings.",
      comments: [comment(lookBody(), ago(now, 3.5))],
      pullRequests: [{ number: 206, title: "feat: density toggle", url: `https://github.com/${A}/pull/206`, state: "merged", isDraft: false, labels: [], body: "Closes #119", updatedAt: ago(now, 3) }],
    }),
    // Done Cards with a Look the Waiting on me E2E spec marks Seen (open, row button, bulk); nothing else touches them
    ...[
      [160, "Seen demo: opened", 2.5],
      [161, "Seen demo: row button", 2.6],
      [162, "Seen demo: bulk one", 2.7],
      [163, "Seen demo: bulk two", 2.8],
      [164, "Seen demo: key neighbours a", 2.4],
      [165, "Seen demo: key neighbours b", 2.3],
    ].map(([n, title, h]) =>
      issue(A, n as number, title as string, {
        now,
        ageH: 120,
        state: "closed",
        stateReason: "completed",
        closedAt: ago(now, h as number),
        labels: ["ux-impact"],
        body: "## UX decision\n**Chosen:** demo.",
        comments: [comment(lookBody(), ago(now, (h as number) + 0.5))],
      }),
    ),
    // Feedback stability E2E (feedback.spec.ts owns 170-177): blockers an answer from outside takes away, and one panel of each kind for drafts and pick-then-send
    ...[170, 171, 172].map((n, i) =>
      issue(A, n, `Stability demo: decision ${i + 1}`, {
        now,
        ageH: 30 - i,
        labels: ["ready", "phase:build", "needs-decision"],
        body: "Fixture for answers from outside and drafts.",
        comments: [comment(requestBody("D1", `Which option for stability demo ${i + 1}?\n- A: first\n- B: second\nRecommendation: B (confidence medium)`), ago(now, 20 - i))],
      }),
    ),
    issue(A, 173, "Stability demo: PR approval", {
      now,
      ageH: 31,
      labels: ["ready", "phase:build", "needs-decision"],
      body: "Fixture for pick-then-send on a PR approval.",
      pullRequests: [{ number: 212, title: "feat: stability demo", url: `https://github.com/${A}/pull/212`, state: "open", isDraft: false, labels: [], body: "Closes #173\n\n## Review\nNo findings above low.", updatedAt: ago(now, 2) }],
      comments: [comment(requestBody("D1", "Merge held: risk area. Merge?\n- approve: merge now\n- hold: keep it open\nRecommendation: approve (confidence high)"), ago(now, 2))],
    }),
    issue(A, 177, "Stability demo: PR approval for clicks", {
      now,
      ageH: 32,
      labels: ["ready", "phase:build", "needs-decision"],
      body: "Fixture for pick-then-send on a PR approval.",
      pullRequests: [{ number: 213, title: "feat: stability clicks", url: `https://github.com/${A}/pull/213`, state: "open", isDraft: false, labels: [], body: "Closes #177\n\n## Review\nNo findings above low.", updatedAt: ago(now, 2) }],
      comments: [comment(requestBody("D1", "Merge held: risk area. Merge?\n- approve: merge now\n- hold: keep it open\nRecommendation: approve (confidence high)"), ago(now, 2))],
    }),
    // a Look the E2E marks Seen from outside, so the list changes length (newest, so it sorts last in To look at)
    issue(A, 176, "Stability demo: look", {
      now,
      ageH: 120,
      state: "closed",
      stateReason: "completed",
      closedAt: ago(now, 1),
      labels: ["ux-impact"],
      body: "## UX decision\n**Chosen:** demo.",
      comments: [comment(lookBody(), ago(now, 1.5))],
    }),
    issue(A, 174, "Stability demo: agent decisions", {
      now,
      ageH: 15,
      labels: ["ready", "phase:build", "agent-decided"],
      body: "## Decisions\nD1: a · alternatives: b · why: c · cost to switch: low",
      comments: [comment(recordBody("D1", "Chosen: a\nAlternatives: b\nWhy: c\nCost to switch: low"), ago(now, 5))],
    }),
    issue(A, 175, "Stability demo: design round", {
      now,
      ageH: 40,
      labels: ["needs-design", "phase:design", "needs-decision"],
      body: "Fixture for drafts of a design round.",
      comments: [comment(roundBody(1, "Stability demo"), ago(now, 10)), comment(requestBody("D1", "Which layout?\n- a: Grouped list\n- b: Split pane\n- c: Cards grid\nRecommendation: b (confidence medium)"), ago(now, 10))],
    }),
    // A round with further axes (design batch: slide and back beside the layout); its request is the newest design round, so it waits last
    issue(A, 182, "Axes demo: welcome samples", {
      now,
      ageH: 30,
      labels: ["needs-design", "phase:design", "needs-decision"],
      body: "Samples become a third start option on the welcome screen.",
      comments: [
        comment(axesRoundBody(1, "Axes demo: welcome samples"), ago(now, 5.5)),
        comment(requestBody("D1", "Which layout, slide and way back?\nPreview: http://localhost:5317/welcome?seed=demo&variant=a&slide=a&back=a\nRecommendation: a, slide a, back a"), ago(now, 5.5)),
      ],
    }),
    // Dialog keys E2E (dialogs.spec.ts owns 178-179): two design rounds, so a key sent from one Card's Gallery can be checked against the Card that opens next
    ...[178, 179].map((n) =>
      issue(A, n, `Dialog keys demo ${n}`, {
        now,
        ageH: 40,
        labels: ["needs-design", "phase:design", "needs-decision"],
        body: "Fixture for keys inside a dialog.",
        comments: [comment(roundBody(1, `Dialog keys demo ${n}`), ago(now, 10)), comment(requestBody("D1", "Which layout?\n- a: Grouped list\n- b: Split pane\n- c: Cards grid\nRecommendation: b (confidence medium)"), ago(now, 10))],
      }),
    ),
    // The question level (#13): a round in the question format with its request, a request with `choices` lines and no round, and an
    // older one-question request whose options carry Markdown
    issue(A, 183, "Setup sheet for connections", {
      now,
      ageH: 52,
      labels: ["needs-design", "phase:design", "needs-decision"],
      body: "## Problem\n\nConnecting Notion and Reminders are two different flows today, and the way back is in a different place in each.\n\nJob: connect a source without losing my place.\n\n## Solution\n\nOpen (needs a design round): one sheet for both, with a rail that names the steps.\n\n- back and next sit together\n- the same form at every width",
      comments: [
        comment(questionRoundBody(1, "Setup sheet for connections"), ago(now, 4.5)),
        comment(
          choicesRequestBody(
            "D1",
            "Setup sheet: 3 choices",
            ["1 Shell: A (back on top, today) · B ★ (footer bar) · C (top stepper)", "2 Heading: A ★ (hidden) · B (small, visible)", "3 Width: A (full width, today) · B ★ (content width)"],
            ["Preview: http://localhost:5317/setup?seed=demo&variant=1A", "Options with screenshots: https://github.com/acme/app/issues/183#issuecomment-1"],
          ),
          ago(now, 4.4),
        ),
      ],
    }),
    issue(A, 184, "Retry policy for webhooks", {
      now,
      ageH: 22,
      labels: ["needs-spec", "phase:build", "needs-decision"],
      body: "Failed webhook deliveries are dropped today.\n\n## Acceptance criteria\n- a failed delivery is retried\n- a delivery that keeps failing is visible",
      comments: [
        comment(
          choicesRequestBody("D1", "Webhook retries: 4 choices", ["1 Backoff: A (fixed 30 s) · B ★ (exponential, capped)", "2 Give up: A (3 tries) · B ★ (5 tries) · C (never)", "3 Dead letters: A ★ (keep 7 days) · B (drop)", "4 Alert: A (every failure) · B ★ (on give up)"]),
          ago(now, 9),
        ),
      ],
    }),
    issue(A, 185, "Visual re-design of the desk", {
      now,
      ageH: 470,
      labels: ["needs-design", "phase:design", "needs-decision"],
      body: "The desk should get a look of its own.",
      comments: [
        comment(
          requestBody(
            "D1",
            'Which look should Build take?\n- **H1 Sunlit Outline** (S). Yellow desk, ink outlines, no shadows on overlays.\n- **H2 Sticker Desk** (M). Hard shadows, tilted labels, yellow only for `Jetzt`.\n- **A3 Ink Pills** (S). Boldest headings, ink pill group heads.\n- Or a mix ("H1 outlines with A3 pill headings"), then round 3.\nRecommendation: **H1 Sunlit Outline**, confidence ~45% (taste). It keeps the clear outlines you liked and costs little to build.',
          ),
          ago(now, 456),
        ),
      ],
    }),
    // Backlog Cards the Hand to agent E2E spec hands over (app has a fake coordinator, agent-workflow does not)
    issue(A, 130, "Hand demo: delivered", { now, ageH: 15, labels: ["ready"], body: "Hand this one to the coordinator." }),
    issue(A, 131, "Hand demo: failing Push", { now, ageH: 16, labels: ["ready"], body: "Its Push fails once." }),
    issue(B, 40, "Hand demo: no coordinator", { now, ageH: 17, labels: ["ready"], body: "No coordinator runs for this repo." }),
    // native issue status (#18): Todo = handed and not started yet; the other demo issues have none (older than statuses) and sit where their labels put them
    issue(A, 132, "Hand demo: handed earlier", { now, ageH: 18, labels: ["ready"], status: "Todo", body: "Handed to the coordinator before this page was opened: the status on GitHub says so." }),
    // agents at work, in every activity state (their log lines come from the fixture source's `fixtureActivity`)
    // in Build by its status alone: no phase label
    issue(A, 112, "Undo for deleted tasks", { now, ageH: 3, labels: ["ready"], status: "In progress", body: "Undo a delete for 10 seconds." }),
    issue(A, 113, "Offline banner", {
      now,
      ageH: 9,
      labels: ["ready", "phase:build", "needs-decision"],
      body: "Show a banner while offline.",
      comments: [comment(requestBody("D1", "Where does the banner go?\n- A: top\n- B: bottom\nRecommendation: A (confidence high)"), ago(now, 4)), comment("A", ago(now, 1))],
    }),
    issue(A, 114, "Bulk edit tags", { now, ageH: 12, labels: ["ready", "phase:build", "on-hold"], body: "Edit tags of many tasks at once." }),
    // Move demo (#19): Cards for the multi-select and move specs; Inbox Cards sit above the older ones (newest first)
    // Shortcut overview E2E (shortcuts.spec.ts owns 180-181): the palette picks on a PR approval and on two agent decisions, both only drafts (nothing is sent)
    issue(A, 180, "Shortcuts demo: PR approval", {
      now,
      ageH: 33,
      labels: ["ready", "phase:build", "needs-decision"],
      body: "Fixture for the palette entries of a PR approval.",
      pullRequests: [{ number: 214, title: "feat: shortcuts demo", url: `https://github.com/${A}/pull/214`, state: "open", isDraft: false, labels: [], body: "Closes #180\n\n## Review\nNo findings above low.", updatedAt: ago(now, 2) }],
      comments: [comment(requestBody("D1", "Merge held: risk area. Merge?\n- approve: merge now\n- hold: keep it open\nRecommendation: approve (confidence high)"), ago(now, 2))],
    }),
    issue(A, 181, "Shortcuts demo: agent decisions", {
      now,
      ageH: 16,
      labels: ["ready", "phase:build", "agent-decided"],
      body: "## Decisions\nD1: a · alternatives: b · why: c · cost to switch: low\nD2: x · alternatives: y · why: z · cost to switch: low",
      comments: [comment(recordBody("D1", "Chosen: a\nAlternatives: b\nWhy: c\nCost to switch: low"), ago(now, 6)), comment(recordBody("D2", "Chosen: x\nAlternatives: y\nWhy: z\nCost to switch: low"), ago(now, 5))],
    }),
    ...["A", "B", "C", "D", "E", "F", "G"].map((l, i) => issue(A, 150 + i, `Move demo ${l}`, { now, ageH: 2 + i / 10, labels: ["inbox"], body: "Fixture for multi-select and moving Cards." })),
    // Toast E2E (toast.spec.ts owns 190-194): Backlog Cards it moves to the Inbox and back (the Inbox is where other specs count on the order); oldest, so they start at the bottom of the Backlog
    ...["A", "B", "C", "D", "E"].map((l, i) => issue(A, 190 + i, `Toast demo ${l}`, { now, ageH: 600 + i, labels: ["needs-spec"], body: "Fixture for the toast stack and its Undo." })),
    issue(A, 157, "Move demo H (planned)", { now, ageH: 3, labels: ["needs-spec"], body: "A Backlog Card that moves back to Inbox." }),
    // Done, Seen, on different days (the Done column groups by closing day)
    ...[26, 30, 52, 55, 78, 100, 125, 150].map((h, i) =>
      issue(i % 2 ? B : A, 200 + i, `Shipped: ${["small fixes", "tag filter", "export dialog", "sync retry", "keyboard help", "empty states", "icon refresh", "speed pass"][i]}`, {
        now,
        ageH: h + 20,
        state: "closed",
        stateReason: "completed",
        closedAt: ago(now, h),
        updatedAt: ago(now, h),
      }),
    ),
    // wayfinder issues (a map and a decision ticket): never Cards
    issue(A, 109, "Wayfinder: offline mode", { now, ageH: 300, labels: ["wayfinder:map"], body: "## Destination\n\nA spec for working offline." }),
    issue(A, 121, "Which sync library fits?", { now, ageH: 200, labels: ["wayfinder:research"], body: "## Question\n\nTo be resolved." }),
  ];
}
