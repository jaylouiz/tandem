import { expect, test, type Page } from "./fixtures.ts";

// An ask with several questions (#13): one step per question plus Review, the recommendation picked from the start, a pick moves on,
// one Send writes one comment that starts with `Decision D<k>:` (#1). Demo Cards: #183 (a round in the question format with its request),
// #184 (a request with choices and no round), #185 and #105 (one question in the older shape).
const detail = (page: Page) => page.getByTestId("detail");
const panel = (page: Page) => detail(page).locator(".askp");
const steps = (page: Page) => page.getByTestId("steps");
const step = (page: Page, n: number | "review") => page.getByTestId(`step-${n}`);
const option = (page: Page, letter: string) => page.getByTestId(`option-${letter}`);
const writes = (page: Page) => page.getByTestId("writes");
const open = async (page: Page, n: number, view: "waiting" | "board" = "waiting") => {
  await page.goto(`/${view}/acme/app/${n}`);
  await expect(detail(page)).toHaveAttribute("aria-label", `Card acme/app#${n}`);
  await expect(panel(page)).toBeVisible();
};
/** The answer as the server holds it: what was really written on the issue. */
const written = async (page: Page, n: number) => {
  const board = (await (await page.request.get("/api/board")).json()) as { cards: { key: string; requests: { answer: string | null }[]; awaitingPickup: boolean }[] };
  const card = board.cards.find((c) => c.key === `acme/app#${n}`)!;
  return { answer: card.requests.at(-1)!.answer, pickup: card.awaitingPickup };
};
/** Count the writes to a Card's answer route (a pick must never be one). */
const countAnswers = (page: Page, n: number) => {
  const sent: string[] = [];
  page.on("request", (r) => r.method() === "POST" && r.url().endsWith(`/${n}/answer`) && sent.push(r.postData() ?? ""));
  return sent;
};

test("a design round in the question format: one step per question plus Review, one question on screen, every recommendation picked", async ({ page }) => {
  await open(page, 183);
  await expect(detail(page).getByTestId("panel-design-round")).toBeVisible();
  await expect(panel(page).locator(".section-title")).toHaveText("Setup sheet: 3 choices");
  await expect(page.getByTestId("ask-meta")).toContainText(/D1\s*waiting \d+[mhd]\s*3 questions\s*picked unless you change it/);
  await expect(page.getByTestId("ask-meta").getByRole("link", { name: "Open prototype" })).toHaveAttribute("href", /setup\?seed=demo/);
  await expect(steps(page).getByRole("tab")).toHaveText(["1ShellB", "2HeadingA", "3WidthB", "Review"]);
  await expect(step(page, 1)).toHaveAttribute("aria-selected", "true");
  // one question on screen: what it decides, its options with name, today tag, in short and the recommendation
  await expect(page.locator(".qgroup")).toHaveCount(1);
  await expect(page.getByTestId("question-1").locator(".qhead")).toContainText("Shellwhere back and next sit");
  await expect(page.getByTestId("question-1").getByRole("radio")).toHaveCount(3);
  await expect(option(page, "A")).toContainText("ARail, back on toptodayback above, one button below");
  await expect(option(page, "B")).toContainText("Recommended");
  await expect(option(page, "B")).toHaveAttribute("aria-checked", "true");
  await expect(option(page, "A")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("why")).toHaveText("Why B: back and the main action sit together, like in dialogs.");
  // the send row is there from the first step: what the answer says and the comment that will be written
  await expect(page.getByTestId("summary")).toHaveText("All 3 as recommended");
  await expect(writes(page)).toHaveText("Decision D1: ok");
  await expect(page.getByTestId("send-row")).toContainText("Writes on app#183");
});

test("opening the Card and pressing ⌘↵ writes the ok form", async ({ page }) => {
  const sent = countAnswers(page, 183);
  await open(page, 183, "board"); // beside the Board the answered Card stays open (in Waiting on me the next blocker takes its place)
  await page.keyboard.press("Meta+Enter");
  await expect(detail(page).getByTestId("awaiting-pickup")).toBeVisible();
  await expect.poll(async () => (await written(page, 183)).answer).toBe("Decision D1: ok");
  expect(sent).toHaveLength(1);
  expect(JSON.parse(sent[0]!)).toMatchObject({ requestId: "D1", answer: "ok", push: true });
});

test("a digit or a click picks and moves to the next question, the last pick lands on Review; [ ] and a step move without picking; nothing is written before Send", async ({ page }) => {
  const sent = countAnswers(page, 183);
  await open(page, 183);
  await page.keyboard.press("1"); // 1 Shell: A
  await expect(step(page, 2)).toHaveAttribute("aria-selected", "true");
  await expect(step(page, 1)).toContainText("1ShellA");
  await expect(page.getByTestId("question-2")).toBeVisible();
  await option(page, "B").click(); // 2 Heading: B, by click
  await expect(step(page, 3)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("2"); // 3 Width: B (the recommendation): the last pick moves to Review
  await expect(step(page, "review")).toHaveAttribute("aria-selected", "true");
  const review = page.getByTestId("review");
  await expect(review.locator("li")).toHaveCount(3);
  await expect(page.getByTestId("review-1")).toContainText("ShellA Rail, back on top");
  await expect(page.getByTestId("review-1").locator(".star")).toHaveCount(0);
  await expect(page.getByTestId("review-3")).toContainText("WidthB Content width");
  await expect(page.getByTestId("review-3").locator(".star")).toHaveCount(1); // ★: it is the recommendation
  await expect(page.getByTestId("summary")).toHaveText("1 of 3 as recommended, 1A 2B changed");
  await expect(writes(page)).toHaveText("Decision D1: ok. 1A 2B");
  // digits pick nothing on Review; [ and ] move between the steps without picking
  await page.keyboard.press("1");
  await expect(writes(page)).toHaveText("Decision D1: ok. 1A 2B");
  await page.keyboard.press("[");
  await expect(step(page, 3)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("[");
  await page.keyboard.press("[");
  await page.keyboard.press("["); // stays on the first
  await expect(step(page, 1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("]");
  await expect(step(page, 2)).toHaveAttribute("aria-selected", "true");
  await expect(writes(page)).toHaveText("Decision D1: ok. 1A 2B");
  // a click on a step goes there; Change on Review returns to its question
  await step(page, "review").click();
  await page.getByTestId("review-2").getByRole("button", { name: "Change 2 Heading" }).click();
  await expect(step(page, 2)).toHaveAttribute("aria-selected", "true");
  await expect(option(page, "B")).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("1"); // back to the recommendation
  await expect(writes(page)).toHaveText("Decision D1: ok. 1A");
  await page.waitForTimeout(200);
  expect(sent).toHaveLength(0); // picking through every question wrote nothing
  // one Send, one comment: what was shown is what is written
  await page.getByTestId("send").click();
  await expect.poll(async () => (await written(page, 183)).answer).toBe("Decision D1: ok. 1A");
  expect(sent).toHaveLength(1);
});

test("by keyboard alone: the arrows move between the options and stay in the ask, Space picks and the focus follows to the next question", async ({ page }) => {
  await open(page, 183, "board");
  await option(page, "B").focus(); // Tab lands on the picked option: one stop for the group
  await expect(option(page, "A")).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("ArrowDown");
  await expect(option(page, "C")).toBeFocused();
  await page.keyboard.press("ArrowDown"); // the last one: stays
  await expect(option(page, "C")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(option(page, "A")).toBeFocused();
  await expect(detail(page)).toHaveAttribute("aria-label", "Card acme/app#183"); // ↓ did not open the next Card
  await expect(option(page, "B")).toHaveAttribute("aria-checked", "true"); // the arrows move, they do not pick
  await page.keyboard.press("Space");
  // the pick moved on: the keyboard is on the picked option of question 2, not lost
  await expect(step(page, 2)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("question-2").getByRole("radio", { checked: true })).toBeFocused();
  await expect(steps(page).getByRole("status")).toHaveText("Question 2 of 3: Heading");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter"); // the last pick lands on Review, with the keyboard on its step
  await expect(step(page, "review")).toBeFocused();
  await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", await step(page, "review").getAttribute("id") ?? "");
  await expect(writes(page)).toHaveText("Decision D1: ok. 1A");
});

test("a note on a question travels with its letter: one line per question; ⌘↵ sends from the note", async ({ page }) => {
  await open(page, 183);
  await page.keyboard.press("3"); // 1 Shell: C
  await page.keyboard.press("[");
  await page.getByTestId("note-add").click();
  const note = page.getByTestId("note");
  await expect(note).toBeFocused();
  await expect(note).toHaveAttribute("placeholder", 'Note on Shell, e.g. "but calmer"');
  await note.fill("but calmer");
  await expect(page.getByTestId("summary")).toHaveText("2 of 3 as recommended, 1C changed, 1 note");
  await expect(writes(page)).toHaveText("Decision D1: 1 Shell: C (Top stepper) but calmer\n2 Heading: A (Hidden)\n3 Width: B (Content width)");
  // typing a digit in the note is text, not a pick
  await note.press("End");
  await note.pressSequentially(" 2");
  await expect(note).toHaveValue("but calmer 2");
  await note.fill("but calmer");
  await step(page, "review").click();
  await expect(page.getByTestId("review-1")).toContainText("“but calmer”");
  await step(page, 1).click();
  await page.getByTestId("note").press("Meta+Enter");
  await expect.poll(async () => (await written(page, 183)).answer).toBe("Decision D1: 1 Shell: C (Top stepper) but calmer\n2 Heading: A (Hidden)\n3 Width: B (Content width)");
});

test("picks, notes and the step survive a reload and a Card switch; they go once the answer is sent", async ({ page }) => {
  await open(page, 184);
  await expect(steps(page).getByRole("tab")).toHaveCount(5); // four questions and Review
  await page.keyboard.press("1"); // 1 Backoff: A
  await page.keyboard.press("3"); // 2 Give up: C
  await page.getByTestId("note-add").click();
  await page.getByTestId("note").fill("for a week");
  await expect(step(page, 3)).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(panel(page)).toBeVisible();
  await expect(step(page, 3)).toHaveAttribute("aria-selected", "true");
  await expect(steps(page).getByRole("tab")).toHaveText(["1BackoffA", "2Give upC", "3Dead lettersA", "4AlertB", "Review"]);
  await expect(page.getByTestId("note")).toHaveValue("for a week");
  await page.goto("/waiting/acme/app/105");
  await expect(detail(page)).toHaveAttribute("aria-label", "Card acme/app#105");
  await page.goto("/waiting/acme/app/184");
  await expect(writes(page)).toHaveText("Decision D1: 1 Backoff: A (fixed 30 s)\n2 Give up: C (never)\n3 Dead letters: A (keep 7 days) for a week\n4 Alert: B (on give up)");
  await page.getByTestId("send").click();
  await expect(detail(page)).not.toHaveAttribute("aria-label", "Card acme/app#184"); // the next blocker took its place
  await expect.poll(() => page.evaluate(() => localStorage.getItem("tandem.drafts"))).toBeNull();
});

test("a failed send keeps picks, notes and the step, and says why; nothing was written", async ({ page }) => {
  await page.route("**/api/cards/acme/app/183/answer", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) }));
  await open(page, 183);
  await page.keyboard.press("1");
  await page.getByTestId("note-add").click();
  await page.getByTestId("note").fill("smaller");
  await page.getByTestId("send").click();
  await expect(detail(page).getByTestId("not-sent")).toHaveText(/Not sent: boom\s*Dismiss/);
  await expect(detail(page)).toHaveAttribute("aria-label", "Card acme/app#183");
  await expect(step(page, 2)).toHaveAttribute("aria-selected", "true");
  await expect(steps(page).getByRole("tab").first()).toHaveText("1ShellA");
  await expect(page.getByTestId("note")).toHaveValue("smaller");
  expect((await written(page, 183)).answer).toBeNull();
  await detail(page).getByTestId("not-sent").getByRole("button", { name: "Dismiss" }).click();
  await expect(detail(page).getByTestId("not-sent")).toHaveCount(0);
});

test("a second ⌘↵ while the answer is being sent writes nothing more", async ({ page }) => {
  const sent = countAnswers(page, 183);
  await page.route("**/api/cards/acme/app/183/answer", async (r) => {
    await new Promise((res) => setTimeout(res, 400));
    await r.continue();
  });
  await open(page, 183, "board");
  await page.keyboard.press("Meta+Enter");
  await page.keyboard.press("Meta+Enter");
  await page.keyboard.press("Meta+Enter");
  await expect.poll(async () => (await written(page, 183)).answer).toBe("Decision D1: ok");
  await page.waitForTimeout(300);
  expect(sent).toHaveLength(1);
});

test("a question without a recommendation blocks Send until it has a pick", async ({ page }) => {
  // the request of #184 as it arrives, with the ★ of question 2 taken away
  await page.route("**/api/events*", async (route) => {
    const board = (await (await page.request.get("/api/board")).json()) as { cards: { key: string; requests: { body: string }[] }[] };
    for (const c of board.cards) if (c.key === "acme/app#184") c.requests[0]!.body = c.requests[0]!.body.replace("B ★ (5 tries)", "B (5 tries)");
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: `event: board\ndata: ${JSON.stringify(board)}\n\n` });
  });
  const sent = countAnswers(page, 184);
  await open(page, 184);
  await expect(steps(page).getByRole("tab")).toHaveText(["1BackoffB", "2Give up–", "3Dead lettersA", "4AlertB", "Review"]); // a dash: nothing picked
  await expect(page.getByTestId("summary")).toHaveText("3 of 4 picked");
  const send = page.getByTestId("send");
  await expect(send).toHaveAttribute("aria-disabled", "true");
  await expect(send).toHaveAttribute("title", "Pick an option for every question");
  await expect(page.getByTestId("send-row")).toContainText("Pick an option for every question");
  await page.keyboard.press("Meta+Enter");
  await send.click({ force: true }); // Playwright waits on an aria-disabled button; a person can still click it
  await page.waitForTimeout(200);
  expect(sent).toHaveLength(0);
  await step(page, 2).click();
  await expect(page.getByTestId("why")).toHaveCount(0);
  await page.keyboard.press("1");
  await expect(send).not.toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("writes")).toHaveText("Decision D1: 1B 2A 3A 4B"); // no `ok`: not every question has a recommendation
});

test("a question's screenshot opens the screenshot view on that question: digits pick there, ← → change the question, ⌘↵ sends", async ({ page }) => {
  await open(page, 183);
  await page.keyboard.press("]"); // question 2
  await page.getByRole("button", { name: "Open the screenshot of 2. Heading" }).click();
  const g = page.getByTestId("gallery");
  await expect(g).toBeVisible();
  await expect(g.getByTestId("gallery-title")).toHaveText("2. Heading");
  await expect(g.getByTestId("gallery-count")).toHaveText("2 / 3");
  await expect(g.getByRole("radio")).toHaveText(["1A Hidden", "2B Small, visible"]);
  await expect(g.getByTestId("gallery-option-A")).toHaveAttribute("aria-checked", "true");
  await expect(g).toBeFocused(); // its keys are the popup's: they need the focus in it
  await page.keyboard.press("2"); // picks B and stays on this question
  await expect(g.getByTestId("gallery-option-B")).toHaveAttribute("aria-checked", "true");
  await expect(g.getByTestId("gallery-title")).toHaveText("2. Heading");
  await page.keyboard.press("ArrowLeft");
  await expect(g.getByTestId("gallery-title")).toHaveText("1. Shell");
  await expect(g.getByRole("button", { name: "Previous question" })).toHaveAttribute("aria-disabled", "true");
  await expect(g.getByRole("button", { name: "Previous question" })).toHaveAttribute("title", "This is the first question");
  await g.getByTestId("gallery-option-C").click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(g.getByTestId("gallery-title")).toHaveText("3. Width");
  await expect(g.getByRole("button", { name: "Next question" })).toHaveAttribute("title", "This is the last question");
  // #5: the legend in three groups, the keys that answer first, on one line
  await expect(g.getByTestId("gallery-hint").locator(".legend-group > b")).toHaveText(["Pick", "Move", "View"]);
  await expect(g.getByTestId("legend-pick")).toHaveText(/Pick\s*1–2\s*an option\s*⌘↵\s*send the answer/);
  await expect(g.getByTestId("legend-move")).toHaveText(/Move\s*←\s*→\s*question/);
  await expect(g.getByTestId("legend-view")).toHaveText(/View\s*esc\s*close/);
  // Esc closes it and the picks are in the panel
  await page.keyboard.press("Escape");
  await expect(g).toHaveCount(0);
  await expect(steps(page).getByRole("tab")).toHaveText(["1ShellC", "2HeadingB", "3WidthB", "Review"]);
  // ⌘↵ in the view sends the whole answer
  await page.getByRole("button", { name: "Open the screenshot of 2. Heading" }).click();
  await expect(g).toBeFocused(); // its keys are the popup's: they need the focus in it
  await page.keyboard.press("Meta+Enter");
  await expect(g).toHaveCount(0);
  await expect.poll(async () => (await written(page, 183)).answer).toBe("Decision D1: ok. 1C 2B");
});

test("one question in the older shape: no steps, no Review; the options' Markdown is rendered, the recommendation is picked and its reason follows", async ({ page }) => {
  await open(page, 185);
  await expect(detail(page).getByTestId("panel-decision")).toBeVisible();
  await expect(page.getByTestId("steps")).toHaveCount(0);
  await expect(page.getByTestId("review")).toHaveCount(0);
  await expect(page.getByTestId("ask-meta")).not.toContainText("questions");
  const rows = page.getByTestId("question-1").getByRole("radio");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toHaveAttribute("aria-checked", "true");
  await expect(rows.nth(0)).toContainText("H1 Sunlit Outline");
  await expect(rows.nth(0)).toContainText("Recommended");
  await expect(rows.nth(0)).not.toContainText("**"); // no Markdown markup in the text
  await expect(rows.nth(1).locator("code")).toHaveText("Jetzt"); // `Jetzt` is rendered as code
  await expect(page.getByTestId("why")).toHaveText("Why: confidence ~45% (taste). It keeps the clear outlines you liked and costs little to build.");
  await expect(writes(page)).toHaveText("Decision D1: H1 Sunlit Outline");
  // a pick plus Send; the note travels after the key
  await page.keyboard.press("3");
  await expect(rows.nth(2)).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("note-add").click();
  await expect(page.getByTestId("note")).toHaveAttribute("placeholder", "Add a note, or answer in your own words");
  await page.getByTestId("note").fill("with H1's outlines");
  await expect(writes(page)).toHaveText("Decision D1: A3 Ink Pills. with H1's outlines");
  // the pick can be taken back: an answer in words alone
  await rows.nth(2).click();
  await expect(writes(page)).toHaveText("Decision D1: with H1's outlines");
  await page.getByTestId("send").click();
  await expect.poll(async () => (await written(page, 185)).answer).toBe("Decision D1: with H1's outlines");
});

test("a request without options is answered in words", async ({ page }) => {
  await page.route("**/api/events*", async (route) => {
    const board = (await (await page.request.get("/api/board")).json()) as { cards: { key: string; requests: { options: string[]; recommendation: string | null }[] }[] };
    for (const c of board.cards) if (c.key === "acme/app#105") Object.assign(c.requests[0]!, { options: [], recommendation: null });
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: `event: board\ndata: ${JSON.stringify(board)}\n\n` });
  });
  await open(page, 105);
  await expect(panel(page).getByRole("radio")).toHaveCount(0);
  const send = page.getByTestId("send");
  await expect(send).toHaveAttribute("title", "Write an answer");
  await panel(page).getByRole("textbox", { name: "Your answer" }).fill("merge per field");
  await expect(writes(page)).toHaveText("Decision D1: merge per field");
  await expect(send).not.toHaveAttribute("aria-disabled", "true");
});

// ---- Focus ----

const startFocusOn = async (page: Page, n: number) => {
  await page.goto("/waiting");
  await expect(page.getByTestId("waiting-list").locator(".qrow").first()).toBeVisible();
  await page.keyboard.press("f");
  await page.getByTestId("focus-overview").locator(`button[data-card="acme/app#${n}"]`).click();
  await expect(page.getByTestId("cover-meta")).toContainText(`#${n}`);
};

test("Focus: several questions are never sent by a click or a digit, only by ⌘↵ or Send answer; [ ] move between the questions", async ({ page }) => {
  const sent = countAnswers(page, 183);
  await startFocusOn(page, 183);
  const cover = page.getByTestId("cover-questions");
  await expect(cover).toBeVisible();
  await expect(cover.getByTestId("steps").getByRole("tab")).toHaveText(["1ShellB", "2HeadingA", "3WidthB", "Review"]);
  await expect(page.getByTestId("keyline")).toContainText(/1–3\s*pick, then the next question\s*\[ \]\s*question\s*⌘↵\s*send the answer/);
  const bar = page.getByTestId("sendbar");
  await expect(bar.getByTestId("summary")).toHaveText("All 3 as recommended");
  await expect(bar.getByTestId("writes")).toHaveText("Decision D1: ok");
  await page.keyboard.press("1");
  await cover.getByTestId("option-B").click();
  await page.keyboard.press("1");
  await expect(cover.getByTestId("review")).toBeVisible();
  await page.keyboard.press("[");
  await expect(cover.getByTestId("step-3")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("]");
  await expect(cover.getByTestId("step-review")).toHaveAttribute("aria-selected", "true");
  await page.waitForTimeout(250);
  expect(sent).toHaveLength(0);
  await expect(page.getByTestId("cover-meta")).toContainText("#183"); // still on this ask
  await expect(bar.getByTestId("writes")).toHaveText("Decision D1: ok. 1A 2B 3A");
  await page.keyboard.press("Meta+Enter");
  await expect.poll(async () => (await written(page, 183)).answer).toBe("Decision D1: ok. 1A 2B 3A");
  expect(sent).toHaveLength(1);
  await expect(page.getByTestId("cover-meta")).not.toContainText("#183"); // Focus moved on
});

test("Focus: a failed send says so in the send bar and keeps the picks; Send again writes them", async ({ page }) => {
  let fail = true;
  await page.route("**/api/cards/acme/app/184/answer", (r) => (fail ? r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) }) : r.continue()));
  await startFocusOn(page, 184);
  await page.keyboard.press("1");
  await page.getByTestId("send").click();
  const bar = page.getByTestId("sendbar");
  await expect(bar.getByTestId("not-sent")).toHaveText("Not sent. boom");
  await expect(bar.getByTestId("send")).toHaveText(/Send again/);
  await expect(page.getByTestId("step-1")).toContainText("1BackoffA");
  fail = false;
  await bar.getByTestId("send").click();
  await expect.poll(async () => (await written(page, 184)).answer).toBe("Decision D1: ok. 1A");
});

test("Focus: a one-question decision keeps sending on a click", async ({ page }) => {
  await startFocusOn(page, 105);
  await expect(page.getByTestId("cover-decision")).toBeVisible();
  await expect(page.getByTestId("tile-writes-2")).toHaveText("Decision D1: B");
  await page.getByTestId("tile-2").click();
  await expect.poll(async () => (await written(page, 105)).answer).toBe("Decision D1: B");
});

test("Focus: one question with a ★ option: a click on the ★ tile sends it, a typed answer is written as the sheet writes it", async ({ page }) => {
  // the sheet: ★ counts as picked, the note follows it
  await open(page, 185);
  await page.getByTestId("note-add").click();
  await page.getByTestId("note").fill("with H1's outlines");
  await expect(writes(page)).toHaveText("Decision D1: H1 Sunlit Outline. with H1's outlines");
  // Focus reads the same draft and writes the same comment
  await page.keyboard.press("Escape");
  await page.keyboard.press("f");
  await page.getByTestId("focus-overview").locator('button[data-card="acme/app#185"]').click();
  await expect(page.getByTestId("cover-decision")).toBeVisible();
  await expect(page.getByTestId("sendbar").getByTestId("writes")).toHaveText("Decision D1: H1 Sunlit Outline. with H1's outlines");
});

test("Focus: a click on the ★ option of a one-question decision sends it", async ({ page }) => {
  await startFocusOn(page, 185);
  await expect(page.getByTestId("tile-1")).toBeVisible();
  // the ★ of a key of several words is read as the sheet reads it; the only tile with ★ Recommended, its reason once under the tiles
  await expect(page.getByTestId("tile-1").locator(".tile-rec")).toHaveText("Recommended");
  await expect(page.locator(".tile-rec")).toHaveCount(1);
  await expect(page.getByTestId("why")).toContainText("It keeps the clear outlines you liked");
  await expect(page.locator(".tile-check")).toHaveCount(0); // a click sends: no check on the preselected tile
  await page.keyboard.press("n");
  await expect(page.getByTestId("tile-1").locator(".tile-check")).toHaveCount(1); // with the note open a click only picks
  await page.keyboard.press("Escape"); // leaves the field
  await page.keyboard.press("Escape"); // cancels the note
  await expect(page.getByTestId("note")).toHaveCount(0);
  // an option's Markdown is rendered, not shown raw
  await expect(page.getByTestId("tile-2").locator(".tile-text code")).toHaveText("Jetzt");
  await expect(page.getByTestId("tile-2")).not.toContainText("`");
  // an option without a short key is no heading: its digit heads the tile, the line reads at text size
  await expect(page.getByTestId("tile-4").locator(".tile-top b")).toHaveCount(0);
  await expect(page.getByTestId("tile-4").locator(".tile-text")).toContainText("Or a mix");
  await expect(page.getByTestId("tile-1").locator(".tile-top b")).toHaveText("H1 Sunlit Outline");
  await page.getByTestId("tile-1").click();
  await expect.poll(async () => (await written(page, 185)).answer).toBe("Decision D1: H1 Sunlit Outline");
});
