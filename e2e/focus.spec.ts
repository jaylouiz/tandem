import { expect, test, type Page } from "./fixtures.ts";

// Focus ("Covers", components/focus/): Waiting on me, one ask per screen, composed for its kind. It starts on what waits, an option
// sends on a click or its digit and shows the comment it writes, a note is the second path, and it ends on a receipt.
const list = (page: Page) => page.getByTestId("waiting-list");
const focus = (page: Page) => page.getByTestId("focus");
const overview = (page: Page) => page.getByTestId("focus-overview");
const bar = (page: Page) => page.getByTestId("sendbar");
const count = (page: Page) => page.getByTestId("focus-count");
/** The ask on screen is this Card's (its one-line chrome names it). */
const on = (page: Page, n: number) => expect(page.getByTestId("cover-meta")).toContainText(`#${n}`);
const row = (page: Page, n: number) => overview(page).locator(`button[data-card="acme/app#${n}"]`);
const loaded = (page: Page) => expect(list(page).locator(".qrow").first()).toBeVisible();
/** The comments on a demo Card, as the server holds them: what was really written. */
const answers = async (page: Page, n: number) => {
  const board = (await (await page.request.get("/api/board")).json()) as { cards: { key: string; requests: { answer: string | null }[]; awaitingPickup: boolean; labels: string[] }[] };
  const card = board.cards.find((c) => c.key === `acme/app#${n}`)!;
  return { answers: card.requests.map((r) => r.answer), pickup: card.awaitingPickup, labels: card.labels };
};

async function start(page: Page) {
  await page.goto("/waiting");
  await loaded(page);
  await page.keyboard.press("f");
  await expect(overview(page)).toBeVisible();
}

test("Focus fills the window and starts on what waits: counts by kind and the list; ↵ starts, j, k and the arrows step, Esc leads back", async ({ page }) => {
  await page.goto("/waiting");
  await loaded(page);
  const blockers = await list(page).locator('.qrow:not([data-kind="look"]):not([data-kind="pickup"])').count();
  const total = await list(page).locator('.qrow:not([data-kind="pickup"])').count();
  await page.getByTestId("focus-start").click(); // the list's own "Go through them one by one"
  await expect(overview(page)).toBeVisible();
  await expect(list(page)).toHaveCount(0);
  // the window is Focus's: sidebar and top bar step aside
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator(".topbar")).toBeHidden();
  expect((await focus(page).boundingBox())!.width).toBe(1440);
  await expect(overview(page).getByRole("heading", { level: 1 })).toHaveText(`${blockers} Cards wait on you`);
  await expect(overview(page)).toContainText(/4 PR approvals, \d+ Decisions, \d+ Design rounds, \d+ to look at\. Closest to Done first\./);
  await expect(overview(page).locator(".start-list button")).toHaveCount(total);
  await expect(page).toHaveURL(/\/waiting$/); // nothing is open yet

  await page.keyboard.press("Enter");
  await on(page, 106);
  await expect(page.getByTestId("cover-pr-approval")).toBeVisible();
  await expect(count(page)).toHaveText(`1 of ${total}`);
  await expect(page.getByTestId("focus-pips").locator("button")).toHaveCount(total);
  await expect(page.getByTestId("focus-next")).toContainText("Stability demo: PR approval");
  await expect(page.getByTestId("triage")).toHaveCount(0); // the cover is the ask alone
  await page.keyboard.press("j");
  await on(page, 173);
  await expect(count(page)).toHaveText(`2 of ${total}`);
  await page.keyboard.press("ArrowRight");
  await on(page, 177);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("k");
  await on(page, 106);
  await page.getByTestId("focus-next").click();
  await on(page, 173);
  await page.getByTestId("focus-pips").locator("button").nth(4).click(); // a pip jumps to any Card
  await on(page, 170);
  // Esc: back to the overview, then out; the list has nothing open
  await page.keyboard.press("Escape");
  await expect(overview(page)).toBeVisible();
  await row(page, 177).click(); // a row opens that Card
  await on(page, 177);
  await page.getByTestId("focus-back").click();
  await page.keyboard.press("Escape");
  await expect(focus(page)).toHaveCount(0);
  await expect(list(page)).toBeVisible();
  await expect(page.locator(".sidebar")).toBeVisible();
});

test("a digit sends a decision at once: the tile showed the comment that is written, the next ask opens and the answered one is done", async ({ page }) => {
  await start(page);
  await row(page, 170).click();
  await expect(page.getByTestId("cover-decision").getByRole("heading", { level: 1 })).toHaveText("Which option for stability demo 1?");
  // every option shows, before it is clicked, the exact comment it will write
  await expect(page.getByTestId("tile-writes-1")).toHaveText("D1: A");
  await expect(page.getByTestId("tile-writes-2")).toHaveText("D1: B");
  await expect(page.getByTestId("tile-2")).toContainText("The agent recommends this, confidence medium");
  await expect(bar(page)).toContainText("sends it at once");
  const total = (await count(page).textContent())!.split(" of ")[1]!;
  await page.keyboard.press("2");
  await on(page, 127); // the next open ask
  await expect(count(page)).toHaveText(`6 of ${total}`);
  await expect(page.getByTestId("focus-pips").locator('button[data-state="done"]')).toHaveCount(1);
  await expect.poll(async () => (await answers(page, 170)).answers).toEqual(["D1: B"]);
  expect((await answers(page, 170)).pickup).toBe(true);
  await expect(page.locator(".toast")).toHaveCount(0); // the next ask says it went through
});

test("a click sends a PR approval; its evidence is read from the PR body; Hold merge sends too", async ({ page }) => {
  await start(page);
  await page.keyboard.press("Enter");
  await on(page, 106);
  const facts = page.getByTestId("facts");
  await expect(facts).toContainText("Why it stopped");
  await expect(facts).toContainText("Merge held: the PR touches the sync store (risk area).");
  await expect(facts.locator(".fact", { hasText: "Verification" }).locator("li")).toHaveText(["unit 212/212", "e2e 31/31"]);
  await expect(facts.locator(".fact", { hasText: "Review" })).toContainText("No findings above low.");
  await expect(facts.getByRole("link", { name: /PR #210: diff on GitHub/ })).toHaveAttribute("href", /pull\/210\/files$/);
  await expect(page.getByTestId("tile-writes-1")).toHaveText("D1: Approve: merge");
  await expect(page.getByTestId("tile-writes-2")).toHaveText("D1: Hold");
  await expect(page.getByTestId("tile-writes-3")).toHaveText("D1: Send back. your note");
  await page.getByTestId("tile-1").click();
  await on(page, 173);
  await expect.poll(async () => (await answers(page, 106)).answers).toEqual(["D1: Approve: merge"]);
  // a PR body without a Verification section says so
  await expect(page.getByTestId("facts").locator(".fact", { hasText: "Verification" })).toContainText("Nothing reported");
  await page.getByTestId("tile-2").click();
  await on(page, 177);
  await expect.poll(async () => (await answers(page, 173)).answers).toEqual(["D1: Hold"]);
  expect((await answers(page, 173)).labels).toContain("do-not-merge");
});

test("Send back opens the note instead of sending and cannot be sent without one", async ({ page }) => {
  await start(page);
  await page.keyboard.press("Enter");
  await on(page, 106);
  await page.keyboard.press("3");
  await expect(page.getByTestId("note")).toBeFocused();
  await on(page, 106); // nothing was sent
  expect((await answers(page, 106)).answers).toEqual([null]);
  await expect(page.getByTestId("tile-3")).toHaveAttribute("aria-pressed", "true");
  const send = page.getByTestId("send");
  await expect(send).toHaveAttribute("aria-disabled", "true");
  await expect(send).toHaveAttribute("title", "Send back needs a note");
  await page.keyboard.press("ControlOrMeta+Enter"); // from the field: still nothing to send
  await on(page, 106);
  await page.getByTestId("note").fill("the empty state is missing");
  await expect(page.getByTestId("writes")).toHaveText("D1: Send back. the empty state is missing");
  await expect(bar(page)).toContainText("Writes on app#106");
  await page.keyboard.press("ControlOrMeta+Enter");
  await on(page, 173);
  await expect.poll(async () => (await answers(page, 106)).answers).toEqual(["D1: Send back. the empty state is missing"]);
});

test("Answer with a note: options only pick, the Send bar shows the whole comment, ⌘↵ sends, Esc cancels", async ({ page }) => {
  await start(page);
  await row(page, 170).click();
  await page.keyboard.press("n");
  await expect(page.getByTestId("note")).toBeFocused();
  await page.getByTestId("note").fill("keep the undo toast");
  await expect(page.getByTestId("writes")).toHaveText("D1: keep the undo toast"); // a note alone is an answer
  await page.keyboard.press("Escape"); // leaves the field, keeps the text
  await page.keyboard.press("2"); // picks, does not send
  await on(page, 170);
  await expect(page.getByTestId("tile-2")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("writes")).toHaveText("D1: B. keep the undo toast");
  await expect(page.getByTestId("tile-writes-2")).toHaveCount(0); // the bar shows the comment now
  expect((await answers(page, 170)).answers).toEqual([null]);
  await page.getByTestId("tile-1").click(); // a click picks too
  await expect(page.getByTestId("writes")).toHaveText("D1: A. keep the undo toast");
  // Esc cancels the note: back to one click per option, nothing kept
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("note")).toHaveCount(0);
  await expect(page.getByTestId("tile-writes-1")).toHaveText("D1: A");
  await on(page, 170);
  // again, and send it this time
  await page.getByTestId("note-open").click();
  await page.getByTestId("note").fill("with a note");
  await page.getByTestId("tile-2").click();
  await page.getByTestId("send").click();
  await on(page, 127);
  await expect.poll(async () => (await answers(page, 170)).answers).toEqual(["D1: B. with a note"]);
});

test("a design round shows its screenshot at real size; a pick sends at once, a reject goes through the comment", async ({ page }) => {
  await start(page);
  await row(page, 118).click();
  const round = page.getByTestId("cover-design-round");
  await expect(round.getByRole("tab")).toHaveText([/a\s*Grouped list/, /b\s*Split pane/, /c\s*Cards grid/]);
  const img = page.getByTestId("stage").locator("img");
  await expect(img).toHaveAttribute("alt", "R1 · a · desktop");
  // never scaled up, scaled down only to the width there is
  const size = () => img.evaluate((el: HTMLImageElement) => ({ natural: el.naturalWidth, shown: el.getBoundingClientRect().width, room: el.closest(".stage")!.clientWidth }));
  await expect.poll(async () => (await size()).natural).toBe(1280);
  expect((await size()).shown).toBe(1280); // 1440 wide: the desktop screenshot fits as it is
  await page.keyboard.press("v");
  await expect(img).toHaveAttribute("alt", "R1 · a · mobile");
  await expect.poll(async () => (await size()).shown).toBe(390); // the mobile one is not blown up to the stage
  await page.keyboard.press("]");
  await expect(img).toHaveAttribute("alt", "R1 · b · mobile"); // the viewport is kept across variants
  await expect(round.getByRole("tab", { selected: true })).toContainText("Split pane");
  await page.keyboard.press("v");
  await page.keyboard.press("[");
  await expect(img).toHaveAttribute("alt", "R1 · a · desktop");
  await page.keyboard.press("t"); // side by side: all variants, each with its buttons
  await expect(page.getByTestId("stage").locator("img")).toHaveCount(3);
  await expect(page.getByTestId("pick-c")).toHaveText(/Send pick c/);
  await page.keyboard.press("t");
  await expect(page.getByTestId("gallery")).toHaveCount(0); // Focus never opens the gallery dialog

  // a reject is not sent by itself: it opens the comment, where picks and rejects only mark
  await page.keyboard.press("x");
  await expect(page.getByTestId("note")).toBeFocused();
  await on(page, 118);
  await expect(page.getByTestId("writes")).toHaveText("R1:\n- reject: a");
  await page.getByTestId("note").fill("header from a");
  await page.keyboard.press("Escape");
  await page.keyboard.press("2"); // picks b, sends nothing
  await on(page, 118);
  await expect(page.getByTestId("writes")).toHaveText("R1:\n- pick: b\n- reject: a\n\nheader from a");
  await page.keyboard.press("ControlOrMeta+Enter");
  await on(page, 175);
  await expect(page.getByTestId("receipt")).toHaveCount(0);

  // one pick is an answer of its own: Send pick on the image sends it
  await page.keyboard.press("]");
  await expect(page.getByTestId("pick-b")).toHaveText(/Send pick b/);
  await page.getByTestId("pick-b").click();
  await on(page, 178);
  await page.keyboard.press("3"); // and so does the variant's digit
  await on(page, 179);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  for (const n of [118, 175, 178]) await expect(page.locator(`[data-card="acme/app#${n}"]`)).toHaveAttribute("data-kind", "pickup");
});

test("Focus does not mark a Look Seen by passing it; l and Mark Seen do, and move on; its screenshot steps by state", async ({ page }) => {
  await page.goto("/waiting");
  await loaded(page);
  const looks = await list(page).locator('.qrow[data-kind="look"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-card")!));
  expect(looks.length).toBeGreaterThan(2);
  const num = (key: string) => Number(key.split("#")[1]);
  await page.keyboard.press("f");
  await overview(page).locator(`button[data-card="${looks[0]}"]`).click();
  await on(page, num(looks[0]!));
  const look = page.getByTestId("cover-look");
  await expect(look.getByRole("heading", { level: 1 })).toHaveText("Settings page shows the new theme switch");
  await expect(look).toContainText("The switch follows the system theme by default");
  await expect(bar(page)).toContainText("Nothing is written to GitHub. The Card leaves the Board 7 days after it is Seen.");
  const img = page.getByTestId("stage").locator("img");
  await expect(img).toHaveAttribute("alt", "look · desktop · default");
  await page.keyboard.press("]");
  await expect(img).toHaveAttribute("alt", "look · desktop · empty");
  await page.keyboard.press("[");
  await page.keyboard.press("v");
  await expect(img).toHaveAttribute("alt", "look · mobile · default");
  await page.keyboard.press("j"); // passing it marks nothing
  await on(page, num(looks[1]!));
  await page.getByTestId("focus-seen").click();
  await on(page, num(looks[2]!));
  await page.keyboard.press("l"); // the key does the same
  await on(page, num(looks[3]!));
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  const left = await list(page).locator('.qrow[data-kind="look"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-card")!));
  expect(left).toContain(looks[0]); // passed, not Seen
  expect(left).not.toContain(looks[1]);
  expect(left).not.toContain(looks[2]);
});

test("a failed send stays on its Card: Not sent with the reason, the answer kept, no toast beside it, ⌘↵ sends again", async ({ page }) => {
  // intercepts go in before the page loads: one registered a few ms before the key that sends is not always in force yet (it let the write through under load)
  await page.route("**/api/cards/acme/app/170/answer", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) }));
  await start(page);
  await row(page, 170).click();
  await page.keyboard.press("2");
  await expect(page.getByTestId("not-sent")).toHaveText("Not sent. boom");
  await on(page, 170); // Focus did not move on
  await expect(page.getByTestId("tile-2")).toHaveAttribute("data-picked", "true"); // the option stays picked
  await expect(page.getByTestId("writes")).toHaveText("D1: B");
  await expect(page.getByTestId("send")).toHaveText(/Send again/);
  await expect(page.locator(".toast")).toHaveCount(0);
  await expect(page.getByTestId("focus-pips").locator('button[data-state="done"]')).toHaveCount(0);
  await page.keyboard.press("j"); // elsewhere its pip says it
  await expect(page.getByTestId("focus-pips").locator('button[data-state="failed"]')).toHaveCount(1);
  await page.keyboard.press("k");
  await expect(page.getByTestId("not-sent")).toBeVisible();
  await page.unroute("**/api/cards/acme/app/170/answer");
  await page.keyboard.press("ControlOrMeta+Enter");
  await on(page, 127);
  await expect.poll(async () => (await answers(page, 170)).answers).toEqual(["D1: B"]);
  await expect(page.getByTestId("focus-pips").locator('button[data-state="failed"]')).toHaveCount(0);
});

test("an option cannot send twice: while the write is under way the ask stays, says Sending, and clicks and digits do nothing", async ({ page }) => {
  let posts = 0;
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/api/cards/acme/app/170/answer", async (r) => {
    posts++;
    await held;
    await r.continue();
  });
  await start(page);
  await row(page, 170).click();
  await page.keyboard.press("1");
  await expect(bar(page)).toHaveAttribute("data-state", "sending");
  await expect(bar(page)).toContainText("Sending…");
  await on(page, 170); // the ask stays until the write is through
  await page.keyboard.press("1");
  await page.keyboard.press("2");
  await page.getByTestId("tile-2").click({ force: true });
  await expect(page.getByTestId("tile-2")).toHaveAttribute("aria-disabled", "true");
  await on(page, 170);
  release();
  await on(page, 127);
  expect(posts).toBe(1);
  await expect.poll(async () => (await answers(page, 170)).answers).toEqual(["D1: A"]);
});

test("a held digit answers one ask, not the next ones too", async ({ page }) => {
  await start(page);
  await row(page, 170).click();
  await page.keyboard.down("1"); // sends A on #170
  await on(page, 127);
  await page.keyboard.down("1"); // the key is still down: the browser repeats it on the ask that took the screen
  await page.keyboard.down("1");
  await page.keyboard.up("1");
  await on(page, 127);
  await expect(bar(page)).toHaveAttribute("data-state", "hint");
  await expect.poll(async () => (await answers(page, 170)).answers).toEqual(["D1: A"]);
  expect((await answers(page, 127)).pickup).toBe(false);
  await page.keyboard.press("1"); // a fresh press does send
  await on(page, 171);
});

test("a send that fails after the developer moved on says so in a toast; back on the ask its Send bar offers Send again", async ({ page }) => {
  let fail!: () => void;
  const held = new Promise<void>((r) => (fail = r));
  await page.route("**/api/cards/acme/app/170/answer", async (r) => {
    await held;
    await r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) });
  });
  await start(page);
  await row(page, 170).click();
  await page.keyboard.press("2");
  await expect(bar(page)).toHaveAttribute("data-state", "sending");
  await page.keyboard.press("j"); // on to the Card that Up next named, while the write is under way
  await on(page, 127);
  fail();
  await expect(page.locator(".toast", { hasText: "Failed: boom" })).toBeVisible();
  await on(page, 127); // not pulled back
  await expect(page.getByTestId("focus-pips").locator('button[data-state="failed"]')).toHaveCount(1);
  await page.keyboard.press("k");
  await on(page, 170);
  await expect(page.getByTestId("not-sent")).toHaveText("Not sent. boom");
  await expect(page.getByTestId("writes")).toHaveText("D1: B");
});

test("an ask answered somewhere else while it is on screen is not swapped for the next one under the keyboard", async ({ page }) => {
  await start(page);
  await row(page, 170).click();
  await on(page, 170);
  // answered on GitHub or in a terminal: the snapshot takes the Card out of the queue
  const res = await page.request.post("/api/cards/acme/app/170/answer", { data: { requestId: "D1", answer: "A", push: false }, headers: { "x-tandem": "1" } });
  expect(res.ok()).toBe(true);
  const gone = page.getByTestId("cover-gone");
  await expect(gone).toContainText("This ask is no longer open");
  await page.keyboard.press("2"); // a digit meant for #170 reaches no other ask
  await page.keyboard.press("1");
  await expect(gone).toBeVisible();
  expect((await answers(page, 127)).pickup).toBe(false);
  await page.keyboard.press("Enter"); // the developer goes on by themselves
  await on(page, 127);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  expect((await answers(page, 127)).pickup).toBe(false);
});

test("a Card opened from the palette while the start is on screen opens as its ask", async ({ page }) => {
  await start(page);
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Type a command or search Cards…").fill("Retry policy for sync");
  await page.keyboard.press("Enter");
  await on(page, 127);
  await expect(page.getByTestId("cover-decision")).toBeVisible();
});

test("the end is a receipt: every Card answered in this Focus with the comment written, every Look marked Seen", async ({ page }) => {
  await page.goto("/waiting");
  await loaded(page);
  const rows = await list(page).locator('.qrow:not([data-kind="pickup"])').evaluateAll((els) => els.map((e) => [e.getAttribute("data-card")!, e.getAttribute("data-kind")!] as const));
  expect(rows.length).toBeGreaterThan(20);
  await page.keyboard.press("f");
  await page.keyboard.press("Enter");
  // one key per Card, in the list's order: each answer brings the next open ask
  for (const [key, kind] of rows) {
    await on(page, Number(key.split("#")[1]));
    await expect(focus(page)).toHaveAttribute("data-kind", kind);
    await expect(bar(page)).not.toHaveAttribute("data-state", "sending");
    await page.keyboard.press(kind === "look" ? "l" : "1");
  }
  const done = page.getByTestId("focus-done");
  await expect(done.getByRole("heading", { level: 1 })).toHaveText("All clear");
  await expect(page.getByTestId("receipt").locator("li")).toHaveCount(rows.length);
  const blockers = rows.filter(([, k]) => k !== "look").length;
  const seen = rows.length - blockers;
  await expect(done).toContainText([blockers ? `${blockers} answered` : "", seen ? `${seen} marked Seen` : ""].filter(Boolean).join(" and "));
  for (const [key, kind] of rows) {
    const line = page.getByTestId("receipt").locator("li", { hasText: `#${key.split("#")[1]}` });
    if (kind === "look") await expect(line).toContainText("Marked Seen");
    else await expect(line.locator("code")).toHaveText(/^(D\d+: \S+|R\d+:\n- pick: \S+)/);
  }
  await expect(done.getByRole("button", { name: /Open the Board/ })).toBeVisible();
  await done.getByRole("button", { name: /Agent activity/ }).click();
  await expect(page.getByRole("dialog", { name: "Agent activity" })).toBeVisible();
});

test("coming back: the start says what is new since Focus was last left and lists the older open asks under Still waiting", async ({ page }) => {
  await page.goto("/waiting");
  await loaded(page);
  // Focus was last left five hours ago: the PR approvals (2h) and the newest decision (3h) came after, the rest waited before
  await page.evaluate(() => localStorage.setItem("tandem.focus.left", new Date(Date.now() - 5 * 3_600_000).toISOString()));
  await page.keyboard.press("f");
  await expect(overview(page).getByRole("heading", { level: 1 })).toHaveText(/^\d+ new since \d\d:\d\d$/);
  const fresh = overview(page).getByRole("list", { name: "New" });
  const older = overview(page).getByRole("list", { name: "Still waiting" });
  await expect(fresh.locator('button[data-card="acme/app#106"]')).toBeVisible();
  await expect(fresh.locator('button[data-card="acme/app#170"]')).toHaveCount(0);
  await expect(older.locator('button[data-card="acme/app#170"]')).toBeVisible();
  await expect(overview(page).getByRole("heading", { name: "Still waiting" })).toBeVisible();
  await expect(overview(page)).toContainText(/from before still wait/);
  // leaving Focus keeps the time (one localStorage entry): right after, nothing is new, so the start counts what waits
  await page.keyboard.press("Escape");
  await expect(focus(page)).toHaveCount(0);
  const left = await page.evaluate(() => localStorage.getItem("tandem.focus.left"));
  expect(Date.now() - Date.parse(left!)).toBeLessThan(60_000);
  await page.keyboard.press("f");
  await expect(overview(page).getByRole("heading", { level: 1 })).toHaveText(/Cards wait on you$/);
  await expect(overview(page).getByRole("list", { name: "Still waiting" })).toHaveCount(0);
  // Start opens the first row of the list: the first new ask, not the oldest open one
  await page.keyboard.press("Escape");
  await page.evaluate(() => localStorage.setItem("tandem.focus.left", new Date(Date.now() - 90 * 60_000).toISOString()));
  await page.keyboard.press("f");
  await expect(overview(page).getByRole("heading", { level: 1 })).toHaveText(/^1 new since/);
  await expect(overview(page).getByRole("list", { name: "New" }).locator("button")).toHaveAttribute("data-card", "acme/app#176");
  await page.keyboard.press("Enter");
  await on(page, 176);
});

test("f starts Focus from the Board; with nothing waiting it says so, with the two ways on", async ({ page }) => {
  await page.goto("/board");
  await expect(page.locator(".card").first()).toBeVisible();
  await page.locator('.card[data-card="acme/app#170"]').click(); // a Card is open on the Board
  await page.keyboard.press("f");
  await expect(page).toHaveURL(/\/waiting$/);
  await expect(overview(page)).toBeVisible(); // the start, not that Card
  await page.keyboard.press("Escape");
  await expect(list(page)).toBeVisible();

  await page.goto("/waiting?repo=acme/agent-workflow"); // a repo without blockers or Looks
  await expect(page.getByTestId("filtered-empty")).toBeVisible();
  await page.keyboard.press("f");
  const done = page.getByTestId("focus-done");
  await expect(done).toContainText("Nothing waits on you");
  await expect(done).toContainText("Agents are on it. New asks show up here and as a notification.");
  await expect(done.getByRole("button", { name: /Agent activity/ })).toBeVisible();
  await page.keyboard.press("Enter"); // nothing to start
  await expect(done).toBeVisible();
  await done.getByRole("button", { name: /Open the Board/ }).click();
  await expect(page).toHaveURL(/\/board/);
  await expect(focus(page)).toHaveCount(0);
});

test("in Focus the Selection, tab and triage keys leave the Card behind the ask alone; o, c, ? and g chords keep working", async ({ page }) => {
  await start(page);
  await row(page, 170).click();
  for (const key of ["x", "[", "]", "d", "s", "b", "h", "a", "w", "m", "i", "0", "ControlOrMeta+a"]) await page.keyboard.press(key);
  await on(page, 170);
  await expect(page.locator(".toast")).toHaveCount(0); // no move, no priority, no hold
  await expect(page.getByTestId("mark-bar")).toHaveCount(0);
  expect((await answers(page, 170)).labels).not.toContain("on-hold");
  await page.keyboard.press("?");
  await expect(page.getByTestId("shortcuts")).toBeVisible();
  await expect(page.getByTestId("shortcuts-Focus").locator('[data-binding="focus-details"]')).toContainText("e");
  await expect(page.getByTestId("shortcuts-Focus").locator('[data-binding="focus-side"]')).toContainText("t");
  await page.keyboard.press("Escape");
  await page.keyboard.press("c");
  await expect(page.getByRole("dialog", { name: /Capture/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await on(page, 170);
  const popup = page.waitForEvent("popup");
  await page.keyboard.press("o");
  expect((await popup).url()).toContain("/issues/170");
  await page.keyboard.press("g");
  await page.keyboard.press("b");
  await expect(page).toHaveURL(/\/board/);
  await expect(focus(page)).toHaveCount(0);
});

test("the drawer behind e shows the Card's Decided, Activity and Issue tabs; Esc closes it first, then the note, then the overview", async ({ page }) => {
  await start(page);
  await row(page, 127).click(); // carries new agent decisions
  const line = page.getByTestId("decisions-line");
  await expect(line).toHaveText("2 agent decisions, not blocking");
  await line.click();
  const drawer = page.getByTestId("focus-drawer");
  await expect(drawer.getByRole("tab")).toHaveText(["Decided", "Activity", "Issue"]); // not Now: the ask is on the cover
  await expect(drawer.getByRole("tab", { selected: true })).toHaveText("Decided");
  await expect(drawer.getByTestId("panel-agent-decision")).toBeVisible();
  await expect(drawer.getByTestId("panel-decision")).toHaveCount(0); // no second Feedback panel
  await expect.poll(() => drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true); // the library moves focus a frame later
  // a digit here belongs to the agent decisions, never to the ask under the drawer
  await page.keyboard.press("1");
  await expect(drawer.getByRole("button", { name: /Accept all/ })).toHaveAttribute("aria-pressed", "true");
  expect((await answers(page, 127)).answers.every((a) => a === null || !/^D3/.test(a))).toBe(true);
  await page.keyboard.press("]");
  await expect(drawer.getByRole("tab", { selected: true })).toHaveText("Activity");
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await on(page, 127);
  // the digits are the ask's again
  await page.keyboard.press("e");
  await expect(drawer.getByRole("tab", { selected: true })).toHaveText("Activity");
  await page.keyboard.press("Escape");
  await page.keyboard.press("n");
  await page.keyboard.press("e"); // typed into the note
  await expect(page.getByTestId("note")).toHaveValue("e");
  await page.keyboard.press("Escape"); // leaves the field
  await page.keyboard.press("e");
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape"); // 1: the drawer
  await expect(drawer).toHaveCount(0);
  await expect(page.getByTestId("note")).toBeVisible();
  await page.keyboard.press("Escape"); // 2: the note
  await expect(page.getByTestId("note")).toHaveCount(0);
  await on(page, 127);
  await page.keyboard.press("Escape"); // 3: the overview
  await expect(overview(page)).toBeVisible();
  await page.keyboard.press("Escape"); // 4: out
  await expect(focus(page)).toHaveCount(0);
});

test("an earlier round's gallery opened from the drawer owns its keys: they reach neither the drawer nor the ask, and Esc closes one layer at a time", async ({ page }) => {
  await start(page);
  await row(page, 110).click(); // round 2 waits, round 1 is on Decided
  await expect(page.getByTestId("stage").locator("img")).toHaveAttribute("alt", "R2 · a · desktop");
  await page.keyboard.press("e");
  const drawer = page.getByTestId("focus-drawer");
  await drawer.getByRole("tab", { name: "Decided" }).click();
  await drawer.getByTestId("round-1").locator(".thumb").first().click();
  const gallery = page.getByTestId("gallery");
  await expect(gallery).toBeVisible();
  await expect.poll(() => gallery.evaluate((el) => el.contains(document.activeElement))).toBe(true); // the library moves focus a frame later
  await page.keyboard.press("]"); // the gallery's next variant, not the drawer's next tab
  await expect(page.getByTestId("gallery-title")).toContainText("Variant b");
  await page.keyboard.press("2"); // the gallery's jump, not a pick on the ask
  await page.keyboard.press("ControlOrMeta+Enter"); // a read-only gallery sends nothing
  await page.keyboard.press("Escape");
  await expect(gallery).toHaveCount(0);
  await expect(drawer.getByRole("tab", { selected: true })).toHaveText("Decided");
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await on(page, 110);
  await expect(page.getByTestId("stage").locator("img")).toHaveAttribute("alt", "R2 · a · desktop"); // the ask did not move
  await expect(bar(page)).toHaveAttribute("data-state", "hint");
  expect((await answers(page, 110)).pickup).toBe(false);
});

test("the palette lists what the Focus keys do on the ask that is on screen, and says what a digit does", async ({ page }) => {
  await page.goto("/waiting");
  await loaded(page);
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("one card at a time");
  await page.keyboard.press("Enter");
  await expect(overview(page)).toBeVisible();
  const option = (name: RegExp) => page.getByRole("option", { name });
  await page.keyboard.press("ControlOrMeta+k");
  await expect(option(/Start with the first Card/)).toContainText("↵");
  await expect(option(/Next step: design/)).toHaveCount(0);
  await option(/Start with the first Card/).click();
  await on(page, 106);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(option(/^Send: Approve the PR/)).toContainText("1"); // a digit sends here
  await expect(option(/Send the PR back, with a note/)).toContainText("3");
  await expect(option(/^Send with a note/)).toContainText("n");
  await expect(option(/Card details: Decided, Activity, Issue/)).toContainText("e");
  await expect(option(/Back to the Focus overview/)).toContainText("esc");
  await expect(option(/Mark the open Card/)).toHaveCount(0);
  await expect(option(/Move to Inbox/)).toHaveCount(0);
  await expect(option(/Tab: Decided/)).toHaveCount(0);
  await option(/^Send with a note/).click();
  await expect(page.getByTestId("note")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(option(/^Approve the PR/)).toContainText("1"); // with the note open a digit picks
  await expect(option(/Cancel the note/)).toContainText("esc");
  await option(/Cancel the note/).click();
  await expect(page.getByTestId("note")).toHaveCount(0);
  await page.getByTestId("focus-back").click();
  await row(page, 118).click();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(option(/Send pick b/)).toContainText("2");
  await expect(option(/All variants side by side/)).toContainText("t");
  await expect(option(/Next variant/)).toContainText("]");
  await expect(option(/Reject variant a$/).first()).toBeVisible();
  await page.getByPlaceholder("Type a command or search Cards…").fill("leave focus");
  await page.keyboard.press("Enter");
  await expect(focus(page)).toHaveCount(0);
});
